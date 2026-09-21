/**
 * 1:1 카드 대전 — 서버·클라 공용 타입.
 *
 * 이 파일은 플랫폼(방·소켓·세션) 타입을 절대 import 하지 않는다.
 * engine / data / ai 도 마찬가지다. 나중에 모듈을 떼어낼 수 있게 하는 경계선이다.
 */

export const CB_MODULE_ID = 'card-battle';

/** 테이블에 뜨는 콘텐츠 두 개 (기준서 0-1) */
export const CB_CONTENT_PVP = 'card-battle';
export const CB_CONTENT_SOLO = 'card-battle-solo';

/** 보드는 정확히 4열 × 3행 (기준서 3번) */
export const BOARD_ROWS = 3;
export const BOARD_COLS = 4;

/** 제한 시간 (기준서 2-1, 4번) */
export const CHAR_SELECT_MS = 30_000;
export const CARD_SELECT_MS = 20_000;

/** 판 종료 (기준서 7-1) */
export const TURN_LIMIT = 20;
export const AUTO_PICK_LOSS_STREAK = 3;

/** 방어·보조 고정 수치 (기준서 7번) */
export const GUARD_REDUCE = 15;
export const ENERGY_UP_GAIN = 15;
export const HEAL_AMOUNT = 40;

export type Side = 'p1' | 'p2';

export const OTHER: Record<Side, Side> = { p1: 'p2', p2: 'p1' };

export interface Pos {
  row: number;
  col: number;
}

/** 3×3 절대 좌표 패턴. 사용자의 현재 칸이 가운데(1,1). */
export type RangePattern = readonly (readonly number[])[];

export type RangeCode = 'H' | 'V' | 'C' | 'X' | 'T' | 'B' | 'U' | 'D' | 'O' | 'A';

export type CardType = 'move' | 'support' | 'attack';

export interface MoveSpec {
  dr: number;
  dc: number;
  /** 최대 몇 칸까지 가는가. 막히면 갈 수 있는 만큼만 간다. */
  steps: number;
}

export interface CardDef {
  id: string;
  type: CardType;
  /** null = 모든 캐릭터가 쓰는 공용 카드 (이동 6 + 방어·보조 4) */
  characterId: string | null;
  energyCost: number;
  /** 공격 카드만 의미 있음 */
  damage: number;
  /** 공격 카드만 의미 있음 */
  rangePattern: RangePattern | null;
  /** 이동 카드만 의미 있음 */
  move: MoveSpec | null;
  /** 향후 확장 자리 — 지금은 항상 빈 배열 (기준서 1번) */
  effects: readonly string[];
}

export interface CharacterDef {
  id: string;
  /** 이름이 정해지기 전까지 쓰는 슬롯 표기 — 'C1' */
  label: string;
  maxHp: number;
  maxEn: number;
  /** 기준서 9번 표의 한 줄 성격 */
  note: string;
  /** 고유 공격 카드 4장 */
  skillIds: readonly string[];
}

/** 상태 머신 (기준서 5-2) */
export type CBPhase = 'charSelect' | 'charReveal' | 'selecting' | 'resolving' | 'finished';

export type GuardMode = 'none' | 'guard' | 'perfect';

export interface PlayerState {
  side: Side;
  /** null = AI */
  userId: string | null;
  characterId: string | null;
  charLocked: boolean;
  /** 서버가 랜덤 배정했는가 (기준서 2-1) */
  charAuto: boolean;
  hp: number;
  en: number;
  pos: Pos;
  /** 확정된 3장. 확정 전에는 null. */
  submission: readonly string[] | null;
  /** 자동 선택으로 채워진 제출인가 */
  submissionAuto: boolean;
  /** 연속 자동 선택 횟수 (기준서 4번) */
  autoPickStreak: number;
  /** 지금 슬롯에서만 유효한 방어 상태 (기준서 7번) */
  guard: GuardMode;
}

export type ResolveStep =
  | { kind: 'move'; side: Side; cardId: string; from: Pos; to: Pos; moved: number; blocked: boolean }
  | { kind: 'guard'; side: Side; cardId: string; mode: 'guard' | 'perfect'; enCost: number }
  | { kind: 'energy'; side: Side; cardId: string; gained: number }
  | { kind: 'heal'; side: Side; cardId: string; healed: number; enCost: number }
  | {
      kind: 'attack';
      side: Side;
      cardId: string;
      enCost: number;
      hit: boolean;
      raw: number;
      reduced: number;
      dealt: number;
      /** 보드 안으로 잘린 실제 범위 칸 */
      cells: readonly Pos[];
    }
  /**
   * 해결 시점에 기력이 모자라 불발된 카드.
   * 제출 때 가상 실행으로 걸러지므로 정상 흐름에서는 나오지 않는다.
   * 기준서 4번의 "해결될 때도 다시 검증한다"를 지키면서, 상태가 음수로 가지 않게 하는 안전망이다.
   */
  | { kind: 'skip'; side: Side; cardId: string; reason: 'energy' };

export interface SlotResult {
  /** 0, 1, 2 */
  slot: number;
  cards: Record<Side, string>;
  steps: readonly ResolveStep[];
  hpAfter: Record<Side, number>;
  enAfter: Record<Side, number>;
  posAfter: Record<Side, Pos>;
  /** 이 슬롯에서 판이 끝났는가 */
  finished: boolean;
}

export type EndReason = 'hp' | 'turnLimit' | 'autoPick' | 'forfeit';

export interface BattleResult {
  winner: Side | 'draw';
  reason: EndReason;
}

export interface BattleState {
  phase: CBPhase;
  /** 1부터 시작. TURN_LIMIT 까지. */
  turn: number;
  /** 현재 단계의 마감 시각 (epoch ms). 마감이 없는 단계는 0. */
  deadline: number;
  p1: PlayerState;
  p2: PlayerState;
  /** resolving 단계에서만 채워진다 — 서버는 전부 알고, 뷰가 slot 까지만 내려보낸다 */
  reveal: { slot: number; results: readonly SlotResult[] } | null;
  result: BattleResult | null;
  /** 결정적 난수 — 자동 선택과 랜덤 캐릭터 배정에 쓴다 */
  seed: number;
}
