import { useEffect, useRef, useState } from 'preact/hooks';
import type { MMCardView } from '@shared/mm/view';
import { act, view } from './util';
import { bus, me } from '../../net/net';
import { sfx } from '../../audio/sfx';

/** 손패: 카드를 위로 끌어 테이블에 내려놓으면 사용 */
export function CardHand() {
  const v = view();
  const cards = v.cards;
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; sx: number; sy: number } | null>(null);
  const [confirm, setConfirm] = useState<MMCardView | null>(null);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(true);
  const lastHover = useRef('');
  if (!cards.length || v.stage !== 'flow') return null;

  const THRESH = 140;
  const down = (c: MMCardView) => (e: PointerEvent) => {
    if (c.usesLeft <= 0) { sfx.error(); return; }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: c.id, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    sfx.cardSlide();
  };
  const move = (e: PointerEvent) => { if (drag) setDrag({ ...drag, x: e.clientX, y: e.clientY }); };
  const up = () => {
    if (!drag) return;
    const c = cards.find((x) => x.id === drag.id)!;
    const lifted = drag.sy - drag.y;
    setDrag(null);
    if (lifted > THRESH) { setConfirm(c); setNote(''); sfx.thud(); }
    else sfx.cardSlide();
  };

  const use = async () => {
    if (!confirm) return;
    const ok = await act('useCard', { cardId: confirm.id, note });
    if (ok) setConfirm(null);
  };

  const overDrop = drag && drag.sy - drag.y > THRESH;

  return (
    <>
      {drag && <div class={`drop-zone ${overDrop ? 'hot' : ''}`}><span class="pixel">{overDrop ? '놓으면 사용합니다' : '여기까지 끌어올려 테이블에 내려놓기'}</span></div>}
      <div class={`hand ${open ? '' : 'tucked'}`}>
        <button class="hand-toggle pixel tiny" onClick={() => setOpen(!open)}>{open ? '카드 숨기기 ▾' : `능력 카드 ${cards.length} ▴`}</button>
        {cards.map((c, i) => {
          const n = cards.length, mid = (n - 1) / 2;
          const dragging = drag?.id === c.id;
          const style = dragging
            ? { transform: `translate(${drag!.x - drag!.sx}px, ${drag!.y - drag!.sy}px) rotate(${(drag!.x - drag!.sx) * 0.05}deg) scale(1.08)`, zIndex: 50, transition: 'none' }
            : { transform: `translateX(${(i - mid) * 118}px) rotate(${(i - mid) * 6}deg) translateY(${Math.abs(i - mid) * 10}px)` };
          return (
            <div key={c.id} class={`game-card ${c.usesLeft <= 0 ? 'spent' : ''} ${dragging ? 'dragging' : ''}`} style={style}
              onPointerDown={down(c)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
              onMouseEnter={() => { if (lastHover.current !== c.id) { sfx.hover(); lastHover.current = c.id; } }}>
              <div class="gc-top pixel">능력 카드</div>
              <div class="gc-name serif">{c.name}</div>
              <div class="gc-desc serif">{c.description}</div>
              <div class="gc-uses">{Array.from({ length: c.uses }).map((_, k) => <span key={k} class={`pip ${k < c.usesLeft ? 'on' : ''}`} />)}</div>
              {c.usesLeft <= 0 && <div class="gc-spent pixel">사용 완료</div>}
            </div>
          );
        })}
      </div>
      {confirm && (
        <div class="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) setConfirm(null); }}>
          <div class="card-confirm">
            <div class="game-card big">
              <div class="gc-top pixel">능력 카드</div>
              <div class="gc-name serif">{confirm.name}</div>
              <div class="gc-desc serif">{confirm.description}</div>
              <div class="gc-uses">{Array.from({ length: confirm.uses }).map((_, k) => <span key={k} class={`pip ${k < confirm.usesLeft ? 'on' : ''}`} />)}</div>
            </div>
            <div class="panel confirm-side">
              <h3 class="pixel">이 카드를 사용할까요?</h3>
              <p class="dim small">사용하면 남은 횟수가 1 줄고, 모든 참가자에게 사용 사실이 공개됩니다. 효과는 카드 설명에 따라 참가자들이 직접 적용합니다.</p>
              <div class="field"><label>대상 / 한마디 (선택)</label><input class="input" maxLength={60} value={note} placeholder="예: 강태오에게, 22시 30분" onInput={(e) => setNote((e.target as HTMLInputElement).value)} autoFocus onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') use(); }} /></div>
              <div class="row" style={{ justifyContent: 'flex-end' }}>
                <button class="btn ghost" onClick={() => setConfirm(null)}>손패로 되돌리기</button>
                <button class="btn red" onClick={use}>테이블에 내려놓기</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface Played { charId: string; charName: string; cardName: string; description: string; usesLeft: number; uses: number; note: string; by: string; id: number }

/** 누군가 카드를 쓰면 모두의 화면 가운데로 카드가 날아와 도장이 찍힌다 */
export function CardSpotlight() {
  const [queue, setQueue] = useState<Played[]>([]);
  useEffect(() => bus.on('g:card', (p: Omit<Played, 'id'>) => {
    setQueue((q) => [...q, { ...p, id: Date.now() + Math.random() }]);
  }), []);
  const cur = queue[0];
  useEffect(() => {
    if (!cur) return;
    sfx.whoosh();
    const a = setTimeout(() => sfx.stamp(), 650);
    const b = setTimeout(() => setQueue((q) => q.slice(1)), 3600);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [cur?.id]);
  if (!cur) return null;
  const v = view();
  const mine = v.me.charId === cur.charId;
  const person = v.people.find((p) => p.id === cur.charId);
  return (
    <div class="spotlight" key={cur.id} onClick={() => setQueue((q) => q.slice(1))}>
      <div class="spot-who pixel">{mine ? '당신이' : `${cur.charName}(${cur.by})이(가)`} 카드를 내려놓았습니다</div>
      <div class="game-card big flying" style={{ '--c': person?.color ?? '#6d2330' } as any}>
        <div class="gc-top pixel">{cur.charName}의 능력 카드</div>
        <div class="gc-name serif">{cur.cardName}</div>
        <div class="gc-desc serif">{cur.description}</div>
        {cur.note && <div class="gc-note serif">“{cur.note}”</div>}
        <div class="gc-uses">{Array.from({ length: cur.uses }).map((_, k) => <span key={k} class={`pip ${k < cur.usesLeft ? 'on' : ''}`} />)}</div>
        <div class="used-stamp pixel">사용</div>
      </div>
      <div class="spot-tip faint tiny pixel">클릭하면 닫힙니다 · 효과는 카드 설명대로 직접 적용하세요</div>
    </div>
  );
}

export const _unused = me;
