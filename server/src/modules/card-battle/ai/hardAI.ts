import {
  ENERGY_UP_GAIN,
  GUARD_REDUCE,
  HEAL_AMOUNT,
  type CardDef,
  type Pos,
} from '../../../../../shared/cb/types';
import { ENERGY_UP_ID, GUARD_ID, HEAL_ID, PERFECT_GUARD_ID, getCard } from '../data/cards';
import { applyMove } from '../engine/movementResolver';
import { isInRange, rangeCells } from '../engine/attackResolver';
import type { AIContext } from './context';
import { normalPick } from './normalAI';

/**
 * Hard AI (기준서 10번) — HP/기력, 이동 가능 칸, 카드 사용 이력,
 * 상대의 공개된 과거 패턴, **남은 턴 수와 HP 비율**을 함께 본다.
 *
 * 20턴 상한이 있으므로 "앞서고 있으면 버틴다"가 성립한다. 그게 Normal 과의 가장 큰 차이다.
 *
 * 방법: 손패에서 쓸 만한 것만 추려 순서 있는 3장 조합을 만들고,
 * 각 조합을 상대가 제자리에 있다고 보고 굴려 점수를 매긴 뒤 제일 높은 것을 고른다.
 * 상대의 이번 턴 선택은 입력에 아예 없다 — 알 수 없으므로 위협의 **가능성**만 계산한다.
 */

interface Sim {
  pos: Pos;
  en: number;
  hp: number;
  guard: 'none' | 'guard' | 'perfect';
  dealt: number;
  spent: number;
}

/**
 * 남은 기력 1 의 값 (피해 1 = 3점 기준).
 *
 * 이 숫자 하나가 Hard 의 성격을 정한다. 낮으면 첫 턴에 기력을 다 쏟고 굶고,
 * 높으면 쌓아만 두다 20턴 판정으로 간다. 4.0~5.0 구간에서 Normal 을 안정적으로 이겼고,
 * 서로 다른 짝짓기 표본 두 벌에서 4.5 가 가장 좋았다 (tests/unit-cb.test.ts 의 대전 항목이 이걸 지킨다).
 * 밸런스 수치(기준서 9번 표)가 바뀌면 이 값도 다시 맞춰야 한다.
 */
const EN_VALUE = 4.5;

function dist(a: Pos, b: Pos): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

/** 상대가 지금까지 보여 준 기술 중, 지금 기력으로 낼 수 있는 제일 센 것의 피해 */
function foeThreat(ctx: AIContext): { damage: number; reach: number } {
  let damage = 0;
  let reach = 0;
  for (const id of new Set(ctx.foeHistory)) {
    const c = getCard(id);
    if (c.type !== 'attack' || !c.rangePattern) continue;
    if (c.energyCost > ctx.foe.en) continue;
    if (c.damage > damage) damage = c.damage;
    // 그 기술이 상대 자리에서 닿는 칸 수 — 넓을수록 피하기 어렵다
    reach = Math.max(reach, rangeCells(ctx.foe.pos, c.rangePattern).length);
  }
  return { damage, reach };
}

/** 상대가 지금까지 보여 준 기술로 이 칸을 때릴 수 있는가 */
function threatened(ctx: AIContext, at: Pos): boolean {
  for (const id of new Set(ctx.foeHistory)) {
    const c = getCard(id);
    if (c.type !== 'attack' || !c.rangePattern) continue;
    if (c.energyCost > ctx.foe.en) continue;
    if (isInRange(ctx.foe.pos, c.rangePattern, at)) return true;
  }
  return false;
}

function apply(ctx: AIContext, sim: Sim, card: CardDef): void {
  sim.spent += card.energyCost;
  sim.en -= card.energyCost;
  if (card.type === 'move' && card.move) {
    sim.pos = applyMove(sim.pos, card.move).to;
    return;
  }
  if (card.type === 'attack' && card.rangePattern) {
    if (isInRange(sim.pos, card.rangePattern, ctx.foe.pos)) sim.dealt += card.damage;
    return;
  }
  switch (card.id) {
    case ENERGY_UP_ID: sim.en = Math.min(ctx.me.maxEn, sim.en + ENERGY_UP_GAIN); break;
    case HEAL_ID: sim.hp = Math.min(ctx.me.maxHp, sim.hp + HEAL_AMOUNT); break;
    case GUARD_ID: sim.guard = 'guard'; break;
    case PERFECT_GUARD_ID: sim.guard = 'perfect'; break;
    default: break;
  }
}

