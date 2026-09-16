import { useEffect, useRef, useState } from 'preact/hooks';
import type { MMItemView } from '@shared/mm/view';
import { RichText, view } from './util';
import { sfx } from '../../audio/sfx';

/** 단서 보드: 코르크판에 핀으로 꽂힌 증거들 */
export function EvidenceBoard(props: { onView: (item: MMItemView) => void; onClose: () => void }) {
  const v = view();
  const clues = v.items.filter((i) => i.kind === 'clue');
  const [filter, setFilter] = useState<'all' | 'public' | 'private'>('all');
  useEffect(() => { sfx.paper(); }, []);
  const list = clues.filter((c) => filter === 'all' || c.clue!.scope === filter);
  return (
    <div class="dossier-back" onPointerDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div class="cork panel">
        <div class="cork-head">
          <h3 class="pixel">🔎 단서 보드</h3>
          <div class="row">
            {(['all', 'public', 'private'] as const).map((f) => <button key={f} class={`chip ${filter === f ? 'gold' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? `전체 ${clues.length}` : f === 'public' ? '공용' : '나만 보는 단서'}</button>)}
            <button class="btn ghost sm" onClick={props.onClose}>닫기</button>
          </div>
        </div>
        <div class="cork-grid">
          {list.length === 0 && <p class="serif dim">아직 발견한 단서가 없습니다.</p>}
          {list.map((c, i) => (
            <button key={c.key} class={`clue-pin ${c.clue!.type} ${c.opened ? '' : 'sealed'}`} style={{ '--rot': `${((i * 53) % 7) - 3}deg` } as any}
              onClick={() => { props.onView(c); sfx.cardFlip(); }} onMouseEnter={() => sfx.hover()}>
              <span class="pin" />
              {c.clue!.scope === 'private' && <span class="secret-stamp">기밀</span>}
              {c.clue!.type === 'image' && c.clue!.image ? <img src={c.clue!.image} alt="" draggable={false} /> : <div class="note-lines serif">{c.clue!.text.slice(0, 70)}…</div>}
              <div class="clue-title serif">{c.title}</div>
              {!c.opened && <div class="unseen pixel tiny">미확인</div>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 단서 확대 뷰어: 휠/버튼 확대, 끌어서 이동, 돋보기 */
export function EvidenceViewer(props: { item: MMItemView; onClose: () => void; onPrev?: () => void; onNext?: () => void }) {
  const c = props.item.clue!;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [loupe, setLoupe] = useState(false);
  const [lens, setLens] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [props.item.key]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
      if (e.key === 'ArrowRight') props.onNext?.();
      if (e.key === 'ArrowLeft') props.onPrev?.();
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(5, z * 1.25));
      if (e.key === '-') setZoom((z) => Math.max(1, z / 1.25));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    setZoom((z) => { const nz = Math.max(1, Math.min(5, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); if (nz === 1) setPan({ x: 0, y: 0 }); return nz; });
  };
  const down = (e: PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; };
  const move = (e: PointerEvent) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (rect) setLens({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (!drag.current || zoom === 1) return;
    setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) });
  };
  const up = () => { drag.current = null; };

  return (
    <div class="viewer-back" onPointerDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div class="viewer">
        <div class="viewer-head">
          <div>
            <span class={`chip ${c.scope === 'private' ? 'red' : 'gold'}`}>{c.scope === 'private' ? '🔒 나만 볼 수 있는 단서' : '공용 단서'}</span>
            <h3 class="serif">{props.item.title}</h3>
          </div>
          <div class="row">
            {c.type === 'image' && (
              <>
                <button class="btn sm" onClick={() => setZoom((z) => Math.max(1, z / 1.3))}>－</button>
                <span class="mono small">{Math.round(zoom * 100)}%</span>
                <button class="btn sm" onClick={() => setZoom((z) => Math.min(5, z * 1.3))}>＋</button>
                <button class={`btn sm ${loupe ? 'gold' : ''}`} onClick={() => setLoupe(!loupe)} title="돋보기">🔍 돋보기</button>
              </>
            )}
            <button class="btn ghost sm" onClick={props.onClose}>닫기 (Esc)</button>
          </div>
        </div>
        {props.onPrev && <button class="viewer-nav prev" onClick={props.onPrev}>‹</button>}
        {props.onNext && <button class="viewer-nav next" onClick={props.onNext}>›</button>}
        {c.type === 'image' && c.image ? (
          <div class={`viewer-stage ${zoom > 1 ? 'zoomed' : ''} ${loupe ? 'loupe-on' : ''}`} ref={stageRef} onWheel={onWheel} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => setLens(null)}
            onDblClick={() => { setZoom(zoom > 1 ? 1 : 2.2); setPan({ x: 0, y: 0 }); }}>
            <img src={c.image} alt={props.item.title} draggable={false} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} class="photo" />
            {loupe && lens && stageRef.current && (
              <div class="loupe" style={{ left: lens.x - 90, top: lens.y - 90 }}>
                <img src={c.image} alt="" draggable={false} style={loupeStyle(stageRef.current, lens, zoom, pan)} />
              </div>
            )}
          </div>
        ) : (
          <div class="viewer-note paper"><RichText text={c.text} /></div>
        )}
        {c.caption && <p class="viewer-caption serif">{c.caption}</p>}
        {c.type === 'image' && c.text && <div class="viewer-note paper small"><RichText text={c.text} /></div>}
        <div class="faint tiny pixel viewer-tip">{c.type === 'image' ? '휠로 확대 · 끌어서 이동 · 더블클릭 확대/원래대로 · ←/→ 다른 단서' : '←/→ 다른 단서'}</div>
      </div>
    </div>
  );
}

function loupeStyle(stage: HTMLDivElement, lens: { x: number; y: number }, zoom: number, pan: { x: number; y: number }) {
  const img = stage.querySelector('img.photo') as HTMLImageElement | null;
  if (!img) return {};
  const sr = stage.getBoundingClientRect(), ir = img.getBoundingClientRect();
  const LZ = 2.2;
  const relX = lens.x + sr.left - ir.left, relY = lens.y + sr.top - ir.top;
  void zoom; void pan;
  return { width: `${ir.width * LZ}px`, height: `${ir.height * LZ}px`, transform: `translate(${90 - relX * LZ}px, ${90 - relY * LZ}px)` };
}
