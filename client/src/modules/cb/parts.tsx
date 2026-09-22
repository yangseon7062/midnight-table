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

   칸(격자)과 말(겹침 층)을 **따로** 그린다. 말을 칸 안에 넣으면 이동할 때
   한 칸에서 사라지고 다른 칸에 생기므로 CSS 가 그 사이를 이어 줄 수가 없다.
   겹침 층에 두고 transform 으로 옮기면 사이가 트랜지션으로 이어진다.
   ───────────────────────────────────────────────────────────── */

/** 한 슬롯에서 한 진영에 일어난 일 — 연출에만 쓴다. 판정은 이미 서버가 끝냈다. */
export interface SideFx {
  /** 점프 횟수. 기준서 3번: 1칸 한 번 / 2칸 두 번 / 막히면 제자리 한 번 */
  hops?: number;
  /** 이 슬롯에 받은 피해 */
  dmg?: number;
  miss?: boolean;
  healed?: number;
  energy?: number;
  guard?: 'guard' | 'perfect';
}

export interface BoardFx {
  /** 열린 슬롯 번호. 같은 자리에 머물러도 연출을 다시 트리거하려고 키에 섞는다 */
  slot: number;
  p1?: SideFx;
  p2?: SideFx;
}

/** 칸 사이 간격 — CSS 의 gap 과 같아야 말이 칸에 정확히 앉는다 */
const GAP = { small: 7, big: 10 };

export function Board({ v, highlight, big, fx }: { v: CBView; highlight?: readonly Pos[]; big?: boolean; fx?: BoardFx }) {
  const cells = [];
  const hl = highlight ?? [];
  const together = samePos(v.p1.pos, v.p2.pos);
  for (let row = 0; row < BOARD_ROWS; row++) {
    for (let col = 0; col < BOARD_COLS; col++) {
      const here: Pos = { row, col };
      const p1 = samePos(v.p1.pos, here);
      const p2 = samePos(v.p2.pos, here);
      const inRange = hl.some((c) => samePos(c, here));
      cells.push(
        <div key={`${row}-${col}`} class={`cb-cell ${inRange ? 'range' : ''} ${p1 ? 'p1' : ''} ${p2 ? 'p2' : ''}`} />,
      );
    }
  }
  return (
    <div class={`cb-board ${big ? 'big' : ''}`}>
      {cells}
      <div class="cb-tokens">
        <TokenSlot side="p1" v={v} big={big} fx={fx} together={together} />
        <TokenSlot side="p2" v={v} big={big} fx={fx} together={together} />
      </div>
    </div>
  );
}

/**
 * 말이 앉는 자리. 칸 하나와 같은 크기이고, transform 으로 칸 사이를 옮겨 다닌다.
 * `100%` 가 제 폭(= 칸 폭)이라 `col × (100% + gap)` 이 칸에 정확히 맞는다.
 */
function TokenSlot({
  side, v, big, fx, together,
}: { side: 'p1' | 'p2'; v: CBView; big?: boolean; fx?: BoardFx; together: boolean }) {
  const p = side === 'p1' ? v.p1 : v.p2;
  const g = big ? GAP.big : GAP.small;
  // 같은 칸에 둘이 서면 겹친다. 좌우로 조금씩 비켜 준다.
  const off = big ? 17 : 12;
  const nudge = together ? (side === 'p1' ? -off : off) : 0;
  const mine = fx?.[side];
  const hops = mine?.hops ?? 0;

  // 자리가 바뀌면 키가 바뀌어 다시 마운트되고, 그때 점프가 돈다.
  // 막혀서 제자리인 경우는 자리가 그대로라 슬롯 번호를 섞어 트리거한다 (기준서 3번).
  const hopKey = `${p.pos.row}-${p.pos.col}-${hops ? fx?.slot ?? 0 : ''}`;
  const hurt = !!mine?.dmg && mine.dmg > 0;

  return (
    <div
      class={`cb-tokenslot ${big ? 'big' : ''}`}
      style={{
        transform: `translate(calc(${p.pos.col} * (100% + ${g}px) + ${nudge}px), calc(${p.pos.row} * (100% + ${g}px)))`,
      }}
    >
      <span key={hopKey} class={`cb-hop ${hops === 2 ? 'twice' : ''} ${hops ? 'on' : ''}`}>
        <Marker side={side} v={v} big={big} hurt={hurt} hurtKey={fx?.slot} />
      </span>
      {mine && <Floats fx={mine} slot={fx?.slot ?? 0} />}
    </div>
  );
}

/** 피해·회복·기력이 말 위로 떠오른다. 숫자만 바뀌는 것보다 어디서 일어났는지가 보인다. */
function Floats({ fx, slot }: { fx: SideFx; slot: number }) {
  const out = [];
  if (fx.dmg !== undefined && fx.dmg > 0) out.push(<b key={`d${slot}`} class="cb-float dmg">−{fx.dmg}</b>);
  else if (fx.miss) out.push(<b key={`m${slot}`} class="cb-float miss">빗나감</b>);
  if (fx.healed) out.push(<b key={`h${slot}`} class="cb-float heal">+{fx.healed}</b>);
  if (fx.energy) out.push(<b key={`e${slot}`} class="cb-float en">+{fx.energy}</b>);
  if (fx.guard) out.push(<span key={`g${slot}`} class={`cb-shield ${fx.guard}`} aria-hidden="true" />);
  return <>{out}</>;
}

/**
 * 말. 진영색 원형에 그 캐릭터의 **무기 문장**을 파낸다 (marks.tsx).
 *
 * 30px 원 안에서 여덟이 갈려야 하는데, 그 크기에서는 디테일이 아니라 덩어리 모양으로
 * 구별된다. 그래서 얼굴도 이름 글자도 아니라 무기다 — 문장 자체가 실루엣이다.
 * 이름은 `title` 과 `aria-label` 로만 남긴다. 화면 곳곳에 이미 이름이 있다.
 */
function Marker({
  side, v, big, hurt, hurtKey,
}: { side: 'p1' | 'p2'; v: CBView; big?: boolean; hurt?: boolean; hurtKey?: number }) {
  const p = side === 'p1' ? v.p1 : v.p2;
  const me = v.me?.side === side;
  const who = me ? '나' : '상대';
  const name = p.charName ?? '???';
  const weapon = weaponOf(p.characterId);
  return (
    <span
      // 맞을 때마다 다시 마운트돼 흔들림이 처음부터 돈다 (같은 슬롯에서 두 번 맞지는 않는다)
      key={hurt ? `hurt-${hurtKey ?? 0}` : 'calm'}
      class={`cb-token ${side} ${me ? 'mine' : ''} ${big ? 'big' : ''} ${hurt ? 'hurt' : ''}`}
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
