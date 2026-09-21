import {
  BOARD_COLS,
  BOARD_ROWS,
  CHAR_SELECT_MS,
  type BattleState,
  type PlayerState,
  type Pos,
  type Side,
} from '../../../../../shared/cb/types';
import { getCharacter } from '../data/characters';

/**
 * 전투 상태의 생성·직렬화·결정적 난수.
 *
 * 이 파일을 포함해 engine/ 아래는 전부 순수 함수다.
 * 네트워크·UI·플랫폼 타입을 import 하지 않는다 (기준서 12.5).
 */

/** 시작 위치와 고정 facing (기준서 2-2). facing 은 연출 정보라 상태에 두지 않는다. */
export const START_POS: Readonly<Record<Side, Pos>> = {
  p1: { row: 1, col: 0 },
  p2: { row: 1, col: 3 },
};

export function inBoard(p: Pos): boolean {
  return p.row >= 0 && p.row < BOARD_ROWS && p.col >= 0 && p.col < BOARD_COLS;
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.row === b.row && a.col === b.col;
}

/* ── 결정적 난수 (mulberry32) ───────────────────────────────
   자동 선택과 랜덤 캐릭터 배정에 쓴다. seed 가 상태에 들어 있으므로
   직렬화 → 복원 후에도 같은 입력이면 같은 결과가 나온다. */

export function nextRandom(state: BattleState): number {
  state.seed = (state.seed + 0x6d2b79f5) >>> 0;
  let t = state.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(state: BattleState, n: number): number {
  return Math.floor(nextRandom(state) * n);
}

export function shuffled<T>(state: BattleState, items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(state, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ── 생성 ─────────────────────────────────────────────── */

function makePlayer(side: Side, userId: string | null): PlayerState {
  return {
    side,
    userId,
    characterId: null,
    charLocked: false,
    charAuto: false,
    hp: 0,
    en: 0,
    pos: { ...START_POS[side] },
    submission: null,
    submissionAuto: false,
    autoPickStreak: 0,
    guard: 'none',
  };
}

export interface CreateBattleOptions {
  /** 1P 의 userId. AI 면 null. */
  p1UserId: string | null;
  /** 2P 의 userId. AI 면 null. */
  p2UserId: string | null;
  now: number;
  seed?: number;
}

export function createBattle(opts: CreateBattleOptions): BattleState {
  return {
    phase: 'charSelect',
    turn: 1,
    deadline: opts.now + CHAR_SELECT_MS,
    p1: makePlayer('p1', opts.p1UserId),
    p2: makePlayer('p2', opts.p2UserId),
    reveal: null,
    result: null,
    seed: (opts.seed ?? 0x9e3779b9) >>> 0,
  };
}

/** 캐릭터가 정해진 뒤 HP / 기력을 최대치로 채운다 (기준서 2-2) */
export function applyCharacterStats(p: PlayerState): void {
  if (!p.characterId) throw new Error(`${p.side} 의 캐릭터가 정해지지 않았다`);
  const def = getCharacter(p.characterId);
  p.hp = def.maxHp;
  p.en = def.maxEn;
}

export function maxHpOf(p: PlayerState): number {
  return p.characterId ? getCharacter(p.characterId).maxHp : 0;
}

export function maxEnOf(p: PlayerState): number {
  return p.characterId ? getCharacter(p.characterId).maxEn : 0;
}

export function playerOf(state: BattleState, side: Side): PlayerState {
  return side === 'p1' ? state.p1 : state.p2;
}

export function isAI(p: PlayerState): boolean {
  return p.userId === null;
}

/* ── 직렬화 ────────────────────────────────────────────
   새로고침·재접속·서버 재시작 복구를 위해 BattleState 는 순수 JSON 이어야 한다
   (기준서 11-2). 함수·Map·Set·Date 를 상태에 넣지 않는 이유가 이것이다. */

export function serialize(state: BattleState): string {
  return JSON.stringify(state);
}

export function deserialize(raw: string): BattleState {
  return JSON.parse(raw) as BattleState;
}

export function cloneState(state: BattleState): BattleState {
  return JSON.parse(JSON.stringify(state)) as BattleState;
}
