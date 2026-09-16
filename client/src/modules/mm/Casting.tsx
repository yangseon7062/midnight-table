import { useEffect, useState } from 'preact/hooks';
import { act, Portrait, useNow, view } from './util';
import { sfx } from '../../audio/sfx';

/** 캐릭터 선택: 테이블 위에 놓인 인물 카드를 집어 든다 */
export function Casting() {
  const v = view();
  const now = useNow(200);
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const chars = v.people.filter((p) => p.isCharacter);
  const npcs = v.people.filter((p) => !p.isCharacter);
  const myChar = v.me.charId;
  const participant = v.me.participant;
  const iAmReady = !!v.casting?.ready.includes(v.me.userId);
  const startsAt = v.casting?.startsAt;
  const count = startsAt ? Math.max(0, Math.ceil((startsAt - now) / 1000)) : null;

  useEffect(() => {
    const t = chars.map((c, i) => setTimeout(() => { setFlipped((s) => new Set([...s, c.id])); sfx.cardFlip(); }, 450 + i * 260));
    sfx.cardSlide();
    return () => t.forEach(clearTimeout);
  }, []);
  useEffect(() => { if (count !== null) sfx.tick(true); }, [count]);

  const pick = async (id: string, takenBy: string | null) => {
    if (!participant) return;
    if (takenBy === v.me.userId) { if (await act('unpick')) sfx.cardSlide(); return; }
    if (takenBy) { sfx.error(); return; }
    if (await act('pick', { charId: id })) sfx.cardSlide();
  };

  return (
    <div class="mm-casting">
      <div class="casting-head">
        <div class="chip gold">머더미스터리</div>
        <h2 class="serif">{v.scenario.title}</h2>
        <p class="serif dim">{v.scenario.subtitle}</p>
        <p class="casting-summary serif">{v.scenario.summary}</p>
      </div>
      <div class="pixel casting-instr">{participant ? (myChar ? '맡을 인물을 골랐습니다. 준비가 되면 아래 버튼을 누르세요.' : '테이블 위의 인물 카드 중 맡을 사람을 클릭해 집어 드세요.') : '참가자들이 배역을 고르는 중입니다.'}</div>
      <div class="cast-cards">
        {chars.map((c, i) => {
          const mine = c.takenBy === v.me.userId;
          const taken = !!c.takenBy && !mine;
          return (
            <button key={c.id} class={`cast-card ${flipped.has(c.id) ? 'flipped' : ''} ${mine ? 'mine' : ''} ${taken ? 'taken' : ''}`} style={{ '--i': i } as any} onClick={() => pick(c.id, c.takenBy)} onMouseEnter={() => sfx.hover()}>
              <div class="cast-inner">
                <div class="cast-back"><div class="back-emblem">?</div></div>
                <div class="cast-front">
                  <Portrait person={c} />
                  <div class="cast-body">
                    <div class="cast-name serif">{c.name}</div>
                    <div class="cast-title small dim">{c.title}{c.age ? ` · ${c.age}` : ''}</div>
                    <p class="serif small">{c.publicIntro}</p>
                  </div>
                  {c.takenByName && <div class={`taken-tag pixel ${mine ? 'me' : ''}`}>{mine ? '내 인물' : `${c.takenByName} 선택`}</div>}
                  {c.required && <span class="req chip tiny">필수</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {npcs.length > 0 && (
        <div class="npc-strip">
          <span class="pixel faint small">등장인물 (NPC)</span>
          {npcs.map((n) => <div class="npc" key={n.id}><Portrait person={n} size={34} /><div><b class="serif">{n.name}</b><div class="tiny faint">{n.title}</div></div></div>)}
        </div>
      )}
      <div class="casting-foot">
        <div class="row">
          {v.participants.map((p) => {
            const c = v.people.find((x) => x.id === p.charId);
            return <span key={p.userId} class={`chip ${p.ready ? 'green' : ''}`}>{p.ready ? '✓' : '…'} {p.nickname}{c ? ` → ${c.name}` : ''}{!p.connected ? ' (연결 끊김)' : ''}</span>;
          })}
        </div>
        {participant && (
          <div class="row">
            <button class="btn" onClick={() => act('random').then((ok) => ok && sfx.cardFlip())}>🎲 남은 배역 무작위</button>
            <button class={`btn lg ${iAmReady ? '' : 'gold'}`} disabled={!myChar} onClick={() => act('castReady', { ready: !iAmReady }).then((ok) => ok && (iAmReady ? sfx.click() : sfx.stamp()))}>{iAmReady ? '준비 취소' : '이 인물로 준비 완료'}</button>
          </div>
        )}
      </div>
      {count !== null && (
        <div class="countdown big">
          <div class="pixel">막이 오르기까지</div>
          <div class="num" key={count}>{count}</div>
        </div>
      )}
    </div>
  );
}
