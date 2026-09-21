import {
  ENERGY_UP_GAIN,
  type BattleState,
  type Pos,
  type ResolveStep,
  type Side,
  type SlotResult,
} from '../../../../../shared/cb/types';
import { ENERGY_UP_ID, getCard, handIdsFor } from '../data/cards';
import { maxEnOf, playerOf, shuffled } from './battleState';
import { beginSelecting } from './characterSelect';
import {
  applyAttacks,
  computeAttack,
  isAttack,
  resolveNonAttack,
  snapshotFor,
  toAttackStep,
  type AttackOutcome,
} from './actionResolver';
import { clearGuards } from './guardResolver';
import { checkAutoPickLoss, checkHpEnd, checkTurnLimit, noteAutoPick, noteManualPick } from './winResolver';

/**
 * 한 턴의 제출과 해결 (기준서 4번, 5-2, 6번).
 *
 * 카드 번호가 가장 우선이다. 같은 번호 안에서는
 *   1. 비공격 먼저 (이동·Guard·Perfect Guard·Heal·Energy Up)
 *   2. 양쪽 비공격이면 1P → 2P
 *   3. 한쪽만 비공격이면 그쪽 먼저
 *   4. 양쪽 공격이면 같은 스냅샷으로 동시 판정
 */

export const SIDES: readonly Side[] = ['p1', 'p2'];

export interface SubmissionCheck {
  ok: boolean;
  reason?: string;
}

/**
 * 제출 검증. 순서대로 가상 실행했을 때 매 행동 직전의 기력이 비용 이상이어야 한다.
 * Energy Up 처럼 앞선 카드가 기력을 바꾸는 효과도 반영한다.
 */
export function validateSubmission(state: BattleState, side: Side, cardIds: readonly string[]): SubmissionCheck {
  if (state.phase !== 'selecting') return { ok: false, reason: '카드를 고를 단계가 아닙니다' };
  const p = playerOf(state, side);
  if (p.submission) return { ok: false, reason: '이미 제출했습니다' };
  if (!p.characterId) return { ok: false, reason: '캐릭터가 정해지지 않았습니다' };
  if (cardIds.length !== 3) return { ok: false, reason: '카드 3장을 골라야 합니다' };
  if (new Set(cardIds).size !== 3) return { ok: false, reason: '같은 카드를 두 번 고를 수 없습니다' };

  const hand = new Set(handIdsFor(p.characterId));
  const maxEn = maxEnOf(p);
  let en = p.en;

  for (const id of cardIds) {
    if (!hand.has(id)) return { ok: false, reason: `손패에 없는 카드입니다: ${id}` };
    const card = getCard(id);
    if (card.energyCost > en) return { ok: false, reason: `기력이 모자랍니다: ${id}` };
    en -= card.energyCost;
    if (id === ENERGY_UP_ID) en = Math.min(maxEn, en + ENERGY_UP_GAIN);
  }
  return { ok: true };
}

/** 제출 즉시 잠근다. 상대가 아직이어도 바꾸거나 다시 낼 수 없다. */
export function submitCards(state: BattleState, side: Side, cardIds: readonly string[]): void {
  const check = validateSubmission(state, side, cardIds);
  if (!check.ok) throw new Error(check.reason ?? '제출을 받을 수 없습니다');
  const p = playerOf(state, side);
  p.submission = [...cardIds];
  p.submissionAuto = false;
  noteManualPick(state, side);
}

export function bothSubmitted(state: BattleState): boolean {
  return state.p1.submission !== null && state.p2.submission !== null;
}

/**
 * 마감 후 서버가 고르는 유효한 3장.
 * 이동 6장이 전부 기력 0이므로 어떤 상태에서도 3장은 반드시 모인다.
 */
