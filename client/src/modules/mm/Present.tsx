import { useEffect, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import type { MMItemView } from '@shared/mm/view';
import { act, RichText, view } from './util';
import { CommonBody } from './Dossier';
import { sfx } from '../../audio/sfx';

/** 이 자료가 '나만 보는 것'인가 — 펼치면 되돌릴 수 없는 공개가 된다 */
export const isSecret = (it: MMItemView) => it.kind === 'sheet' || it.clue?.scope === 'private';

/**
 * 「테이블에 펼치기」 버튼.
 * 말로만 설명하는 대신 자료를 같은 자리에 있는 사람들 화면에 동시에 띄운다.
 * 비공개 자료는 한 번 더 묻는다 — 공개하면 되돌릴 수 없다.
 */
export function PresentButton(props: { item: MMItemView; compact?: boolean }) {
  const v = view();
  const [asking, setAsking] = useState(false);
  const live = v.presentation?.key === props.item.key;
  const secret = isSecret(props.item);
  if (v.stage !== 'flow' || !v.me.participant || !props.item.opened) return null;

  const spread = async () => {
    setAsking(false);
    if (await act('present', { key: props.item.key, confirm: true })) sfx.cardSlide();
  };

  if (live) {
    return (
      <button class="btn sm present live" onClick={() => { act('unpresent'); sfx.paper(); }} title="테이블에서 걷기">
        📂 펼치는 중 · 걷기
      </button>
    );
  }
  return (
    <>
      <button class={`btn sm present ${secret ? 'secret' : 'gold'}`} onClick={() => (secret ? setAsking(true) : spread())}
        title={secret ? '모두에게 보여 줍니다 (되돌릴 수 없음)' : '같은 자리에 있는 사람들에게 보여 줍니다'}>
        📂 테이블에 펼치기{props.compact ? '' : secret ? ' (공개)' : ''}
      </button>
      {asking && createPortal(
        <div class="confirm-back" onPointerDown={(e) => { if (e.target === e.currentTarget) setAsking(false); }}>
          <div class="panel confirm-card">
            <h3 class="serif">정말 공개할까요?</h3>
            <p class="serif">
              「{props.item.title}」은(는) <b class="danger">나만 볼 수 있는 자료</b>입니다.<br />
              테이블에 펼치면 지금 같은 자리에 있는 사람들이 내용을 그대로 보게 되고, <b>되돌릴 수 없습니다.</b>
            </p>
            <p class="dim small">밀담 구역 안이라면 그 구역에 있는 사람에게만 보입니다.</p>
            <div class="row" style={{ justifyContent: 'flex-end' }}>
              <button class="btn ghost" onClick={() => setAsking(false)}>그만두기</button>
              <button class="btn red" onClick={spread}>공개하고 펼치기</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}

/** 펼쳐진 자료를 모두의 화면에 띄운다. 각자 닫을 수 있고, 닫으면 '같이 보기 중' 띠가 남는다. */
export function Presentation() {
  const v = view();
  const pr = v.presentation;
  const [hiddenKey, setHiddenKey] = useState<string | null>(null);

  useEffect(() => {
    if (!pr) { setHiddenKey(null); return; }
    sfx.cardSlide();
  }, [pr?.key, pr?.at]);

  useEffect(() => {
    if (!pr || hiddenKey === pr.key) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setHiddenKey(pr.key); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [pr?.key, hiddenKey]);

  if (!pr) return null;
  const it = pr.item;

  if (hiddenKey === pr.key) {
    return (
      <button class="present-banner" onClick={() => setHiddenKey(null)}>
        <span class="ico">📂</span>
        <span class="pixel tiny">{pr.byName}이(가) 펼친 「{it.title}」 · 같이 보기 중</span>
        <span class="pixel tiny open">다시 보기</span>
      </button>
    );
  }

  return (
    <div class="present-back" onPointerDown={(e) => { if (e.target === e.currentTarget) setHiddenKey(pr.key); }}>
      <div class="present-sheet panel">
        <div class="present-head">
          <div>
            <span class={`chip ${pr.wasPrivate ? 'red' : 'gold'}`}>{pr.wasPrivate ? '🔓 공개된 비공개 자료' : '📂 함께 보는 자료'}</span>
            <h3 class="serif">{it.title}</h3>
            <div class="dim small">{pr.mine ? '내가 테이블에 펼쳤습니다' : `${pr.byName}이(가) 테이블에 펼쳤습니다`}</div>
          </div>
          <div class="row">
            {pr.mine && <button class="btn sm" onClick={() => { act('unpresent'); sfx.paper(); }}>테이블에서 걷기</button>}
            <button class="btn ghost sm" onClick={() => setHiddenKey(pr.key)}>닫기 (Esc)</button>
          </div>
        </div>
        <div class="present-body paper">
          {it.kind === 'clue' && it.clue?.type === 'image' && it.clue.image
            ? <img class="present-img" src={it.clue.image} alt={it.title} draggable={false} />
            : it.kind === 'common' && it.common
              ? <CommonBody blocks={it.common.blocks} />
              : <RichText text={it.kind === 'sheet' ? it.sheet?.body ?? '' : it.clue?.text ?? ''} />}
          {it.clue?.caption && <p class="viewer-caption serif">{it.clue.caption}</p>}
          {it.kind === 'clue' && it.clue?.type === 'image' && it.clue.text && <div class="rich small"><RichText text={it.clue.text} /></div>}
        </div>
        <div class="faint tiny pixel present-foot">닫아도 발표는 계속됩니다 — 화면 아래 띠를 눌러 다시 볼 수 있어요</div>
      </div>
    </div>
  );
}
