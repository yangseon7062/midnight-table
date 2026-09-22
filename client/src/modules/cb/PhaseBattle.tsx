import { useMemo } from 'preact/hooks';
import type { CBView } from '@shared/cb/view';
import type { Pos, ResolveStep, Side } from '@shared/cb/types';
import { Board, CardTile, Hud, type BoardFx, type SideFx, type StrikeFx } from './parts';
import type { CBCardInfo } from '@shared/cb/view';
import { cardLabel, cardMap, slotCode } from './util';

/**
 * ② 전투 화면 (기준서 1-2 ②). 패가 사라지고 보드가 커진다.
 *
 * 손패는 통째로 사라지고 고른 3장만 작게 남는다.
 * 슬롯 1 → 2 → 3 순서로 한 장씩 열리고, 열릴 때마다 그 카드의 결과가 보드에서 재생된다.
 * 상대 카드도 같은 타이밍에 같이 열린다.
 * HP / 기력, 턴 수 영역은 ① 과 같은 자리를 지킨다 — 가운데 칸만 "공개 중"으로 바뀐다.
 */
export function PhaseBattle({ v }: { v: CBView }) {
  const cards = useMemo(() => cardMap(v), [v.cards]);
  const mySide: Side = v.me?.side ?? 'p1';
  const foeSide: Side = mySide === 'p1' ? 'p2' : 'p1';
  const last = v.revealed[v.revealed.length - 1];
  const openIdx = last ? last.slot : -1;

  // 지금 열린 슬롯의 공격이 닿은 칸을 보드에 표시한다
  const highlight: Pos[] = useMemo(() => {
    if (!last) return [];
    const atk = last.steps.find((s): s is Extract<ResolveStep, { kind: 'attack' }> => s.kind === 'attack');
    return atk ? [...atk.cells] : [];
  }, [last]);

  /**
   * 지금 열린 슬롯에서 각 진영에 일어난 일 — **연출 전용**이다.
   * 판정은 서버가 이미 끝냈고, 여기서는 그 결과를 그림으로 옮기기만 한다.
   *
   * 뷰가 슬롯 단위로 걸어오므로(서버의 frameOf) 이 값도 슬롯마다 갈린다.
   * 공격의 피해는 **맞은 쪽**에 붙인다 — 때린 쪽이 아니라 맞은 말이 흔들려야 한다.
   */
  const fx: BoardFx | undefined = useMemo(() => {
    if (!last) return undefined;
    const acc: Record<Side, SideFx> = { p1: {}, p2: {} };
    const strikes: StrikeFx[] = [];
    for (const st of last.steps) {
      switch (st.kind) {
        case 'move': {
          // 기준서 3번: 1칸 한 번 / 2칸 두 번 / 막히면 제자리 한 번
          acc[st.side].hops = st.blocked && st.moved === 0 ? 1 : Math.max(1, st.moved);
          break;
        }
        case 'attack': {
          const target: Side = st.side === 'p1' ? 'p2' : 'p1';
          if (st.hit) acc[target].dmg = (acc[target].dmg ?? 0) + st.dealt;
          else acc[target].miss = true;
          // 때린 칸은 **그 슬롯이 끝난 뒤**의 자리다. 공격은 비공격 행동이 다 처리된
          // 뒤에 판정되므로(기준서 6번), 뷰의 현재 위치가 곧 때린 자리다.
          const me = st.side === 'p1' ? v.p1 : v.p2;
          strikes.push({ from: me.pos, cells: st.cells, axis: axisOf(cards.get(st.cardId)?.range ?? null), hit: st.hit });
          break;
        }
        case 'heal':
          acc[st.side].healed = st.healed;
          break;
        case 'energy':
          acc[st.side].energy = st.gained;
          break;
        case 'guard':
          acc[st.side].guard = st.mode;
          break;
        default:
          break;
      }
    }
    return { slot: last.slot, p1: acc.p1, p2: acc.p2, strikes };
  }, [last, cards, v.p1.pos, v.p2.pos]);

  const caption = useMemo(() => {
    if (!last) return null;
    const atk = last.steps.find((s): s is Extract<ResolveStep, { kind: 'attack' }> => s.kind === 'attack');
    if (!atk) return null;
    const info = cards.get(atk.cardId);
    return { id: atk.cardId, hit: atk.hit, dealt: atk.dealt, raw: atk.raw, reduced: atk.reduced, info };
  }, [last, cards]);

  return (
    <div class="cb-game cb-phase-battle">
      <Hud
        v={v}
        center={
          <div class="cb-center-big">
            <div class="cb-center-l">공개 중</div>
            <b>{openIdx + 1}<span class="cb-center-of"> / 3</span></b>
            <div class="cb-pips">
              {[0, 1, 2].map((i) => <span key={i} class={i < openIdx ? 'done' : i === openIdx ? 'on' : ''} />)}
            </div>
          </div>
        }
      />

      <div class="cb-battle-mid">
        <section class="cb-panel cb-boardwrap big">
          <header class="cb-panel-h">
            <span>보드 4 × 3</span>
            <span class="cb-dim">손패는 사라졌다 — 고른 3장만 아래에 남는다</span>
          </header>
          <Board v={v} highlight={highlight} big fx={fx} />
          {caption && (
            <div class={`cb-caption ${caption.hit ? 'hit' : 'miss'}`}>
              <b>{cardLabel(caption.id, cards)}</b>
              <span class="cb-slotcode">{slotCode(caption.id)}</span>
              <i />
              {caption.info && <span>{caption.info.damage} 피해 · 기력 {caption.info.energyCost}</span>}
              <i />
              <span class="cb-verdict">
                {caption.hit
                  ? caption.reduced
                    ? `명중 ${caption.raw} − ${caption.reduced} = ${caption.dealt}`
                    : `명중 ${caption.dealt}`
                  : '빗나감'}
              </span>
            </div>
          )}
        </section>

        <section class="cb-panel cb-log">
          <header class="cb-panel-h">
            <span>이번 턴</span>
            <span class="cb-dim">턴 {v.turn}</span>
          </header>
          <div class="cb-log-list">
            {v.revealed.map((slot) => (
              <div key={slot.slot} class={`cb-log-slot ${slot.slot === openIdx ? 'on' : ''}`}>
                <div class="cb-log-h">슬롯 {slot.slot + 1}{slot.slot === openIdx ? ' · 공개 중' : ' · 끝남'}</div>
                <ul>
                  {slot.steps.map((s, i) => <li key={i} class={s.kind}>{describe(s, mySide, cards)}</li>)}
                </ul>
              </div>
            ))}
            {v.revealed.length < 3 && !v.result && (
              <div class="cb-log-slot pending"><div class="cb-log-h">슬롯 {v.revealed.length + 1} · 아직 안 열림</div></div>
            )}
          </div>
          <footer class="cb-dim">슬롯이 끝나면 방어는 풀린다. 3장을 다 열면 다음 턴으로 넘어간다.</footer>
        </section>
      </div>

      <div class="cb-battle-foot">
        <PickedRow v={v} side={mySide} title="내가 고른 3장" mine />
        <PickedRow v={v} side={foeSide} title="상대가 고른 3장" />
      </div>
    </div>
  );
}

