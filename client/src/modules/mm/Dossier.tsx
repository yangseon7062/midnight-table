import { useEffect, useRef, useState } from 'preact/hooks';
import type { MMItemView, MMView } from '@shared/mm/view';
import type { CommonBlock } from '@shared/mm/scenario';
import { RichText, view } from './util';
import { PresentButton } from './Present';
import { sfx } from '../../audio/sfx';

/** 사건 파일(책): 설정집 + 공용집. 페이지 모서리를 끌어 넘기거나 ←/→ 키로 넘긴다. */
export function Dossier(props: { initialKey?: string | null; onClose: () => void }) {
  const v = view();
  const pages = v.items.filter((i) => i.opened && (i.kind === 'sheet' || i.kind === 'common'));
  const [idx, setIdx] = useState(() => Math.max(0, pages.findIndex((p) => p.key === props.initialKey)));
  const [turn, setTurn] = useState<{ from: number; to: number; p: number; dragging: boolean } | null>(null);
  const drag = useRef<{ x: number; w: number; dir: 1 | -1 } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => { sfx.paper(); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const go = (dir: 1 | -1, target?: number) => {
    const to = target ?? idx + dir;
    if (to < 0 || to >= pages.length || turn || to === idx) return;
    sfx.pageFlip();
    setTurn({ from: idx, to, p: 0, dragging: false });
    requestAnimationFrame(() => setTurn({ from: idx, to, p: 1, dragging: false }));
    setTimeout(() => { setIdx(to); setTurn(null); bodyRef.current?.scrollTo(0, 0); }, 520);
  };

  const onCornerDown = (dir: 1 | -1) => (e: PointerEvent) => {
    const to = idx + dir;
    if (to < 0 || to >= pages.length || turn) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const book = (e.currentTarget as HTMLElement).closest('.book-page') as HTMLElement;
    drag.current = { x: e.clientX, w: book.clientWidth, dir };
    setTurn({ from: idx, to, p: 0, dragging: true });
    sfx.paper();
  };
  const onCornerMove = (e: PointerEvent) => {
    if (!drag.current || !turn) return;
    const dx = (e.clientX - drag.current.x) * -drag.current.dir;
    setTurn({ ...turn, p: Math.max(0, Math.min(1, dx / drag.current.w)) });
  };
  const onCornerUp = () => {
    if (!drag.current || !turn) return;
    drag.current = null;
    if (turn.p > 0.35) {
      sfx.pageFlip();
      setTurn({ ...turn, p: 1, dragging: false });
      setTimeout(() => { setIdx(turn.to); setTurn(null); bodyRef.current?.scrollTo(0, 0); }, 380);
    } else {
      setTurn({ ...turn, p: 0, dragging: false });
      setTimeout(() => setTurn(null), 300);
    }
  };

  const cur = pages[idx];
  const sheets = pages.map((p, i) => ({ p, i })).filter((x) => x.p.kind === 'sheet');
  const commons = pages.map((p, i) => ({ p, i })).filter((x) => x.p.kind === 'common');
  const forward = turn ? turn.to > turn.from : true;

  return (
    <div class="dossier-back" onPointerDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div class="book">
        <nav class="book-tabs">
          <div class="tab-group">
            <div class="tab-label pixel">📜 내 설정집 <span class="chip red tiny">나만 보기</span></div>
            {sheets.length === 0 && <div class="faint tiny">아직 없음</div>}
            {sheets.map(({ p, i }) => <button key={p.key} class={`tab ${i === (turn?.to ?? idx) ? 'on' : ''}`} onClick={() => go(i > idx ? 1 : -1, i)}>{p.title}</button>)}
          </div>
          <div class="tab-group">
            <div class="tab-label pixel">📖 공용집 <span class="chip tiny">전원 공개</span></div>
            {commons.length === 0 && <div class="faint tiny">아직 없음</div>}
            {commons.map(({ p, i }) => <button key={p.key} class={`tab ${i === (turn?.to ?? idx) ? 'on' : ''}`} onClick={() => go(i > idx ? 1 : -1, i)}>{p.title}</button>)}
          </div>
          {cur && <PresentButton item={cur} compact />}
          <button class="btn ghost sm" onClick={props.onClose}>덮기 (Esc)</button>
        </nav>
        <div class="book-page">
          {!cur && <div class="page paper empty serif">아직 받은 문서가 없습니다.<br />봉투가 도착하면 열어 보세요.</div>}
          {cur && (
            <>
              <div class="page paper under" ref={bodyRef}>
                <PageContent item={turn ? pages[forward ? turn.to : turn.from] : cur} v={v} />
              </div>
              {turn && (
                <div class={`page paper turning ${turn.dragging ? 'dragging' : ''} ${forward ? 'fwd' : 'back'}`} style={{ '--p': turn.p } as any}>
                  <PageContent item={pages[forward ? turn.from : turn.to]} v={v} />
                  <div class="turn-shade" />
                </div>
              )}
              <div class="page-foot pixel tiny">
                <button class="btn ghost sm" disabled={idx === 0} onClick={() => go(-1)}>◀ 이전</button>
                <span class="faint">{idx + 1} / {pages.length}</span>
                <button class="btn ghost sm" disabled={idx >= pages.length - 1} onClick={() => go(1)}>다음 ▶</button>
              </div>
              {idx < pages.length - 1 && <div class="corner right" onPointerDown={onCornerDown(1)} onPointerMove={onCornerMove} onPointerUp={onCornerUp} onPointerCancel={onCornerUp} title="모서리를 왼쪽으로 끌어 넘기기"><span /></div>}
              {idx > 0 && <div class="corner left" onPointerDown={onCornerDown(-1)} onPointerMove={onCornerMove} onPointerUp={onCornerUp} onPointerCancel={onCornerUp} title="모서리를 오른쪽으로 끌어 넘기기"><span /></div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PageContent({ item, v }: { item: MMItemView; v: MMView }) {
  if (!item) return null;
  if (item.kind === 'sheet') {
    const me = v.people.find((p) => p.id === v.me.charId);
    return (
      <div class="page-inner">
        <div class="page-stamp">CONFIDENTIAL · {me?.name ?? ''} 전용</div>
        <RichText text={item.sheet!.body} />
      </div>
    );
  }
  return (
    <div class="page-inner common">
      <div class="page-stamp public">공용집 · 모두에게 공개</div>
      <h2 class="common-title">{item.title}</h2>
      <CommonBody blocks={item.common!.blocks} />
    </div>
  );
}

/** 공용집 본문 (서술 / 대사 / 소제목). 사건 파일과 '테이블에 펼치기' 가 같은 모양을 쓴다. */
export function CommonBody({ blocks }: { blocks: CommonBlock[] }) {
  const v = view();
  const colorOf = (speaker: string) => v.people.find((p) => speaker.startsWith(p.name))?.color ?? '#6b5a48';
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'heading') return <h3 key={i}>{b.text}</h3>;
        if (b.type === 'narration') return <p key={i} class="narration">{b.text}</p>;
        return (
          <div key={i} class="dialogue">
            <span class="speaker pixel" style={{ '--c': colorOf(b.speaker) } as any}>{b.speaker}</span>
            <p>“{b.text}”</p>
          </div>
        );
      })}
    </>
  );
}
