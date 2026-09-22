import {
  ENERGY_UP_GAIN,
  HEAL_AMOUNT,
  type CardDef,
  type RangeCode,
} from '../../../../../shared/cb/types';
import { RANGES } from './ranges';
import { CHARACTERS } from './characters';

/**
 * 카드 풀 (기준서 4번, 9번).
 *
 * 캐릭터 한 명의 손패 = 이동 6 + 방어·보조 4 + 그 캐릭터의 고유 공격 4 = 14장.
 * 덱도 뽑기도 수량도 해금도 없다. 매 턴 같은 14장에서 고른다.
 */

const move = (id: string, name: string, dr: number, dc: number, steps: number): CardDef => ({
  id,
  name,
  type: 'move',
  characterId: null,
  energyCost: 0,
  damage: 0,
  rangePattern: null,
  move: { dr, dc, steps },
  effects: [],
});

/** 이동 6장 — 전부 기력 0 (기준서 3번) */
export const MOVE_CARDS: readonly CardDef[] = [
  move('move_up', '위로', -1, 0, 1),
  move('move_down', '아래로', 1, 0, 1),
  move('move_left', '왼쪽', 0, -1, 1),
  move('move_right', '오른쪽', 0, 1, 1),
  move('move_left2', '왼쪽 두 칸', 0, -1, 2),
  move('move_right2', '오른쪽 두 칸', 0, 1, 2),
];

const support = (id: string, name: string, energyCost: number): CardDef => ({
  id,
  name,
  type: 'support',
  characterId: null,
  energyCost,
  damage: 0,
  rangePattern: null,
  move: null,
  effects: [],
});

/** 방어·보조 4장 (기준서 7번) */
export const GUARD_ID = 'guard';
export const PERFECT_GUARD_ID = 'perfect_guard';
export const ENERGY_UP_ID = 'energy_up';
export const HEAL_ID = 'heal';

// 방어·보조 넷은 기준서 4번이 영어 이름으로 못 박아 둔 규칙 카드다. 그대로 쓴다.
export const SUPPORT_CARDS: readonly CardDef[] = [
  support(GUARD_ID, 'Guard', 0),
  support(PERFECT_GUARD_ID, 'Perfect Guard', 25),
  support(ENERGY_UP_ID, 'Energy Up', 0),
  support(HEAL_ID, 'Heal', 60),
];

/** 공용 10장 */
export const COMMON_CARDS: readonly CardDef[] = [...MOVE_CARDS, ...SUPPORT_CARDS];

/**
 * 고유 공격 카드 32장 — 기준서 9번 표를 그대로 옮긴 것.
 * [캐릭터, 기술, DM, EN, range] 순서. 이 표는 확정 밸런스다. 이름을 붙인다고 숫자를 바꾸지 않는다.
 */
const SKILL_TABLE: readonly (readonly [string, string, string, number, number, RangeCode])[] = [
  ['c1', 'a', '한 획', 24, 25, 'H'], ['c1', 'b', '내려 긋기', 46, 55, 'D'], ['c1', 'c', '열십자', 30, 35, 'C'], ['c1', 'd', '엇결', 32, 35, 'X'],
  ['c2', 'a', '네 모서리', 42, 50, 'X'], ['c2', 'b', '사방 결계', 20, 30, 'A'], ['c2', 'c', '먹물 쏟기', 28, 35, 'D'], ['c2', 'd', '십자 봉인', 30, 35, 'C'],
  ['c3', 'a', '빗장 지르기', 40, 55, 'H'], ['c3', 'b', '곧은 창', 30, 30, 'V'], ['c3', 'c', '네 번 찌르기', 19, 15, 'C'], ['c3', 'd', '방패 돌리기', 24, 40, 'A'],
  ['c4', 'a', '낚아채기', 55, 60, 'T'], ['c4', 'b', '발목 걸기', 18, 15, 'B'], ['c4', 'c', '사슬 후리기', 29, 30, 'H'], ['c4', 'd', '그물 조이기', 28, 25, 'C'],
  ['c5', 'a', '높은 바람', 45, 55, 'U'], ['c5', 'b', '겹울림', 30, 35, 'O'], ['c5', 'c', '스치기', 19, 15, 'H'], ['c5', 'd', '네 갈래 바람', 32, 35, 'X'],
  ['c6', 'a', '스쳐 베기', 31, 25, 'H'], ['c6', 'b', '교차 베기', 48, 55, 'X'], ['c6', 'c', '찔러 올리기', 20, 15, 'V'], ['c6', 'd', '낮게 쓸기', 32, 35, 'D'],
  ['c7', 'a', '치켜올림', 41, 45, 'U'], ['c7', 'b', '비껴 찌르기', 26, 25, 'X'], ['c7', 'c', '한 줄 꿰기', 58, 60, 'V'], ['c7', 'd', '가로 쓸기', 29, 20, 'H'],
  ['c8', 'a', '내려찍기', 57, 65, 'V'], ['c8', 'b', '땅 울리기', 19, 15, 'B'], ['c8', 'c', '올려치기', 42, 55, 'U'], ['c8', 'd', '휩쓸기', 27, 20, 'H'],
];