export function randomSubmission(state: BattleState, side: Side): string[] {
  const p = playerOf(state, side);
  if (!p.characterId) throw new Error('캐릭터가 정해지지 않았다');
  const maxEn = maxEnOf(p);
  const picked: string[] = [];
  let en = p.en;
  for (const id of shuffled(state, handIdsFor(p.characterId))) {
    if (picked.length === 3) break;
    const card = getCard(id);
    if (card.energyCost > en) continue;
    picked.push(id);
    en -= card.energyCost;
    if (id === ENERGY_UP_ID) en = Math.min(maxEn, en + ENERGY_UP_GAIN);
  }
  if (picked.length !== 3) throw new Error('유효한 3장을 만들지 못했다');
  return picked;
}

/**
 * 선택 마감. 안 낸 쪽을 자동 선택으로 채우고 연속 횟수를 올린다.
 * 3연속이면 그 자리에서 패배가 확정되므로, 호출한 쪽은 phase 를 다시 봐야 한다.
 */
export function applySelectTimeout(state: BattleState): void {
  for (const side of SIDES) {
    const p = playerOf(state, side);
    if (p.submission) continue;
    p.submission = randomSubmission(state, side);
    p.submissionAuto = true;
    noteAutoPick(state, side);
  }
  checkAutoPickLoss(state);
}

function posSnapshot(state: BattleState): Record<Side, Pos> {
  return { p1: { ...state.p1.pos }, p2: { ...state.p2.pos } };
}

/**
 * 세 슬롯을 순서대로 해결한다. 서버는 결과 전부를 갖고,
 * 뷰가 reveal.slot 까지만 내려보낸다 (기준서 5번, 11-2).
 */
export function resolveTurn(state: BattleState): SlotResult[] {
  const s1 = state.p1.submission;
  const s2 = state.p2.submission;
  if (!s1 || !s2) throw new Error('양쪽 제출이 끝나지 않았다');

  state.phase = 'resolving';
  state.deadline = 0;
  const results: SlotResult[] = [];

  for (let slot = 0; slot < 3; slot++) {
    const ids: Record<Side, string> = { p1: s1[slot], p2: s2[slot] };
    const cards = { p1: getCard(ids.p1), p2: getCard(ids.p2) };
    const steps: ResolveStep[] = [];

    // 1) 비공격을 먼저, 1P → 2P 순으로
    for (const side of SIDES) {
      const card = cards[side];
      if (isAttack(card)) continue;
      if (playerOf(state, side).en < card.energyCost) {
        steps.push({ kind: 'skip', side, cardId: card.id, reason: 'energy' });
        continue;
      }
      steps.push(resolveNonAttack(state, side, card));
    }

    // 2) 공격은 같은 스냅샷으로 동시 판정
    const attackers = SIDES.filter((s) => isAttack(cards[s]));
    if (attackers.length > 0) {
      const snap = snapshotFor(state);
      const outcomes: AttackOutcome[] = [];
      for (const side of attackers) {
        const card = cards[side];
        if (playerOf(state, side).en < card.energyCost) {
          steps.push({ kind: 'skip', side, cardId: card.id, reason: 'energy' });
          continue;
        }
        outcomes.push(computeAttack(snap, side, card));
      }
      applyAttacks(state, outcomes);
      for (const o of outcomes) steps.push(toAttackStep(o));
    }

    // 3) 사망 확인 — 동시 공격 판정이 모두 끝난 뒤에 본다
    const finished = checkHpEnd(state);

    // 4) 방어는 이 슬롯까지만
    clearGuards(state);

    results.push({
      slot,
      cards: ids,
      steps,
      hpAfter: { p1: state.p1.hp, p2: state.p2.hp },
      enAfter: { p1: state.p1.en, p2: state.p2.en },
      posAfter: posSnapshot(state),
      finished,
    });

    if (finished) break;
  }

  state.reveal = { slot: 0, results };
  return results;
}

/** 세 슬롯을 다 열고 나서 — 20턴 상한을 보고 다음 턴으로 넘기거나 판을 끝낸다 */
export function advanceAfterTurn(state: BattleState, now: number): void {
  if (state.phase === 'finished') return;
  if (checkTurnLimit(state)) return;
  state.turn++;
  beginSelecting(state, now);
}