function PickedRow({ v, side, title, mine }: { v: CBView; side: Side; title: string; mine?: boolean }) {
  const cards = cardMap(v);
  const openIdx = v.revealed.length - 1;
  return (
    <section class={`cb-panel cb-picked ${mine ? 'me' : 'foe'}`}>
      <header class="cb-panel-h">
        <span class="cb-chip" />
        <span>{title}</span>
        <span class="cb-dim">{(side === 'p1' ? v.p1 : v.p2).charName ?? ''}</span>
      </header>
      <div class="cb-picked-row">
        {[0, 1, 2].map((i) => {
          const slot = v.revealed[i];
          const id = slot?.cards[side];
          const info = id ? cards.get(id) : undefined;
          return (
            <div key={i} class="cb-picked-one">
              {info ? (
                <>
                  <CardTile info={info} small dim={i < openIdx} />
                  <b>{info.name}</b>
                </>
              ) : (
                <>
                  <div class="cb-tile back small"><span>{i + 1}</span></div>
                  <b class="cb-dim">뒷면</b>
                </>
              )}
              <span class="cb-dim">{i < openIdx ? `${i + 1} · 열림` : i === openIdx ? `${i + 1} · 열리는 중` : `${i + 1} · 아직`}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * 사거리 패턴에서 자국의 방향을 뽑는다.
 * 패턴을 그대로 그리면 격자와 겹쳐 지저분해진다 — 한 방이 **어느 쪽으로** 갔는지만 남긴다.
 */
function axisOf(range: CBCardInfo['range']): 'h' | 'v' | 'x' | 'all' {
  if (!range) return 'h';
  const on = (r: number, c: number) => range[r][c] === 1;
  const filled = range.flat().filter((x) => x === 1).length;
  if (filled >= 8) return 'all';
  // 가로줄이 통째로 차 있으면 가로, 세로줄이면 세로
  const row = [0, 1, 2].some((r) => on(r, 0) && on(r, 1) && on(r, 2));
  const col = [0, 1, 2].some((c) => on(0, c) && on(1, c) && on(2, c));
  if (row && col) return 'all';
  if (row) return 'h';
  if (col) return 'v';
  // 대각선만 켜진 패턴 (X)
  if (on(0, 0) && on(2, 2)) return 'x';
  return 'h';
}

function describe(s: ResolveStep, mySide: Side, cards: Map<string, CBCardInfo>): string {
  const who = s.side === mySide ? '나' : '상대';
  const nm = (id: string) => cardLabel(id, cards);
  switch (s.kind) {
    case 'move':
      return `${who} ${nm(s.cardId)} → (${s.to.row},${s.to.col})${s.blocked ? ' · 막혀서 제자리' : ''}`;
    case 'guard':
      return `${who} ${nm(s.cardId)} — 이 슬롯 안에서만`;
    case 'energy':
      return `${who} 기력 +${s.gained}`;
    case 'heal':
      return `${who} 체력 +${s.healed} (기력 ${s.enCost})`;
    case 'attack':
      return s.hit
        ? `${who} ${nm(s.cardId)} 명중 — ${s.raw}${s.reduced ? ` − ${s.reduced}` : ''} = ${s.dealt}`
        : `${who} ${nm(s.cardId)} 빗나감 (기력 ${s.enCost}은 나감)`;
    case 'skip':
      return `${who} ${nm(s.cardId)} 불발 — 기력 부족`;
    default:
      return '';
  }
}
