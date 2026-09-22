import type { BattleResult, CardType, CBPhase, MoveSpec, Pos, RangePattern, Side, SlotResult } from './types';

/**
 * 화면이 카드를 그리는 데 필요한 만큼의 카드 정보.
 *
 * 수치 표(기준서 9번)는 서버의 data/ 한 곳에만 둔다. 클라이언트가 같은 표를 또 갖고 있으면
 * 밸런스를 고칠 때 두 군데를 맞춰야 하고, 어긋나면 화면이 거짓말을 한다.
 * 그래서 필요한 카드만 뷰에 실어 보낸다 — 내 손패 14장과, 공개된 두 캐릭터의 기술.
 */
export interface CBCardInfo {
  id: string;
  /** 화면에 보여줄 이름 */
  name: string;
  type: CardType;
  energyCost: number;
  /** 공격만 */
  damage: number;
  /** 공격만 — 보드에 닿는 칸을 미리 보여줄 때 쓴다 */
  range: RangePattern | null;
  /** 이동만 */
  move: MoveSpec | null;
}

/**
 * 서버 → 클라이언트 카드 대전 뷰 (기준서 5번, 5-1).
 *
 * 규칙은 하나다: **아직 공개되지 않은 것은 여기에 담기지 않는다.**
 * 화면에서 숨기는 방식은 개발자 도구로 뚫리므로, 애초에 내려보내지 않는다.
 *
 * - 상대가 제출한 3장은 슬롯이 열릴 때 그 슬롯만 `revealed` 에 실린다.
 * - 캐릭터 선택 중에는 상대의 선택이 `characterId: null` 로 나간다.
 * - 관전자는 `me` 가 null 이고, 양쪽 누구의 미공개 패도 받지 못한다.
 */

export interface CBPublicPlayer {
  side: Side;
  /** AI 면 null */
  userId: string | null;
  nickname: string;
  connected: boolean;
  absent: boolean;
  /** 아직 공개 전이면 null */
  characterId: string | null;
  /** 캐릭터 이름 — 공개 전이면 null. 명단(roster)은 ⓪ 에만 실리므로 여기에 같이 보낸다 */
  charName: string | null;
  /** 슬롯 표기 'C1' — 기준서 9번 표와 대조할 때 쓴다. 공개 전이면 null */
  charLabel: string | null;
  charLocked: boolean;
  /** 서버가 랜덤 배정했는가 (공개 후에만 의미 있음) */
  charAuto: boolean;
  hp: number;
  maxHp: number;
  en: number;
  maxEn: number;
  pos: Pos;
  /** 이번 턴 제출 완료 여부**만**. 무엇을 냈는지는 공개 전까지 담지 않는다. */
  submitted: boolean;
}

export interface CBMeView {
  side: Side;
  /** 내 손패 14장 */
  hand: readonly string[];
  /** 내가 낸 3장 — 안 냈으면 null */
  submission: readonly string[] | null;
  /** 지금 기력으로 첫 장에 낼 수 있는 카드 (회색·자물쇠 표시용) */
  affordable: readonly string[];
}

/** ⓪ 캐릭터 선택 화면이 8명을 늘어놓는 데 필요한 정보. 전부 공개 정보다. */
export interface CBCharacterInfo {
  id: string;
  /** 슬롯 표기 'C1' — 기준서 9번 표와 대조할 때 쓴다 */
  label: string;
  name: string;
  alias: string;
  weapon: string;
  intro: string;
  maxHp: number;
  maxEn: number;
  note: string;
  skills: readonly CBCardInfo[];
}

export interface CBView {
  moduleId: string;
  contentId: string;
  phase: CBPhase;
  turn: number;
  turnLimit: number;
  /** 현재 단계 마감 시각 (epoch ms). 마감이 없으면 0. */
  deadline: number;
  serverNow: number;
  p1: CBPublicPlayer;
  p2: CBPublicPlayer;
  /** 관전자면 null */
  me: CBMeView | null;
  spectator: boolean;
  /** 지금까지 열린 슬롯만. 아직 안 열린 슬롯은 들어 있지 않다. */
  revealed: readonly SlotResult[];
  result: BattleResult | null;
  /** 이 뷰가 그려야 할 카드들의 수치. 캐릭터가 공개되기 전에는 내 손패뿐이다. */
  cards: readonly CBCardInfo[];
  /** 캐릭터 선택 단계에서만 채워진다 — 그 뒤로는 쓸 데가 없어 빈 배열로 둔다 */
  roster: readonly CBCharacterInfo[];
  /** AI 연습 판인가 */
  solo: boolean;
  /** solo 일 때 AI 난이도. 캐릭터 선택 단계에서만 바꿀 수 있다. */
  difficulty: 'normal' | 'hard';
}
