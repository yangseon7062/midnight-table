import { ENERGY_UP_GAIN, type CardDef, type Pos } from '../../../../../shared/cb/types';
import { ENERGY_UP_ID, GUARD_ID, getCard } from '../data/cards';
import { applyMove } from '../engine/movementResolver';
import { isInRange } from '../engine/attackResolver';
import type { AIContext } from './context';

/**
 * Normal AI (기준서 10번) — 거리, 공격 범위, 기력, 기본 방어를 쓰는 **단순한** 선택.
 *
 * 앞을 내다보지 않는다. 슬롯마다 지금 상태에서 제일 그럴듯한 한 장을 집고,
 * 그 결과를 반영해 다음 슬롯으로 넘어간다. Hard 와 달리 상대 패턴도, 남은 턴도 보지 않는다.
 */

interface Sim {
  pos: Pos;
  en: number;
  used: Set<string>;
}

function dist(a: Pos, b: Pos): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function affordable(id: string, sim: Sim): boolean {
  return !sim.used.has(id) && getCard(id).energyCost <= sim.en;
}

function spend(sim: Sim, card: CardDef, maxEn: number): void {
  sim.en -= card.energyCost;
  if (card.id === ENERGY_UP_ID) sim.en = Math.min(maxEn, sim.en + ENERGY_UP_GAIN);
  sim.used.add(card.id);
}

/** 지금 자리에서 상대에게 닿는, 살 수 있는 제일 센 공격 */
function bestHit(ctx: AIContext, sim: Sim): CardDef | null {
  let best: CardDef | null = null;
  for (const id of ctx.hand) {
    if (!affordable(id, sim)) continue;
    const c = getCard(id);
    if (c.type !== 'attack' || !c.rangePattern) continue;
    if (!isInRange(sim.pos, c.rangePattern, ctx.foe.pos)) continue;
    if (!best || c.damage > best.damage) best = c;
  }
  return best;
}

/** 상대에게 가장 가까워지는 이동 */
function bestApproach(ctx: AIContext, sim: Sim): CardDef | null {
  let best: CardDef | null = null;
  let bestD = dist(sim.pos, ctx.foe.pos);
  for (const id of ctx.hand) {
    if (!affordable(id, sim)) continue;
    const c = getCard(id);
    if (c.type !== 'move' || !c.move) continue;
    const d = dist(applyMove(sim.pos, c.move).to, ctx.foe.pos);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function firstAffordable(ctx: AIContext, sim: Sim, ids: readonly string[]): CardDef | null {
  for (const id of ids) if (affordable(id, sim)) return getCard(id);
  return null;
}

function anyAffordable(ctx: AIContext, sim: Sim): CardDef {
  for (const id of ctx.hand) if (affordable(id, sim)) return getCard(id);
  throw new Error('낼 수 있는 카드가 없다');
}

export function normalPick(ctx: AIContext): string[] {
  const sim: Sim = { pos: { ...ctx.me.pos }, en: ctx.me.en, used: new Set() };
  const picked: string[] = [];

  for (let slot = 0; slot < 3; slot++) {
    // 1) 지금 닿으면 때린다
    let choice = bestHit(ctx, sim);
    // 2) 기력이 바닥이면 채운다
    if (!choice && sim.en < 25) choice = firstAffordable(ctx, sim, [ENERGY_UP_ID]);
    // 3) 멀면 다가간다
    if (!choice) choice = bestApproach(ctx, sim);
    // 4) 할 게 없으면 막거나 기력을 모은다
    if (!choice) choice = firstAffordable(ctx, sim, [GUARD_ID, ENERGY_UP_ID]);
    // 5) 그래도 없으면 아무거나 합법적인 것
    if (!choice) choice = anyAffordable(ctx, sim);

    picked.push(choice.id);
    if (choice.type === 'move' && choice.move) sim.pos = applyMove(sim.pos, choice.move).to;
    spend(sim, choice, ctx.me.maxEn);
  }

  return picked;
}