export function scoreTriple(ctx: AIContext, triple: readonly CardDef[]): number | null {
  const sim: Sim = { pos: { ...ctx.me.pos }, en: ctx.me.en, hp: ctx.me.hp, guard: 'none', dealt: 0, spent: 0 };
  let guardSlots = 0;

  for (const card of triple) {
    if (card.energyCost > sim.en) return null;   // 순서상 못 내는 조합
    sim.guard = 'none';
    apply(ctx, sim, card);
    if (sim.guard !== 'none') guardSlots++;
  }

  const myRatio = ctx.me.hp / ctx.me.maxHp;
  const foeRatio = ctx.foe.hp / ctx.foe.maxHp;
  const turnsLeft = ctx.turnLimit - ctx.turn;
  const late = turnsLeft <= 5;
  const ahead = myRatio > foeRatio;
  const threat = foeThreat(ctx);

  let s = 0;

  // 끝낼 수 있으면 다른 건 볼 것 없다.
  if (sim.dealt >= ctx.foe.hp) return 10_000 - sim.spent;

  // 피해가 본질이지만 **공짜가 아니다.** 기력 회복은 Energy Up 한 장뿐이라
  // 한 턴에 들어오는 기력은 사실상 15 뿐이다. 한 방에 90을 쏟으면 그 뒤 여섯 턴을 굶는다.
  // 그래서 피해에서 쓴 기력을 뺀 값으로 본다 — 효율이 좋은 저비용 기술이 제값을 받는다.
  s += sim.dealt * 3;
  // 남은 기력에 값을 매긴다. 턴 시작 기력은 어느 조합이든 같으므로
  // 이 한 항이 "쓴 기력의 기회비용"과 "Energy Up 으로 번 기력"을 동시에 담는다.
  // 회복이 턴당 15 뿐이라 이 값이 낮으면 한 방에 다 쏟고 굶는다.
  s += Math.min(sim.en, ctx.me.maxEn) * EN_VALUE;

  // 거리 — 닿는 자리에 있어야 때린다
  const d = dist(sim.pos, ctx.foe.pos);
  s -= d * 4;

  // 방어: 상대가 낼 수 있는 게 셀수록, 내가 위협받는 칸에 있을수록 값지다
  if (guardSlots > 0) {
    const worth = threatened(ctx, sim.pos) ? threat.damage : threat.damage * 0.3;
    s += Math.min(worth, GUARD_REDUCE * 2) * (guardSlots > 1 ? 1.2 : 1);
  }

  // 체력 회복은 낮을 때만 값지다
  if (sim.hp > ctx.me.hp) s += (1 - myRatio) * 60;

  // 20턴 상한 (기준서 7-1 ②). 앞서고 있으면 **맞지 않는 것**이 이기는 길이다.
  // Guard 는 15밖에 못 깎으므로, 상대가 보여 준 사거리 밖으로 빠지는 쪽이 훨씬 낫다.
  if (late && ahead) {
    if (!threatened(ctx, sim.pos)) s += 40;
    s -= sim.spent * 0.4;
  }
  // 반대로 지고 있는데 끝이 가까우면 기력을 아낄 이유가 없다
  if (late && !ahead) {
    s += sim.dealt * 2;
    s += sim.spent * 1.2;       // 아껴 봐야 쓸 턴이 없다 — 위의 감점을 상당 부분 되돌린다
    s -= guardSlots * 15;
  }

  return s;
}

/** 쓸 만한 카드만 추린다 — 14장 전부로 조합을 만들면 대부분이 의미 없는 낭비다 */
function shortlist(ctx: AIContext): CardDef[] {
  const out: CardDef[] = [];
  for (const id of ctx.hand) {
    const c = getCard(id);
    if (c.energyCost > ctx.me.maxEn) continue;
    out.push(c);
  }
  return out;
}

export function hardPick(ctx: AIContext): string[] {
  const pool = shortlist(ctx);
  let best: string[] | null = null;
  let bestScore = -Infinity;

  for (const a of pool) {
    for (const b of pool) {
      if (b.id === a.id) continue;
      for (const c of pool) {
        if (c.id === a.id || c.id === b.id) continue;
        const s = scoreTriple(ctx, [a, b, c]);
        if (s === null || s <= bestScore) continue;
        bestScore = s;
        best = [a.id, b.id, c.id];
      }
    }
  }

  // 이론상 손패가 비는 일은 없지만, 못 고르면 Normal 로 떨어진다
  return best ?? normalPick(ctx);
}
