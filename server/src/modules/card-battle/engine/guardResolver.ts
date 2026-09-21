import type { BattleState, GuardMode } from '../../../../../shared/cb/types';
import { GUARD_ID, PERFECT_GUARD_ID } from '../data/cards';

/**
 * 방어 상태 (기준서 7번).
 *
 * Guard / Perfect Guard 는 **같은 카드 번호 슬롯에만** 적용된다.
 * 해결되는 즉시 켜지고, 그 슬롯의 모든 처리와 공격 판정이 끝나면 꺼진다.
 * 다음 슬롯으로 넘어가지 않는다.
 */

export type ActiveGuard = Exclude<GuardMode, 'none'>;

export function guardModeOf(cardId: string): ActiveGuard | null {
  if (cardId === GUARD_ID) return 'guard';
  if (cardId === PERFECT_GUARD_ID) return 'perfect';
  return null;
}

/** 슬롯이 끝날 때 양쪽 방어를 모두 내린다 */
export function clearGuards(state: BattleState): void {
  state.p1.guard = 'none';
  state.p2.guard = 'none';
}
