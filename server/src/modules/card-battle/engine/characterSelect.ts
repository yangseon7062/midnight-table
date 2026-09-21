import {
  CARD_SELECT_MS,
  type BattleState,
  type Side,
} from '../../../../../shared/cb/types';
import { CHARACTER_BY_ID, CHARACTER_IDS } from '../data/characters';
import { applyCharacterStats, playerOf, randInt } from './battleState';

/**
 * 캐릭터 선택 단계 (기준서 2-1).
 *
 * - 양쪽이 8명 중 하나를 독립적으로 고른다. 같은 캐릭터도 허용.
 * - 제한 30초. 안 고르면 서버가 랜덤 배정한다.
 * - 랜덤 배정은 4번의 "자동 선택 3연속 패배" 카운트에 **넣지 않는다**. 별개 규칙이다.
 * - 확정하면 즉시 잠긴다. 상대가 확정 전이어도 못 바꾼다.
 * - 둘 다 확정되면 동시에 공개한다.
 */

export function chooseCharacter(state: BattleState, side: Side, characterId: string): void {
  if (state.phase !== 'charSelect') throw new Error('캐릭터를 고를 단계가 아니다');
  const p = playerOf(state, side);
  if (p.charLocked) throw new Error('이미 확정했다');
  if (!CHARACTER_BY_ID.has(characterId)) throw new Error(`알 수 없는 캐릭터: ${characterId}`);
  p.characterId = characterId;
  p.charLocked = true;
  p.charAuto = false;
}

export function bothCharsLocked(state: BattleState): boolean {
  return state.p1.charLocked && state.p2.charLocked;
}

/** 마감이 지난 뒤, 아직 안 고른 쪽에 랜덤 배정한다 */
export function autoAssignCharacters(state: BattleState): void {
  for (const side of ['p1', 'p2'] as const) {
    const p = playerOf(state, side);
    if (p.charLocked) continue;
    p.characterId = CHARACTER_IDS[randInt(state, CHARACTER_IDS.length)];
    p.charLocked = true;
    p.charAuto = true;
  }
}

/** 둘 다 확정된 뒤 — 동시 공개하고 HP / 기력을 채운다 */
export function revealCharacters(state: BattleState): void {
  if (!bothCharsLocked(state)) throw new Error('아직 양쪽이 확정하지 않았다');
  applyCharacterStats(state.p1);
  applyCharacterStats(state.p2);
  state.phase = 'charReveal';
  state.deadline = 0;
}

/** 대치 연출이 끝나면 첫 카드 선택으로 (기준서 1-2 ⓪) */
export function beginSelecting(state: BattleState, now: number): void {
  state.phase = 'selecting';
  state.deadline = now + CARD_SELECT_MS;
  state.reveal = null;
  state.p1.submission = null;
  state.p2.submission = null;
  state.p1.submissionAuto = false;
  state.p2.submissionAuto = false;
  state.p1.guard = 'none';
  state.p2.guard = 'none';
}
