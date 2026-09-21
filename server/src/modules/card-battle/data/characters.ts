import type { CharacterDef } from '../../../../../shared/cb/types';

/**
 * 캐릭터 8명 (기준서 9번 표).
 *
 * 이름·외형·기술 이름은 아직 없다. 슬롯 표기(C1~C8)와 수치만 확정이다.
 * 이름이 정해지면 label 과 CardDef 쪽에 붙이되, HP / Max EN / DM / range 는 건드리지 않는다.
 */

interface Row {
  id: string;
  label: string;
  maxHp: number;
  maxEn: number;
  note: string;
}

const ROWS: readonly Row[] = [
  { id: 'c1', label: 'C1', maxHp: 200, maxEn: 100, note: '표준형. 전방 2줄 46 DM 한 방이 주무기' },
  { id: 'c2', label: 'C2', maxHp: 185, maxEn: 105, note: '가장 무르지만 가장 세다. 전 범위 20 DM 견제기 보유' },
  { id: 'c3', label: 'C3', maxHp: 205, maxEn: 100, note: '단단함 + 저비용 십자기(15 EN에 19 DM)' },
  { id: 'c4', label: 'C4', maxHp: 195, maxEn: 110, note: '극단형. 위쪽 55 DM(60 EN) vs 아래쪽 18 DM(15 EN)' },
  { id: 'c5', label: 'C5', maxHp: 190, maxEn: 105, note: '광역 전문. 위 2줄 45 DM, 위아래 동시 30 DM' },
  { id: 'c6', label: 'C6', maxHp: 195, maxEn: 100, note: '기동형. 저비용 카드가 많아 연타가 된다' },
  { id: 'c7', label: 'C7', maxHp: 200, maxEn: 100, note: '세로 한 줄 58 DM. 단일 최고 화력' },
  { id: 'c8', label: 'C8', maxHp: 205, maxEn: 110, note: '체력·기력 최상위. 세로 57 DM + 위 2줄 42 DM' },
];

export const CHARACTERS: readonly CharacterDef[] = ROWS.map((r) => ({
  ...r,
  skillIds: ['a', 'b', 'c', 'd'].map((s) => `${r.id}_${s}`),
}));

export const CHARACTER_BY_ID: ReadonlyMap<string, CharacterDef> = new Map(CHARACTERS.map((c) => [c.id, c]));

export const CHARACTER_IDS: readonly string[] = CHARACTERS.map((c) => c.id);

export function getCharacter(id: string): CharacterDef {
  const c = CHARACTER_BY_ID.get(id);
  if (!c) throw new Error(`알 수 없는 캐릭터: ${id}`);
  return c;
}
