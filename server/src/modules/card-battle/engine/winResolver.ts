import {
  AUTO_PICK_LOSS_STREAK,
  OTHER,
  TURN_LIMIT,
  type BattleState,
  type EndReason,
  type PlayerState,
  type Side,
} from '../../../../../shared/cb/types';
import { isAI, maxHpOf, playerOf } from './battleState';

/**
 * 판 종료 (기준서 7-1).
 *
 * ① HP 0 — 즉시 종료. 양쪽 다 0 이하면 무승부.
 * ② 20턴 상한 — HP 비율(현재 HP ÷ Max HP)이 높은 쪽 승리, 같으면 무승부.
 * ③ 기권 — onParticipantAbsent 수신, 또는 자동 선택 3연속.
 */

export function hpRatio(p: PlayerState): number {
  const max = maxHpOf(p);
  return max > 0 ? p.hp / max : 0;
}

function end(state: BattleState, winner: Side | 'draw', reason: EndReason): void {
  state.phase = 'finished';
  state.deadline = 0;
  state.result = { winner, reason };
}

/**
 * 슬롯 하나의 모든 처리가 끝난 뒤 사망을 확인한다.
 * 동시 공격 판정이 이미 끝난 상태에서 부르는 것이 전제다 —
 * 한쪽 HP 가 0이 되어도 같은 슬롯의 상대 공격은 취소하지 않는다 (기준서 6번).
 */
export function checkHpEnd(state: BattleState): boolean {
  const d1 = state.p1.hp <= 0;
  const d2 = state.p2.hp <= 0;
  if (!d1 && !d2) return false;
  if (d1 && d2) end(state, 'draw', 'hp');
  else end(state, d1 ? 'p2' : 'p1', 'hp');
  return true;
}

/** 20번째 턴이 끝났는데 양쪽 다 살아 있으면 HP 비율로 가른다 */
export function checkTurnLimit(state: BattleState): boolean {
  if (state.turn < TURN_LIMIT) return false;
  const r1 = hpRatio(state.p1);
  const r2 = hpRatio(state.p2);
  if (r1 === r2) end(state, 'draw', 'turnLimit');
  else end(state, r1 > r2 ? 'p1' : 'p2', 'turnLimit');
  return true;
}

/** 자발 퇴장·부재 처리 → 기권 (기준서 7-1 ③) */
export function forfeit(state: BattleState, side: Side): void {
  if (state.phase === 'finished') return;
  end(state, OTHER[side], 'forfeit');
}

/**
 * 자동 선택이 일어났을 때 연속 횟수를 올린다.
 * AI 는 타임아웃 패배 규칙의 대상이 아니다 (기준서 4번, 10번).
 * 캐릭터 랜덤 배정은 이 카운트에 넣지 않는다 (기준서 2-1) — 그쪽에서 부르지 않는다.
 */
export function noteAutoPick(state: BattleState, side: Side): void {
  const p = playerOf(state, side);
  if (isAI(p)) return;
  p.autoPickStreak++;
}

export function noteManualPick(state: BattleState, side: Side): void {
  playerOf(state, side).autoPickStreak = 0;
}

/** 3연속 자동 선택이면 패배 (기준서 4번) */
export function checkAutoPickLoss(state: BattleState): boolean {
  const l1 = state.p1.autoPickStreak >= AUTO_PICK_LOSS_STREAK;
  const l2 = state.p2.autoPickStreak >= AUTO_PICK_LOSS_STREAK;
  if (!l1 && !l2) return false;
  if (l1 && l2) end(state, 'draw', 'autoPick');
  else end(state, l1 ? 'p2' : 'p1', 'autoPick');
  return true;
}
