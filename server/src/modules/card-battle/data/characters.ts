import type { CharacterDef } from '../../../../../shared/cb/types';

/**
 * 캐릭터 8명.
 *
 * **수치(HP / Max EN)는 기준서 9번 표의 확정값이다.** 이름과 설정은 그 수치의 성격에서
 * 거꾸로 지었다 — C7은 세로 한 줄 58 피해가 전부라 「한 자루」, C2는 체력이 가장 낮아 「종잇장」.
 * 이름을 바꿔도 되지만 숫자는 건드리지 않는다.
 *
 * 세계관: 해가 지면 길이 사라지고 그 위로 다른 것들이 다닌다. 그 길을 도로 여는 일을
 * 「야경(夜更)」이라 불렀다. 여덟은 같은 패를 차지만, 실력을 가리는 자리에서는 서로를 벤다.
 */

interface Row {
  id: string;
  label: string;
  name: string;
  alias: string;
  weapon: string;
  intro: string;
  maxHp: number;
  maxEn: number;
  note: string;
}

const ROWS: readonly Row[] = [
  {
    id: 'c1', label: 'C1', name: '하진', alias: '물길', weapon: '외날 장검',
    intro: '관군 척후였다가 요괴 토벌로 넘어왔다. 한 번 그은 선을 끝까지 밀고 간다.',
    maxHp: 200, maxEn: 100, note: '표준형. 전방 2줄 46 DM 한 방이 주무기',
  },
  {
    id: 'c2', label: 'C2', name: '소윤', alias: '종잇장', weapon: '부적과 먹줄',
    intro: '몸이 약해 칼을 못 든다. 먹줄로 사방을 재고 부적을 건다. 맞으면 가장 먼저 쓰러진다.',
    maxHp: 185, maxEn: 105, note: '가장 무르지만 가장 세다. 전 범위 20 DM 견제기 보유',
  },
  {
    id: 'c3', label: 'C3', name: '석우', alias: '문지기', weapon: '방패와 단창',
    intro: '성문을 삼십 년 지켰다. 물러설 자리를 먼저 없애고 시작한다.',
    maxHp: 205, maxEn: 100, note: '단단함 + 저비용 십자기(15 EN에 19 DM)',
  },
  {
    id: 'c4', label: 'C4', name: '탁오', alias: '덫', weapon: '갈고리 사슬',
    intro: '사냥꾼이었다. 위로 낚아채는 한 수가 가장 아프고, 발밑을 훑는 수가 가장 싸다.',
    maxHp: 195, maxEn: 110, note: '극단형. 위쪽 55 DM(60 EN) vs 아래쪽 18 DM(15 EN)',
  },
  {
    id: 'c5', label: 'C5', name: '채령', alias: '풍경', weapon: '쇠방울 채찍',
    intro: '소리로 요괴를 몬다. 한 사람을 노리기보다 자리를 통째로 덮는다.',
    maxHp: 190, maxEn: 105, note: '광역 전문. 위 2줄 45 DM, 위아래 동시 30 DM',
  },
  {
    id: 'c6', label: 'C6', name: '여울', alias: '잔발', weapon: '쌍단도',
    intro: '한 방이 없다. 대신 멈추지 않는다. 싸게 여러 번 긋는 쪽이 남는다고 믿는다.',
    maxHp: 195, maxEn: 100, note: '기동형. 저비용 카드가 많아 연타가 된다',
  },
  {
    id: 'c7', label: 'C7', name: '한서', alias: '한 자루', weapon: '장창',
    intro: '한 줄로 세우고 한 번에 꿴다. 가장 아픈 한 수를 가졌고, 그 한 수에 판을 건다.',
    maxHp: 200, maxEn: 100, note: '세로 한 줄 58 DM. 단일 최고 화력',
  },
  {
    id: 'c8', label: 'C8', name: '무진', alias: '종지기', weapon: '당목 철퇴',
    intro: '절에서 종을 치던 사람. 몸도 기력도 가장 두텁다. 위로도 아래로도 무겁게 간다.',
    maxHp: 205, maxEn: 110, note: '체력·기력 최상위. 세로 57 DM + 위 2줄 42 DM',
  },
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
