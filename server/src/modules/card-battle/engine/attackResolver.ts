import {
  GUARD_REDUCE,
  type GuardMode,
  type Pos,
  type RangePattern,
} from '../../../../../shared/cb/types';
import { inBoard, samePos } from './battleState';

/**
 * 공격 범위와 피해 (기준서 8번).
 *
 * - 범위는 사용자의 현재 칸을 가운데(1,1)로 놓는 3×3 절대 좌표 패턴이다.
 * - 보드 밖 칸은 무시한다.
 * - 1P/2P 에 따라 좌우 반전하지 않는다.
 * - 자기 칸이 범위에 들어도 자신은 피해를 받지 않는다.
 * - 상대가 같은 칸에 있고 그 칸이 범위면 상대는 정상 피해를 받는다.
 */

/** 보드 안으로 잘라낸 실제 범위 칸 */
export function rangeCells(from: Pos, pattern: RangePattern): Pos[] {
  const cells: Pos[] = [];
  for (let pr = 0; pr < 3; pr++) {
    for (let pc = 0; pc < 3; pc++) {
      if (!pattern[pr][pc]) continue;
      const cell: Pos = { row: from.row + pr - 1, col: from.col + pc - 1 };
      if (inBoard(cell)) cells.push(cell);
    }
  }
  return cells;
}

export function isInRange(from: Pos, pattern: RangePattern, target: Pos): boolean {
  return rangeCells(from, pattern).some((c) => samePos(c, target));
}

export interface DamageOutcome {
  /** 방어로 깎인 양 */
  reduced: number;
  /** 실제로 들어간 피해 */
  dealt: number;
}

/** 방어 상태에 따른 피해 감소 (기준서 7번). 결과 피해는 최소 0. */
export function computeDamage(raw: number, guard: GuardMode): DamageOutcome {
  if (guard === 'perfect') return { reduced: raw, dealt: 0 };
  if (guard === 'guard') {
    const reduced = Math.min(raw, GUARD_REDUCE);
    return { reduced, dealt: Math.max(0, raw - GUARD_REDUCE) };
  }
  return { reduced: 0, dealt: raw };
}