export const SKILL_CARDS: readonly CardDef[] = SKILL_TABLE.map(([charId, slot, name, damage, energyCost, range]) => ({
  id: `${charId}_${slot}`,
  name,
  type: 'attack' as const,
  characterId: charId,
  energyCost,
  damage,
  rangePattern: RANGES[range],
  move: null,
  effects: [],
}));

/** 기술 카드의 range 코드 — 뷰와 테스트에서 쓴다 */
export const SKILL_RANGE_CODE: ReadonlyMap<string, RangeCode> = new Map(
  SKILL_TABLE.map(([charId, slot, , , , range]) => [`${charId}_${slot}`, range]),
);

export const ALL_CARDS: readonly CardDef[] = [...COMMON_CARDS, ...SKILL_CARDS];

export const CARD_BY_ID: ReadonlyMap<string, CardDef> = new Map(ALL_CARDS.map((c) => [c.id, c]));

export function getCard(id: string): CardDef {
  const c = CARD_BY_ID.get(id);
  if (!c) throw new Error(`알 수 없는 카드: ${id}`);
  return c;
}

/** 이 캐릭터가 이번 판에 쓸 수 있는 14장 */
export function handFor(characterId: string): readonly CardDef[] {
  return [...COMMON_CARDS, ...SKILL_CARDS.filter((c) => c.characterId === characterId)];
}

export function handIdsFor(characterId: string): readonly string[] {
  return handFor(characterId).map((c) => c.id);
}

/** 데이터가 기준서와 어긋나지 않았는지 — import 시점에 바로 터지게 둔다 */
function assertDataIntegrity(): void {
  if (SKILL_CARDS.length !== 32) throw new Error(`기술 카드는 32장이어야 한다 (현재 ${SKILL_CARDS.length})`);
  if (COMMON_CARDS.length !== 10) throw new Error(`공용 카드는 10장이어야 한다 (현재 ${COMMON_CARDS.length})`);
  for (const ch of CHARACTERS) {
    const hand = handIdsFor(ch.id);
    if (hand.length !== 14) throw new Error(`${ch.label} 의 손패가 14장이 아니다 (현재 ${hand.length})`);
    for (const sid of ch.skillIds) {
      if (!CARD_BY_ID.has(sid)) throw new Error(`${ch.label} 의 기술 ${sid} 가 카드 표에 없다`);
    }
  }
  const ids = new Set<string>();
  for (const c of ALL_CARDS) {
    if (ids.has(c.id)) throw new Error(`카드 id 가 겹친다: ${c.id}`);
    ids.add(c.id);
  }
}
assertDataIntegrity();

/** 수치 상수는 types 에 있지만, 카드 데이터와 같이 읽히도록 여기서도 내보낸다 */
export { ENERGY_UP_GAIN, HEAL_AMOUNT };
