import { useEffect, useState } from 'preact/hooks';
import { act, Portrait, RichText, view } from './util';
import { sfx } from '../../audio/sfx';

type Phase = 'tally' | 'reveal' | 'result' | 'details';

/** 엔딩 연출: 표 집계 → 진범 공개 → 결과 → 진상/인물별 결말 */
export function Ending(props: { minimized: boolean; onToggle: () => void }) {
  const v = view();
  const e = v.ending!;
  const [phase, setPhase] = useState<Phase>(e.hasVote ? 'tally' : 'reveal');
  const [shown, setShown] = useState(0);
  const [tab, setTab] = useState<'truth' | 'chars'>('truth');
  const totalVotes = e.tally.reduce((a, t) => a + t.count, 0);
  const person = (id: string) => v.people.find((p) => p.id === id);

  useEffect(() => {
    if (phase !== 'tally') return;
    sfx.drumroll(1.2 + totalVotes * 0.5);
    let n = 0;
    const iv = setInterval(() => {
      n++;
      setShown(n);
      sfx.thud();
      if (n >= totalVotes) { clearInterval(iv); setTimeout(() => setPhase('reveal'), 1400); }
    }, 900);
    if (totalVotes === 0) { clearInterval(iv); setTimeout(() => setPhase('reveal'), 1200); }
    return () => clearInterval(iv);
  }, [phase]);
  useEffect(() => {
    if (phase === 'reveal') { sfx.sting(); const t = setTimeout(() => setPhase('result'), 3200); return () => clearTimeout(t); }
    if (phase === 'result') { e.outcome === 'failure' ? sfx.failure() : sfx.success(); }
  }, [phase]);

  if (props.minimized) return <button class="vote-mini btn gold" onClick={props.onToggle}>📜 엔딩 다시 보기</button>;

  // 표를 한 장씩 쌓기 위해 투표 순서를 펼친다
  const tokens: { candidateId: string; voter: string | null }[] = [];
  e.tally.forEach((t) => { for (let k = 0; k < t.count; k++) tokens.push({ candidateId: t.candidateId, voter: t.voters?.[k] ?? null }); });
  const iLeft = e.leaving.includes(v.me.userId);

  return (
    <div class="ending-back">
      {phase === 'tally' && (
        <div class="ending-stage">
          <div class="chip red">투표 결과</div>
          <h2 class="serif">{e.question}</h2>
          <div class="tally">
            {e.tally.map((t) => {
              const p = person(t.candidateId)!;
              const mine = tokens.slice(0, shown).filter((x) => x.candidateId === t.candidateId);
              return (
                <div key={t.candidateId} class="tally-col">
                  <div class="tokens">
                    {mine.map((tk, i) => <div key={i} class="token">{tk.voter ? <span class="pixel tiny">{person(tk.voter)?.name}</span> : <span>●</span>}</div>)}
                  </div>
                  <Portrait person={p} size={70} />
                  <div class="serif small">{p.name}</div>
                </div>
              );
            })}
          </div>
          <button class="btn ghost sm" onClick={() => { setShown(totalVotes); setPhase('reveal'); }}>건너뛰기</button>
        </div>
      )}
      {phase === 'reveal' && (
        <div class="ending-stage reveal">
          <div class="pixel dim">진범은…</div>
          <div class="culprits">
            {e.culpritIds.map((id) => (
              <div key={id} class="culprit-card">
                <div class="cc-inner">
                  <div class="cc-back serif">?</div>
                  <div class="cc-front"><Portrait person={person(id)!} size={160} /><div class="serif big-name">{person(id)?.name}</div><div class="dim small">{person(id)?.title}</div></div>
                </div>
              </div>
            ))}
            {e.culpritIds.length === 0 && <div class="serif big-name">밝혀지지 않았다</div>}
          </div>
        </div>
      )}
      {(phase === 'result' || phase === 'details') && (
        <div class="ending-doc">
          <div class={`outcome ${e.outcome}`}>
            <div class="outcome-stamp serif">{e.outcome === 'success' ? '검거 성공' : e.outcome === 'failure' ? '진범 도주' : '사건 종결'}</div>
            <div class="outcome-meta">
              {e.hasVote && <div class="pixel small">지목된 사람: {e.topIds.length ? e.topIds.map((id) => person(id)?.name).join(', ') : '없음'}{e.topIds.length > 1 ? ' (동률)' : ''} · 진범: {e.culpritIds.map((id) => person(id)?.name).join(', ')}</div>}
              <h2 class="serif">{e.result.title}</h2>
            </div>
          </div>
          <div class="ending-body paper">
            <RichText text={e.result.body} />
          </div>
          {phase === 'result' && <div class="row" style={{ justifyContent: 'center' }}><button class="btn gold lg" onClick={() => { setPhase('details'); sfx.pageFlip(); }}>사건의 진상과 결말 펼쳐보기</button></div>}
          {phase === 'details' && (
            <>
              <div class="row ending-tabs">
                <button class={`chip ${tab === 'truth' ? 'gold' : ''}`} onClick={() => { setTab('truth'); sfx.pageFlip(); }}>🗝 {e.truth.title || '사건의 진상'}</button>
                <button class={`chip ${tab === 'chars' ? 'gold' : ''}`} onClick={() => { setTab('chars'); sfx.pageFlip(); }}>🎭 인물별 결말</button>
              </div>
              {tab === 'truth' && <div class="ending-body paper"><RichText text={e.truth.body} /></div>}
              {tab === 'chars' && (
                <div class="char-endings">
                  {e.characterEndings.map((ce) => {
                    const p = person(ce.charId)!;
                    const player = v.participants.find((x) => x.charId === ce.charId);
                    return (
                      <div key={ce.charId} class="char-ending paper">
                        <Portrait person={p} size={80} />
                        <div>
                          <div class="serif strong">{p.name} <span class="faint small">— {player?.nickname}</span></div>
                          <RichText text={ce.text} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {e.hasVote && !e.anonymous && (
                <div class="panel who-voted">
                  <b class="pixel small">누가 누구를 지목했나</b>
                  {e.tally.filter((t) => t.count).map((t) => <div key={t.candidateId} class="small">{person(t.candidateId)?.name} ← {t.voters?.map((c) => person(c)?.name).join(', ')}</div>)}
                </div>
              )}
              <div class="row" style={{ justifyContent: 'center', gap: 12 }}>
                <button class="btn ghost" onClick={props.onToggle}>잠시 접고 이야기 나누기</button>
                {v.me.participant && <button class="btn gold lg" disabled={iLeft} onClick={() => act('leave').then((ok) => ok && sfx.bell())}>{iLeft ? `다른 참가자를 기다리는 중 (${e.leaving.length}/${v.participants.filter((p) => p.connected).length})` : '테이블 정리하고 방으로 돌아가기'}</button>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
