import { OTHER, TURN_LIMIT, type BattleState, type Pos, type Side } from '../../../../../shared/cb/types';
import { maxEnOf, maxHpOf, playerOf } from '../engine/battleState';
import { handIdsFor } from '../data/cards';

/**
 * AI 가 볼 수 있는 것 전부 (기준서 10번).
 *
 * 이 타입에는 **상대의 이번 턴 제출이 들어갈 자리가 없다.** 그게 요점이다.
 * "AI 가 보지 않는다"를 규율로 지키면 언젠가 실수로 새지만,
 * 입력 자체에 그 필드가 없으면 샐 수가 없다.
 */
export interface AISeat {
  side: Side;
  characterId: string;
  hp: number;
  maxHp: number;
  en: number;
  maxEn: number;
  pos: Pos;
}

export interface AIContext {
  me: AISeat;
  foe: AISeat;
  turn: number;
  turnLimit: number;
  /** 내 손패 14장 */
  hand: readonly string[];
  /** 이미 공개된 상대 카드들 (지난 턴 포함). 아직 안 열린 것은 들어 있지 않다. */
  foeHistory: readonly string[];
}

function seat(state: BattleState, side: Side): AISeat {
  const p = playerOf(state, side);
  if (!p.characterId) throw new Error('캐릭터가 정해지지 않았다');
  return {
    side,
    characterId: p.characterId,
    hp: p.hp,
    maxHp: maxHpOf(p),
    en: p.en,
    maxEn: maxEnOf(p),
    pos: { ...p.pos },
  };
}

/**
 * 상태에서 AI 입력을 만든다. 여기서 걸러지지 않은 정보는 AI 에게 도달하지 않는다.
 * `foeHistory` 는 세션이 턴마다 쌓아 준 **공개된** 카드 목록이다.
 */
export function aiContext(state: BattleState, side: Side, foeHistory: readonly string[]): AIContext {
  return {
    me: seat(state, side),
    foe: seat(state, OTHER[side]),
    turn: state.turn,
    turnLimit: TURN_LIMIT,
    hand: handIdsFor(playerOf(state, side).characterId!),
    foeHistory: [...foeHistory],
  };
}
