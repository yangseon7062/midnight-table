import type { ComponentChildren } from 'preact';
import type { CBCardInfo, CBPublicPlayer, CBView } from '@shared/cb/view';
import type { Pos } from '@shared/cb/types';
import { BOARD_COLS, BOARD_ROWS } from '@shared/cb/types';
import { CardArt } from './CardArt';
import { CharMark, weaponOf } from './marks';
import { samePos } from './util';

/* ─────────────────────────────────────────────────────────────
   상단 바 — 기준서 1-2: HP / 기력, 턴 수, 남은 시간 영역은
   ⓪①② 에서 **같은 자리를 유지한다**. 가운데 칸의 내용만 화면마다 바뀐다.
   ───────────────────────────────────────────────────────────── */

export function Hud(props: {
  v: CBView;
  /** 가운데 칸 아래쪽 — ① 은 남은 시간, ② 는 공개 진행, ⓪ 은 남은 시간 */
  center: ComponentChildren;
  /** ① 에서 고른 카드가 쓰고 남을 기력 (금색 빗금의 오른쪽 끝) */
  pendingEn?: number;
}) {
  const { v, center, pendingEn } = props;
  const mySide = v.me?.side ?? 'p1';
  const mine = mySide === 'p1' ? v.p1 : v.p2;
  const foe = mySide === 'p1' ? v.p2 : v.p1;
  const started = mine.maxHp > 0;

  return (
    <div class="cb-hud">
      <div class="cb-hud-row">
        <PlayerPanel p={mine} side="me" v={v} pendingEn={pendingEn} />
        <div class="cb-hud-center">
          <div class="cb-turn">
            <span class="cb-turn-l">턴</span>
            <b>{v.turn}</b>
            <span class="cb-turn-max">/ {v.turnLimit}</span>
          </div>
          <div class="cb-hud-rule" />
          {center}
        </div>
        <PlayerPanel p={foe} side="foe" v={v} />
      </div>
      <div class="cb-turnbar">
        <div style={{ width: `${started ? (v.turn / v.turnLimit) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

function PlayerPanel({ p, side, v, pendingEn }: { p: CBPublicPlayer; side: 'me' | 'foe'; v: CBView; pendingEn?: number }) {
  const started = p.maxHp > 0;
  const hpPct = started ? (p.hp / p.maxHp) * 100 : 0;
  const enPct = started ? (p.en / p.maxEn) * 100 : 0;
  const keepPct = started && pendingEn !== undefined ? (Math.max(0, pendingEn) / p.maxEn) * 100 : null;
  const tag = p.side === 'p1' ? '1P' : '2P';
  const who = side === 'me' ? '나' : '상대';

  return (
    <div class={`cb-player ${side} ${p.side}`}>
      <div class="cb-player-top">
        <span class="cb-chip" />
        <b class="cb-name">{p.charName ?? '???'}</b>
        {p.charLabel && <span class="cb-slotcode">{p.charLabel}</span>}
        <span class="cb-role">{who} · {tag}</span>
        {!p.connected && <span class="cb-warn">연결 끊김</span>}
        {side === 'foe' && v.phase === 'charSelect' && p.charLocked && <span class="cb-ok">선택 완료</span>}
        {side === 'foe' && v.phase === 'selecting' && p.submitted && <span class="cb-ok">선택 완료</span>}
      </div>
      {started && (
        <>
          <div class="cb-bar-row">
            <span class="cb-bar-l">HP</span>
            <div class="cb-bar hp"><div style={{ width: `${hpPct}%` }} /></div>
            <span class="cb-bar-n">{p.hp}/{p.maxHp}</span>
          </div>
          <div class="cb-bar-row">
            <span class="cb-bar-l en">기력</span>
            <div class="cb-bar en">
              <div style={{ width: `${enPct}%` }} />
              {keepPct !== null && keepPct < enPct && (
                <div class="cb-bar-spend" style={{ left: `${keepPct}%`, width: `${enPct - keepPct}%` }} />
              )}
            </div>
            <span class="cb-bar-n en">{p.en}/{p.maxEn}</span>
          </div>
        </>
      )}
      {!started && <div class="cb-dim">HP · 기력은 캐릭터가 공개된 뒤에 뜬다</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   보드 — 4열 × 3행. 한 칸에 둘이 같이 설 수 있다.
   ───────────────────────────────────────────────────────────── */

export function Board({ v, highlight, big }: { v: CBView; highlight?: readonly Pos[]; big?: boolean }) {
  const cells = [];
  const hl = highlight ?? [];
  for (let row = 0; row < BOARD_ROWS; row++) {
    for (let col = 0; col < BOARD_COLS; col++) {
      const here: Pos = { row, col };
      const p1 = samePos(v.p1.pos, here);
      const p2 = samePos(v.p2.pos, here);
      const inRange = hl.some((c) => samePos(c, here));
      cells.push(
        <div key={`${row}-${col}`} class={`cb-cell ${inRange ? 'range' : ''} ${p1 ? 'p1' : ''} ${p2 ? 'p2' : ''}`}>
          {p1 && <Marker side="p1" v={v} big={big} />}
          {p2 && <Marker side="p2" v={v} big={big} />}
        </div>,
      );
    }
  }
  return <div class={`cb-board ${big ? 'big' : ''}`}>{cells}</div>;
}

/**
 * 말. 진영색 원형에 그 캐릭터의 **무기 문장**을 파낸다 (marks.tsx).
 *
 * 30px 원 안에서 여덟이 갈려야 하는데, 그 크기에서는 디테일이 아니라 덩어리 모양으로
 * 구별된다. 그래서 얼굴도 이름 글자도 아니라 무기다 — 문장 자체가 실루엣이다.
 * 이름은 `title` 로만 남긴다(마우스를 올리면 뜬다). 화면 곳곳에 이미 이름이 있다.
 */
function Marker({ side, v, big }: { side: 'p1' | 'p2'; v: CBView; big?: boolean }) {
  const p = side === 'p1' ? v.p1 : v.p2;
  const me = v.me?.side === side;
  const who = me ? '나' : '상대';
  const name = p.charName ?? '???';
  const weapon = weaponOf(p.characterId);
  return (
    <span
      class={`cb-token ${side} ${me ? 'mine' : ''} ${big ? 'big' : ''}`}
      title={weapon ? `${name} · ${weapon} · ${who}` : `${name} · ${who}`}
      aria-label={`${name} (${who})`}
      role="img"
    >
      {/* 캐릭터가 아직 공개 전이면 문장도 없다 — 물음표로 자리만 잡는다 */}
      {p.characterId ? <CharMark characterId={p.characterId} size={big ? 28 : 18} /> : '?'}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   카드 타일 — 가로형 "행동 명령" (기준서 1-1)
   그림 + 왼쪽 위 기력 비용만. 이름은 타일 밖 캡션과 말풍선에.
   ───────────────────────────────────────────────────────────── */

export function CardTile(props: {
  info: CBCardInfo | undefined;
  /** 고른 순서 (1,2,3). 안 골랐으면 null */
  order?: number | null;
  locked?: boolean;
  small?: boolean;
  dim?: boolean;
  onClick?: () => void;
  onEnter?: () => void;
  onLeave?: () => void;
}) {
  const { info, order, locked, small, dim } = props;
  if (!info) return null;
  const kind = info.type === 'move' ? 'move' : info.type === 'support' ? 'support' : 'attack';
  const cls = `cb-tile ${kind} ${order ? 'picked' : ''} ${locked ? 'locked' : ''} ${small ? 'small' : ''} ${dim ? 'dim' : ''}`;
  const body = (
    <>
      <span class="cb-cost">{info.energyCost}</span>
      <CardArt info={info} size={small ? 30 : 42} />
      {order ? <span class="cb-order">{order}</span> : null}
      {locked && (
        <span class="cb-lock">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 9 L6 6 Q6 2 10 2 Q14 2 14 6 L14 9" stroke="currentColor" stroke-width="2" fill="none" /><rect x="4" y="9" width="12" height="9" fill="currentColor" /></svg>
          기력 부족
        </span>
      )}
    </>
  );
  if (!props.onClick) return <div class={cls}>{body}</div>;
  return (
    <button
      class={cls}
      type="button"
      disabled={locked}
      aria-label={info.name}
      onClick={props.onClick}
      onMouseEnter={props.onEnter}
      onMouseLeave={props.onLeave}
      onFocus={props.onEnter}
      onBlur={props.onLeave}
    >
      {body}
    </button>
  );
}
