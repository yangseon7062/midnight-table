import type { MoveSpec, Pos } from '../../../../../shared/cb/types';
import { inBoard } from './battleState';

/**
 * 이동 (기준서 3번).
 *
 * 보드 안에는 지형물도 충돌 판정도 없다. "벽"은 보드 경계뿐이다.
 * 같은 칸 점유·자리 바꿈·경로 교차를 전부 허용하므로 상대 위치는 보지 않는다.
 */

export interface MoveOutcome {
  to: Pos;
  /** 실제로 간 칸 수 (0, 1, 2) */
  moved: number;
  /** 경계에 막혀 원하는 만큼 못 갔는가 — 제자리 점프 연출의 근거 */
  blocked: boolean;
}

export function applyMove(from: Pos, spec: MoveSpec): MoveOutcome {
  let cur: Pos = { ...from };
  let moved = 0;
  for (let i = 0; i < spec.steps; i++) {
    const next: Pos = { row: cur.row + spec.dr, col: cur.col + spec.dc };
    if (!inBoard(next)) break;
    cur = next;
    moved++;
  }
  return { to: cur, moved, blocked: moved < spec.steps };
}
