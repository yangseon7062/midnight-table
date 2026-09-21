import {
  ENERGY_UP_GAIN,
  HEAL_AMOUNT,
  OTHER,
  type BattleState,
  type CardDef,
  type GuardMode,
  type Pos,
  type ResolveStep,
  type Side,
} from '../../../../../shared/cb/types';
import { maxEnOf, maxHpOf, playerOf } from './battleState';
import { ENERGY_UP_ID, HEAL_ID } from '../data/cards';
import { guardModeOf } from './guardResolver';
import { applyMove } from './movementResolver';
import { computeDamage, isInRange, rangeCells } from './attackResolver';

/**
 * 카드 한 장의 해결.
 *
 * 비공격(이동·Guard·Perfect Guard·Heal·Energy Up)은 상태를 바로 바꾸고,
 * 공격은 "카드 실행 직전의 스냅샷"으로 계산만 해 두었다가 양쪽 것을 함께 적용한다 (기준서 6번).
 */

export function isAttack(card: CardDef): boolean {
  return card.type === 'attack';
}

/** 비공격 카드 한 장을 지금 상태에 적용한다 */
export function resolveNonAttack(state: BattleState, side: Side, card: CardDef): ResolveStep {
  const p = playerOf(state, side);

  if (card.type === 'move') {
    const spec = card.move;
    if (!spec) throw new Error(`이동 카드에 move 가 없다: ${card.id}`);
    const from: Pos = { ...p.pos };
    const out = applyMove(from, spec);
    p.pos = out.to;
    return { kind: 'move', side, cardId: card.id, from, to: { ...out.to }, moved: out.moved, blocked: out.blocked };
  }

  const guard = guardModeOf(card.id);
  if (guard) {
    p.en -= card.energyCost;
    p.guard = guard;
    return { kind: 'guard', side, cardId: card.id, mode: guard, enCost: card.energyCost };
  }

  if (card.id === ENERGY_UP_ID) {
    const before = p.en;
    p.en = Math.min(maxEnOf(p), p.en + ENERGY_UP_GAIN);
    return { kind: 'energy', side, cardId: card.id, gained: p.en - before };
  }

  if (card.id === HEAL_ID) {
    p.en -= card.energyCost;
    const before = p.hp;
    p.hp = Math.min(maxHpOf(p), p.hp + HEAL_AMOUNT);
    return { kind: 'heal', side, cardId: card.id, healed: p.hp - before, enCost: card.energyCost };
  }

  throw new Error(`비공격으로 처리할 수 없는 카드: ${card.id}`);
}

/** 공격 판정에 쓰는, 그 슬롯의 비공격 처리가 끝난 시점의 스냅샷 */
export interface AttackSnapshot {
  pos: Record<Side, Pos>;
  guard: Record<Side, GuardMode>;
}

export function snapshotFor(state: BattleState): AttackSnapshot {
  return {
    pos: { p1: { ...state.p1.pos }, p2: { ...state.p2.pos } },
    guard: { p1: state.p1.guard, p2: state.p2.guard },
  };
}

export interface AttackOutcome {
  side: Side;
  cardId: string;
  enCost: number;
  hit: boolean;
  raw: number;
  reduced: number;
  dealt: number;
  cells: Pos[];
}

/**
 * 공격 하나를 스냅샷 기준으로 계산한다. 상태는 아직 바꾸지 않는다.
 * 빗나가도 기력은 나간다 (기준서 7번).
 */
export function computeAttack(snap: AttackSnapshot, side: Side, card: CardDef): AttackOutcome {
  if (!card.rangePattern) throw new Error(`공격 카드에 범위가 없다: ${card.id}`);
  const from = snap.pos[side];
  const target = snap.pos[OTHER[side]];
  const cells = rangeCells(from, card.rangePattern);
  const hit = isInRange(from, card.rangePattern, target);
  if (!hit) {
    return { side, cardId: card.id, enCost: card.energyCost, hit: false, raw: card.damage, reduced: 0, dealt: 0, cells };
  }
  const dmg = computeDamage(card.damage, snap.guard[OTHER[side]]);
  return { side, cardId: card.id, enCost: card.energyCost, hit: true, raw: card.damage, reduced: dmg.reduced, dealt: dmg.dealt, cells };
}

/** 계산된 공격들을 한꺼번에 적용한다 — 동시 판정 (기준서 6-4) */
export function applyAttacks(state: BattleState, outcomes: readonly AttackOutcome[]): void {
  for (const o of outcomes) {
    playerOf(state, o.side).en -= o.enCost;
  }
  for (const o of outcomes) {
    playerOf(state, OTHER[o.side]).hp -= o.dealt;
  }
}

export function toAttackStep(o: AttackOutcome): ResolveStep {
  return {
    kind: 'attack',
    side: o.side,
    cardId: o.cardId,
    enCost: o.enCost,
    hit: o.hit,
    raw: o.raw,
    reduced: o.reduced,
    dealt: o.dealt,
    cells: o.cells,
  };
}
