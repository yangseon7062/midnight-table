import { useEffect, useRef, useState } from 'preact/hooks';
import type { MMItemView } from '@shared/mm/view';
import { act, view } from './util';
import { sfx } from '../../audio/sfx';

export interface Bundle { stepIndex: number; title: string; items: MMItemView[] }

const KIND_ICON = { sheet: '📜', common: '📖', clue: '🔎' } as const;
const KIND_LABEL = { sheet: '설정집', common: '공용집', clue: '단서' } as const;

/** 우편함: 아직 다 열어보지 않은 봉투 더미 */
export function Mailbox(props: { bundles: Bundle[]; onOpen: (b: Bundle) => void }) {
  const pending = props.bundles.filter((b) => b.items.some((i) => !i.opened));
  const prev = useRef(pending.length);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (pending.length > prev.current) { setBump((b) => b + 1); sfx.cardSlide(); }
    prev.current = pending.length;
  }, [pending.length]);
  if (!pending.length) return null;
  const top = pending[pending.length - 1];
  return (
    <button class="mailbox" key={bump} onClick={() => { props.onOpen(top); sfx.paper(); }} title="봉투 열기">
      {pending.slice(-3).map((b, i, arr) => (
        <div key={b.stepIndex} class="env-mini" style={{ '--k': arr.length - 1 - i } as any}>
          <div class="seal-mini" />
        </div>
      ))}
      <div class="mailbox-label pixel">
        <b>새 봉투 {pending.length}</b>
        <span class="tiny">「{top.title}」 · 클릭해서 열기</span>
      </div>
    </button>
  );
}

/** 봉투 개봉 → 내용물이 테이블에 펼쳐지고, 하나씩 뒤집어 확인한다 */
export function EnvelopeOpener(props: { bundle: Bundle; scenarioInitial: string; onClose: () => void; onRead: (item: MMItemView) => void }) {
  const v = view();
  const items = (v.items.filter((i) => i.stepIndex === props.bundle.stepIndex));
  const alreadyTorn = items.some((i) => i.opened);
  const [progress, setProgress] = useState(alreadyTorn ? 1 : 0);
  const [opened, setOpened] = useState(alreadyTorn);
  const [dragging, setDragging] = useState(false);
  const [flipping, setFlipping] = useState<string | null>(null);
  const start = useRef<{ y: number; p: number } | null>(null);
  const lastTear = useRef(0);

  const finishOpen = () => {
    setProgress(1); setOpened(true);
    sfx.seal(); setTimeout(() => sfx.paper(), 180);
  };

  const onDown = (e: PointerEvent) => {
    if (opened) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { y: e.clientY, p: progress };
    setDragging(true);
  };
  const onMove = (e: PointerEvent) => {
    if (!start.current || opened) return;
    const p = Math.max(0, Math.min(1, start.current.p + (start.current.y - e.clientY) / 160));
    if (Math.abs(p - lastTear.current) > 0.12) { sfx.tear(p); lastTear.current = p; }
    setProgress(p);
  };
  const onUp = () => {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    if (progress > 0.55) finishOpen();
    else { setProgress(0); lastTear.current = 0; }
  };

  const flip = async (item: MMItemView) => {
    if (item.opened) { props.onRead(item); return; }
    setFlipping(item.key);
    sfx.cardFlip();
    await act('open', { key: item.key });
    setTimeout(() => setFlipping(null), 500);
  };

  const unopened = items.filter((i) => !i.opened).length;

  return (
    <div class="env-back" onPointerDown={(e) => { if (e.target === e.currentTarget && opened) props.onClose(); }}>
      {!opened && (
        <div class="env-stage">
          <div class="env-caption pixel">「{props.bundle.title}」</div>
          <div class={`envelope ${dragging ? 'dragging' : ''}`} style={{ '--p': progress } as any}>
            <div class="env-body" />
            <div class="env-paper" />
            <div class="env-front" />
            <div class="env-flap"><div class="flap-inner" /></div>
            <div class="wax" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDblClick={finishOpen}
              style={{ transform: `translate(-50%, ${-progress * 120}px) rotate(${progress * -25}deg)` }}>
              <span class="serif">{props.scenarioInitial}</span>
              <div class="wax-crack" style={{ opacity: progress }} />
            </div>
          </div>
          <div class="env-help pixel">
            <span class="arrow">⬆</span> 봉인을 잡고 위로 끌어올려 봉투를 뜯으세요
            <span class="faint tiny">({items.length}개의 자료가 들어 있습니다)</span>
          </div>
          <button class="btn ghost sm" onClick={props.onClose}>나중에 열기</button>
        </div>
      )}
      {opened && (
        <div class="spread">
          <div class="spread-head">
            <div class="pixel">「{props.bundle.title}」에서 나온 자료</div>
            <div class="dim small">{unopened ? `카드를 클릭해 뒤집으세요 · 남은 ${unopened}장` : '모두 확인했습니다. 카드를 다시 클릭하면 크게 볼 수 있어요.'}</div>
          </div>
          <div class="spread-cards">
            {items.map((it, i) => (
              <div key={it.key} class={`spread-card ${it.opened ? 'face' : ''} ${flipping === it.key ? 'flipping' : ''} ${it.kind}`} style={{ '--i': i, '--rot': `${(i % 2 ? 1 : -1) * (2 + (i * 7) % 5)}deg` } as any}
                onClick={() => flip(it)} onMouseEnter={() => sfx.hover()}>
                <div class="sc-inner">
                  <div class="sc-back"><span class="serif">{props.scenarioInitial}</span><span class="tiny pixel">클릭하여 뒤집기</span></div>
                  <div class="sc-front">
                    <div class="sc-kind pixel">{KIND_ICON[it.kind]} {KIND_LABEL[it.kind]}{it.clue?.scope === 'private' || it.kind === 'sheet' ? <span class="secret-stamp">기밀</span> : null}</div>
                    {it.clue?.type === 'image' && it.clue.image ? <img src={it.clue.image} alt="" draggable={false} /> : <div class="sc-lines" />}
                    <div class="sc-title serif">{it.title}</div>
                    <div class="sc-read pixel tiny">크게 보기 ↗</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div class="row" style={{ justifyContent: 'center' }}>
            <button class={`btn ${unopened ? '' : 'gold'} lg`} onClick={() => { props.onClose(); sfx.paper(); }}>{unopened ? '일단 덮어두기' : '자료 정리하기'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
