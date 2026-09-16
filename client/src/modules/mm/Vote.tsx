import { useEffect, useRef, useState } from 'preact/hooks';
import { act, Portrait, view } from './util';
import { bus } from '../../net/net';
import { sfx } from '../../audio/sfx';

/** 범인 지목: 도장을 끌어다 용의자 카드에 찍고, 길게 눌러 확정 */
export function VoteBoard(props: { minimized: boolean; onToggle: () => void }) {
  const v = view();
  const step = v.step!;
  const vote = v.vote!;
  const candidates = (step.vote?.candidates ?? []).map((id) => v.people.find((p) => p.id === id)!).filter(Boolean);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [slam, setSlam] = useState<string | null>(null);
  const [hold, setHold] = useState(0);
  const holdTimer = useRef<number | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const participant = v.me.participant;
  const me = v.participants.find((p) => p.userId === v.me.userId);

  useEffect(() => bus.on('g:voteConfirm', (p: { charId: string }) => { if (p.charId !== v.me.charId) sfx.seal(); }), [v.me.charId]);
  useEffect(() => () => { if (holdTimer.current) cancelAnimationFrame(holdTimer.current); }, []);

  if (props.minimized) {
    return <button class="vote-mini btn red" onClick={props.onToggle}>🔴 범인 지목 보드 열기 · 확정 {vote.confirmedCount}/{vote.eligibleCount}</button>;
  }

  const hit = (x: number, y: number) => {
    for (const [id, el] of cardRefs.current) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
    }
    return null;
  };
  const down = (e: PointerEvent) => {
    if (vote.confirmed || !vote.eligible) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ x: e.clientX, y: e.clientY });
    sfx.cardSlide();
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    setDrag({ x: e.clientX, y: e.clientY });
    const h = hit(e.clientX, e.clientY);
    if (h !== hoverId) { setHoverId(h); if (h) sfx.hover(); }
  };
  const up = async (e: PointerEvent) => {
    if (!drag) return;
    const target = hit(e.clientX, e.clientY);
    setDrag(null); setHoverId(null);
    if (!target) { sfx.cardSlide(); return; }
    setSlam(target);
    sfx.stamp();
    setTimeout(() => setSlam(null), 500);
    await act('vote', { candidateId: target });
  };

  const startHold = () => {
    if (!vote.myChoice || vote.confirmed) return;
    const t0 = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / 900);
      setHold(p);
      if (p >= 1) { holdTimer.current = null; setHold(0); act('voteConfirm', { confirmed: true }).then((ok) => ok && (sfx.seal(), sfx.stamp())); return; }
      if (Math.floor(p * 10) !== Math.floor((p - 0.02) * 10)) sfx.tick();
      holdTimer.current = requestAnimationFrame(tick);
    };
    holdTimer.current = requestAnimationFrame(tick);
  };
  const endHold = () => { if (holdTimer.current) cancelAnimationFrame(holdTimer.current); holdTimer.current = null; setHold(0); };

  return (
    <div class="vote-back">
      <div class="vote-board">
        <div class="vote-head">
          <div>
            <div class="chip red">최종 투표 · {v.scenario.voteVisibility === 'anonymous' ? '익명 집계' : '누가 누구를 지목했는지 공개'}</div>
            <h2 class="serif">{step.vote?.question}</h2>
          </div>
          <button class="btn ghost sm" onClick={props.onToggle}>잠시 접기 (맵 보기)</button>
        </div>
        <div class="suspects">
          {candidates.map((c, i) => {
            const chosen = vote.myChoice === c.id;
            return (
              <div key={c.id} ref={(el) => { if (el) cardRefs.current.set(c.id, el); else cardRefs.current.delete(c.id); }}
                class={`suspect ${chosen ? 'chosen' : ''} ${hoverId === c.id ? 'hover' : ''} ${slam === c.id ? 'slam' : ''}`} style={{ '--rot': `${((i * 41) % 5) - 2}deg` } as any}>
                <span class="pin" />
                <Portrait person={c} />
                <div class="s-name serif">{c.name}</div>
                <div class="s-title tiny dim">{c.title}{c.age ? ` · ${c.age}` : ''}</div>
                {!c.isCharacter && <span class="chip tiny">NPC</span>}
                {c.takenByName && <span class="chip tiny gold">{c.takenByName}</span>}
                {chosen && <div class="ink-stamp serif">지목</div>}
              </div>
            );
          })}
        </div>
        <div class="vote-foot">
          <div class="voters">
            {v.participants.map((p) => {
              const ch = v.people.find((x) => x.id === p.charId);
              return <span key={p.userId} class={`chip ${p.ready ? 'red' : ''}`}>{p.ready ? '🔴 확정' : ch?.canVote === false ? '— 투표 안 함' : '… 고민 중'} · {ch?.name ?? p.nickname}</span>;
            })}
          </div>
          {participant && vote.eligible && (
            <div class="stamp-dock">
              {!vote.confirmed ? (
                <>
                  <div class={`stamp-tool ${drag ? 'lifted' : ''}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                    style={drag ? { position: 'fixed', left: drag.x - 40, top: drag.y - 60, zIndex: 80 } : undefined}>
                    <div class="stamp-handle" /><div class="stamp-base serif">지목</div>
                  </div>
                  {drag && <div class="stamp-ghost" />}
                  <div class="dock-help pixel small">{vote.myChoice ? '다시 끌어서 바꿀 수 있어요' : '도장을 끌어 용의자 카드 위에 찍으세요'}</div>
                  <button class="hold-confirm btn red lg" disabled={!vote.myChoice} onPointerDown={startHold} onPointerUp={endHold} onPointerLeave={endHold} onPointerCancel={endHold}>
                    <span class="hold-fill" style={{ width: `${hold * 100}%` }} />
                    <span class="hold-text">{vote.myChoice ? `「${v.people.find((p) => p.id === vote.myChoice)?.name}」 길게 눌러 확정` : '먼저 지목하세요'}</span>
                  </button>
                </>
              ) : (
                <div class="row">
                  <span class="pixel">🔴 「{v.people.find((p) => p.id === vote.myChoice)?.name}」(으)로 확정했습니다. 다른 참가자를 기다리는 중…</span>
                  <button class="btn ghost sm" onClick={() => act('voteConfirm', { confirmed: false })}>확정 취소</button>
                </div>
              )}
            </div>
          )}
          {participant && !vote.eligible && (
            <div class="row">
              <span class="pixel dim">이 인물은 투표에 참여하지 않습니다. 결과를 기다려 주세요.</span>
              <button class={`btn sm ${me?.ready ? '' : 'gold'}`} onClick={() => act('ready', { ready: !me?.ready })}>{me?.ready ? '확인 취소' : '확인'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
