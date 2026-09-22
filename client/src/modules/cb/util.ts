import { useEffect, useState } from 'preact/hooks';
import type { CBCardInfo, CBView } from '@shared/cb/view';
import type { Pos, RangePattern } from '@shared/cb/types';
import { BOARD_COLS, BOARD_ROWS } from '@shared/cb/types';
import { call, gameView, serverNow, toast } from '../../net/net';
import { sfx } from '../../audio/sfx';

export const view = () => gameView.value as CBView;

export async function act(type: string, payload?: unknown, quiet = false): Promise<boolean> {
  const r = await call('g:action', { type, payload });
  if (!r.ok) { if (!quiet) { toast(r.error, 'warn'); sfx.error(); } return false; }
  return true;
}

/** 남은 시간을 초 단위로 다시 그리기 위한 틱 */
export function useNow(interval = 200): number {
  const [now, setNow] = useState(serverNow());
  useEffect(() => { const t = setInterval(() => setNow(serverNow()), interval); return () => clearInterval(t); }, [interval]);
  return now;
}

export function secondsLeft(deadline: number, now: number): number | null {
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/**
 * 카드 이름. 기준서 1-1 대로 **카드 면에는 적지 않고** 말풍선과 캡션에만 쓴다.
 * 이름은 서버가 뷰에 실어 보낸다 — 수치 표와 이름이 한 곳(data/)에만 있게 하려는 것이다.
 */
export function cardLabel(id: string, cards?: Map<string, CBCardInfo>): string {
  const name = cards?.get(id)?.name;
  if (name) return name;
  // 뷰에 아직 안 실린 카드 — 슬롯 표기로 떨어뜨린다
  const m = /^c(\d)_([a-d])$/.exec(id);
  return m ? `C${m[1]}-${m[2]}` : id;
}

/** 기술의 슬롯 표기 — 이름 옆에 작게 붙여 기준서 9번 표와 대조할 수 있게 한다 */
export function slotCode(id: string): string | null {
  const m = /^c(\d)_([a-d])$/.exec(id);
  return m ? `C${m[1]}-${m[2]}` : null;
}

export function cardKindLabel(info: CBCardInfo | undefined): string {
  if (!info) return '';
  return info.type === 'move' ? '이동' : info.type === 'support' ? '방어·보조' : '기술';
}

/** 카드 효과 한 줄 — 말풍선에 쓴다 */
export function cardEffect(info: CBCardInfo | undefined): string {
  if (!info) return '';
  if (info.type === 'attack') return `${info.damage} 피해 · 빗나가도 기력은 나간다`;
  switch (info.id) {
    case 'guard': return '이 슬롯에서 받는 피해를 공격마다 15 줄인다';
    case 'perfect_guard': return '이 슬롯에서 받는 피해를 전부 없앤다';
    case 'energy_up': return '기력을 15 회복한다 (최대치를 넘지 않는다)';
    case 'heal': return '체력을 40 회복한다 (최대치를 넘지 않는다)';
    default: {
      const steps = info.move?.steps ?? 1;
      return steps > 1 ? '두 칸까지 간다. 막히면 갈 수 있는 만큼만 간다' : '한 칸 간다. 막히면 제자리';
    }
  }
}

export const CARD_ORDER: readonly string[] = [
  'move_up', 'move_down', 'move_left', 'move_right', 'move_left2', 'move_right2',
  'guard', 'perfect_guard', 'energy_up', 'heal',
];

export function sortHand(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => {
    const ia = CARD_ORDER.indexOf(a), ib = CARD_ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b);
  });
}

export function cardMap(v: CBView): Map<string, CBCardInfo> {
  return new Map(v.cards.map((c) => [c.id, c]));
}

/** 3×3 절대 좌표 패턴을 보드 안 칸으로 편다 (서버의 rangeCells 와 같은 규칙) */
export function rangeCells(from: Pos, pattern: RangePattern): Pos[] {
  const out: Pos[] = [];
  for (let pr = 0; pr < 3; pr++) {
    for (let pc = 0; pc < 3; pc++) {
      if (!pattern[pr][pc]) continue;
      const row = from.row + pr - 1, col = from.col + pc - 1;
      if (row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS) out.push({ row, col });
    }
  }
  return out;
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.row === b.row && a.col === b.col;
}

/**
 * 고른 카드들이 쓸 기력 — ① 의 금색 빗금은 이 값이어야 한다.
 * Energy Up 이 중간에 끼면 늘어나므로 순서대로 가상 실행한다 (기준서 4번).
 */
export function energyAfter(picked: readonly string[], cards: Map<string, CBCardInfo>, en: number, maxEn: number): number {
  let cur = en;
  for (const id of picked) {
    const c = cards.get(id);
    if (!c) continue;
    cur -= c.energyCost;
    if (id === 'energy_up') cur = Math.min(maxEn, cur + 15);
  }
  return cur;
}
