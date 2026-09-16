import { useEffect, useRef, useState } from 'preact/hooks';
import type { Scenario, Step, RevealItem } from '@shared/mm/scenario';
import { ADVANCE_LABEL } from '@shared/mm/scenario';
import { MAPS, TILE } from '@shared/world';
import { draft, update, uid } from './state';
import { Area, Check, Duration, Field, ListControls, move, Num, Select, Text } from './fields';
import { renderFloor, objectSprite, drawAnimated, isAnimated } from '../world/mapArt';

const KIND = { discussion: '토론', interrogation: '심문/밀담', vote: '투표' } as const;

function recipientsOf(s: Scenario, step: Extract<Step, { type: 'reveal' }>, item: RevealItem): string[] {
  const targets = step.targets === 'all' ? s.characters.map((c) => c.id) : step.targets;
  if (item.kind === 'sheet') { const p = s.sheetPages.find((x) => x.id === item.refId); return p && targets.includes(p.charId) ? [p.charId] : []; }
  if (item.kind === 'common') return targets;
  const c = s.clues.find((x) => x.id === item.refId);
  if (!c) return [];
  return c.scope === 'public' ? targets : targets.filter((t) => c.owners.includes(t));
}

export function FlowTab() {
  const s = draft.value!;
  const [open, setOpen] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const name = (id: string) => s.characters.find((c) => c.id === id)?.name ?? s.suspects.find((c) => c.id === id)?.name ?? id;
  const total = s.flow.reduce((a, st) => a + (st.durationSec || (st.type === 'reveal' ? 300 : 0)), 0);

  const addReveal = () => update((d) => { const id = uid('step'); d.flow.push({ id, type: 'reveal', title: '정보 공개', note: '', advance: 'allReady', durationSec: 0, extendSec: 120, zonesOpen: true, targets: 'all', items: [] }); setOpen(id); });
  const addPhase = (kind: 'discussion' | 'interrogation' | 'vote') => update((d) => {
    const id = uid('step');
    d.flow.push({ id, type: 'phase', kind, title: KIND[kind], note: '', advance: kind === 'vote' ? 'allReady' : 'either', durationSec: kind === 'vote' ? 300 : 900, extendSec: 120, zonesOpen: kind !== 'vote',
      vote: kind === 'vote' ? { question: '범인은 누구인가?', candidates: [...d.characters.map((c) => c.id), ...d.suspects.map((n) => n.id)] } : null });
    setOpen(id);
  });

  return (
    <div class="ed-stack">
      <p class="ed-help">진행 흐름은 <b>공개 이벤트</b>와 <b>토론·심문·투표 페이즈</b>를 원하는 순서로 늘어놓은 하나의 목록입니다. 카드를 끌어 순서를 바꾸세요. 다음 단계로 넘어가는 조건은 단계마다 정하고, 특정 참가자에게 진행 권한은 주어지지 않습니다.</p>
      <div class="ed-timeline">
        {s.flow.map((st, i) => (
          <div key={st.id} class={`tl ${st.type} ${st.type === 'phase' ? st.kind : ''}`} style={{ flex: Math.max(1, (st.durationSec || 240) / 60) }} title={`${i + 1}. ${st.title}`} onClick={() => setOpen(st.id)}>
            <span>{i + 1}</span>
          </div>
        ))}
      </div>
      <div class="dim small">예상 진행 시간 약 {Math.round(total / 60)}분 (공개 단계는 읽는 시간 5분으로 가정) · 시나리오 설정: {s.playtimeMin}분</div>

      {s.flow.map((st, i) => {
        const isOpen = open === st.id;
        return (
          <section key={st.id} class={`ed-card step ${st.type} ${isOpen ? 'open' : ''} ${dragFrom === i ? 'dragging' : ''}`} draggable
            onDragStart={() => setDragFrom(i)} onDragEnd={() => setDragFrom(null)} onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (dragFrom !== null && dragFrom !== i) update((d) => move(d.flow, dragFrom, i)); setDragFrom(null); }}>
            <header onClick={() => setOpen(isOpen ? null : st.id)}>
              <span class="grip">⠿</span>
              <span class="step-no">{i + 1}</span>
              <span class={`kind ${st.type}`}>{st.type === 'reveal' ? '공개 이벤트' : KIND[st.kind]}</span>
              <b>{st.title}</b>
              <span class="chips">
                <i>{ADVANCE_LABEL[st.advance]}</i>
                {st.durationSec > 0 && <i>⏱ {Math.floor(st.durationSec / 60)}분{st.durationSec % 60 ? ` ${st.durationSec % 60}초` : ''}</i>}
                <i>{st.zonesOpen ? '밀담 가능' : '밀담 불가'}</i>
                {st.type === 'reveal' && <i>대상: {st.targets === 'all' ? '전체' : st.targets.map(name).join(', ')} · {st.items.length}개</i>}
              </span>
              <span onClick={(e) => e.stopPropagation()}><ListControls index={i} length={s.flow.length} onMove={(to) => update((d) => move(d.flow, i, to))} onRemove={() => update((d) => { d.flow.splice(i, 1); })}
                onDuplicate={() => update((d) => { d.flow.splice(i + 1, 0, { ...structuredClone(st), id: uid('step') }); })} /></span>
            </header>
            {isOpen && (
              <div class="ed-body">
                <div class="ed-grid">
                  <Field label="단계 제목"><Text value={st.title} onChange={(v) => update((d) => { d.flow[i].title = v; })} /></Field>
                  <Field label="ID"><Text mono value={st.id} onChange={(v) => update((d) => { if (d.ending.voteStepId === d.flow[i].id) d.ending.voteStepId = v; d.flow[i].id = v; })} /></Field>
                  <Field label="화면 안내문 (지금 할 수 있는 일)" wide><Area rows={2} value={st.note} onChange={(v) => update((d) => { d.flow[i].note = v; })} /></Field>
                  <Field label="다음 단계로 넘어가는 조건">
                    <Select value={st.advance} options={(st.type === 'reveal' ? ['allReady', 'timer', 'either', 'immediate'] : ['allReady', 'timer', 'either']).map((k) => [k as Step['advance'], ADVANCE_LABEL[k as Step['advance']]])} onChange={(v) => update((d) => { d.flow[i].advance = v; })} />
                  </Field>
                  <Field label="제한시간" hint="0이면 타이머 없음 · 시간이 끝나도 대화는 막지 않습니다"><Duration sec={st.durationSec} onChange={(v) => update((d) => { d.flow[i].durationSec = v; })} /></Field>
                  <Field label="연장 버튼 1회당 추가 시간(초)"><Num min={10} max={1800} value={st.extendSec} onChange={(v) => update((d) => { d.flow[i].extendSec = v; })} /></Field>
                  <Field label="밀담 구역"><Check checked={st.zonesOpen} onChange={(v) => update((d) => { d.flow[i].zonesOpen = v; })} label="이 단계에서 구역별 음성·채팅 분리" /></Field>
                </div>
                {st.type === 'reveal' && <RevealEditor s={s} step={st} index={i} />}
                {st.type === 'phase' && (
                  <div class="ed-grid">
                    <Field label="페이즈 종류"><Select value={st.kind} options={[['discussion', '토론'], ['interrogation', '심문/밀담'], ['vote', '투표']]} onChange={(v) => update((d) => {
                      const p = d.flow[i] as Extract<Step, { type: 'phase' }>; p.kind = v;
                      if (v === 'vote' && !p.vote) p.vote = { question: '범인은 누구인가?', candidates: [...d.characters.map((c) => c.id), ...d.suspects.map((n) => n.id)] };
                      if (v === 'vote' && p.advance === 'immediate') p.advance = 'allReady';
                    })} /></Field>
                    {st.kind === 'vote' && st.vote && (
                      <>
                        <Field label="투표 질문" wide><Text value={st.vote.question} onChange={(v) => update((d) => { (d.flow[i] as any).vote.question = v; })} /></Field>
                        <Field label="후보" wide>
                          <div class="row wrap">
                            {[...s.characters.map((c) => ({ id: c.id, name: c.name, tag: '캐릭터' })), ...s.suspects.map((n) => ({ id: n.id, name: n.name, tag: 'NPC' }))].map((p) => (
                              <Check key={p.id} label={`${p.name} (${p.tag})`} checked={st.vote!.candidates.includes(p.id)} onChange={(on) => update((d) => { const v = (d.flow[i] as any).vote; const set = new Set(v.candidates); on ? set.add(p.id) : set.delete(p.id); v.candidates = [...set]; })} />
                            ))}
                          </div>
                        </Field>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
      <div class="row wrap">
        <button type="button" class="ed-btn primary" onClick={addReveal}>＋ 공개 이벤트</button>
        <button type="button" class="ed-btn" onClick={() => addPhase('discussion')}>＋ 토론</button>
        <button type="button" class="ed-btn" onClick={() => addPhase('interrogation')}>＋ 심문/밀담</button>
        <button type="button" class="ed-btn" onClick={() => addPhase('vote')}>＋ 투표</button>
      </div>
    </div>
  );
}

function RevealEditor({ s, step, index }: { s: Scenario; step: Extract<Step, { type: 'reveal' }>; index: number }) {
  const name = (id: string) => s.characters.find((c) => c.id === id)?.name ?? id;
  const has = (kind: RevealItem['kind'], refId: string) => step.items.some((it) => it.kind === kind && it.refId === refId);
  const toggle = (kind: RevealItem['kind'], refId: string, on: boolean) => update((d) => {
    const st = d.flow[index] as Extract<Step, { type: 'reveal' }>;
    st.items = on ? [...st.items, { kind, refId }] : st.items.filter((it) => !(it.kind === kind && it.refId === refId));
  });
  const earlier = new Set(s.flow.slice(0, index).flatMap((st) => (st.type === 'reveal' ? st.items.map((it) => `${it.kind}:${it.refId}`) : [])));
  const later = new Set(s.flow.slice(index + 1).flatMap((st) => (st.type === 'reveal' ? st.items.map((it) => `${it.kind}:${it.refId}`) : [])));
  const tag = (key: string) => (earlier.has(key) ? <em class="warn">이미 앞에서 공개됨</em> : later.has(key) ? <em class="dim">뒤 단계에서 공개</em> : null);
  const rec = (it: RevealItem) => { const r = recipientsOf(s, step, it); return <span class={`rec ${r.length ? '' : 'none'}`}>→ {r.length ? r.map(name).join(', ') : '받는 사람 없음'}</span>; };

  return (
    <div class="ed-reveal">
      <Field label="공개 대상" wide>
        <div class="row wrap">
          <Check label="전체" checked={step.targets === 'all'} onChange={(on) => update((d) => { (d.flow[index] as any).targets = on ? 'all' : [d.characters[0].id]; })} />
          {step.targets !== 'all' && s.characters.map((c) => (
            <Check key={c.id} label={c.name} checked={(step.targets as string[]).includes(c.id)} onChange={(on) => update((d) => {
              const st = d.flow[index] as any; const set = new Set<string>(st.targets); on ? set.add(c.id) : set.delete(c.id);
              st.targets = set.size ? [...set] : [c.id];
            })} />
          ))}
        </div>
      </Field>
      <div class="ed-pick">
        <div>
          <h5>📜 캐릭터 설정집 (주인에게만 전달)</h5>
          {s.characters.map((c) => (
            <div key={c.id} class="pick-group">
              <b>{c.name}</b>
              {s.sheetPages.filter((p) => p.charId === c.id).map((p) => (
                <label key={p.id} class="pick"><input type="checkbox" checked={has('sheet', p.id)} onChange={(e) => toggle('sheet', p.id, (e.target as HTMLInputElement).checked)} /> {p.title} {tag(`sheet:${p.id}`)} {has('sheet', p.id) && rec({ kind: 'sheet', refId: p.id })}</label>
              ))}
            </div>
          ))}
        </div>
        <div>
          <h5>📖 공용집</h5>
          {s.commonEntries.map((e) => (
            <label key={e.id} class="pick"><input type="checkbox" checked={has('common', e.id)} onChange={(ev) => toggle('common', e.id, (ev.target as HTMLInputElement).checked)} /> {e.title} {tag(`common:${e.id}`)} {has('common', e.id) && rec({ kind: 'common', refId: e.id })}</label>
          ))}
          <h5>🔎 단서</h5>
          {s.clues.map((c) => (
            <label key={c.id} class="pick"><input type="checkbox" checked={has('clue', c.id)} onChange={(ev) => toggle('clue', c.id, (ev.target as HTMLInputElement).checked)} /> {c.title} <span class="dim small">({c.scope === 'public' ? '공용' : `개인·${c.owners.map(name).join(',')}`})</span> {tag(`clue:${c.id}`)} {has('clue', c.id) && rec({ kind: 'clue', refId: c.id })}</label>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ZonesTab() {
  const s = draft.value!;
  const map = MAPS.salon;
  const W = map.cols * TILE, H = map.rows * TILE;
  const cvRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<string | null>(s.zones[0]?.id ?? null);
  const drag = useRef<{ id: string; mode: 'move' | 'resize' | 'create'; sx: number; sy: number; orig: { x: number; y: number; w: number; h: number } } | null>(null);

  useEffect(() => {
    const g = cvRef.current!.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(renderFloor(map), 0, 0);
    const objs = [...map.objects].sort((a, b) => (a.y + a.h) - (b.y + b.h));
    for (const o of objs) { if (isAnimated(o)) drawAnimated(g, o, 0, 0, 0); else { const sp = objectSprite(o); if (sp) g.drawImage(sp, o.x, o.y); } }
  }, []);

  const toWorld = (e: PointerEvent) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const snap = (v: number) => Math.round(v / 8) * 8;

  const onDown = (e: PointerEvent, id: string | null, mode: 'move' | 'resize' | 'create') => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = toWorld(e);
    if (mode === 'create') {
      const nid = uid('z');
      update((d) => { d.zones.push({ id: nid, name: `구역 ${d.zones.length + 1}`, rect: { x: snap(p.x), y: snap(p.y), w: 16, h: 16 }, maxOccupants: null }); });
      setSel(nid);
      drag.current = { id: nid, mode: 'resize', sx: p.x, sy: p.y, orig: { x: snap(p.x), y: snap(p.y), w: 16, h: 16 } };
      return;
    }
    const z = s.zones.find((x) => x.id === id)!;
    setSel(id);
    drag.current = { id: id!, mode, sx: p.x, sy: p.y, orig: { ...z.rect } };
  };
  const onMove = (e: PointerEvent) => {
    const dr = drag.current;
    if (!dr) return;
    const p = toWorld(e);
    const dx = p.x - dr.sx, dy = p.y - dr.sy;
    update((d) => {
      const z = d.zones.find((x) => x.id === dr.id);
      if (!z) return;
      if (dr.mode === 'move') { z.rect.x = Math.max(0, Math.min(W - z.rect.w, snap(dr.orig.x + dx))); z.rect.y = Math.max(0, Math.min(H - z.rect.h, snap(dr.orig.y + dy))); }
      else { z.rect.w = Math.max(16, Math.min(W - z.rect.x, snap(dr.orig.w + dx))); z.rect.h = Math.max(16, Math.min(H - z.rect.y, snap(dr.orig.h + dy))); }
    });
  };
  const onUp = () => { drag.current = null; };

  const si = s.zones.findIndex((z) => z.id === sel);
  const zsel = s.zones[si];
  return (
    <div class="ed-zones">
      <div class="ed-help">밀담 구역 안에 있는 사람끼리만 음성·채팅이 공유됩니다. <b>빈 곳을 끌어</b> 새 구역을 만들고, 구역을 끌어 옮기거나 오른쪽 아래 모서리로 크기를 조절하세요. 인원 제한은 선택입니다 (예: 1:1 전용 = 2명).</div>
      <div class="zone-layout">
        <div class="zone-stage" ref={stageRef} style={{ aspectRatio: `${W}/${H}` }} onPointerDown={(e) => onDown(e, null, 'create')} onPointerMove={onMove} onPointerUp={onUp}>
          <canvas ref={cvRef} width={W} height={H} />
          {s.zones.map((z) => (
            <div key={z.id} class={`zone-rect ${sel === z.id ? 'sel' : ''}`} style={{ left: `${(z.rect.x / W) * 100}%`, top: `${(z.rect.y / H) * 100}%`, width: `${(z.rect.w / W) * 100}%`, height: `${(z.rect.h / H) * 100}%` }}
              onPointerDown={(e) => onDown(e, z.id, 'move')} onPointerMove={onMove} onPointerUp={onUp}>
              <span class="zl">{z.name}{z.maxOccupants ? ` · 최대 ${z.maxOccupants}명` : ''}</span>
              <span class="rh" onPointerDown={(e) => onDown(e, z.id, 'resize')} onPointerMove={onMove} onPointerUp={onUp} />
            </div>
          ))}
        </div>
        <div class="zone-side">
          {s.zones.map((z, i) => (
            <div key={z.id} class={`zone-item ${sel === z.id ? 'sel' : ''}`} onClick={() => setSel(z.id)}>
              <b>{z.name}</b><span class="dim small">{z.rect.w / TILE}×{z.rect.h / TILE}칸 · {z.maxOccupants ? `최대 ${z.maxOccupants}명` : '인원 제한 없음'}</span>
              <ListControls index={i} length={s.zones.length} onMove={(to) => update((d) => move(d.zones, i, to))} onRemove={() => update((d) => { d.zones.splice(i, 1); })} />
            </div>
          ))}
          {zsel && (
            <div class="ed-sub">
              <Field label="구역 이름"><Text value={zsel.name} maxLength={20} onChange={(v) => update((d) => { d.zones[si].name = v; })} /></Field>
              <Field label="최대 인원"><Check label="인원 제한 사용" checked={zsel.maxOccupants != null} onChange={(on) => update((d) => { d.zones[si].maxOccupants = on ? 2 : null; })} /></Field>
              {zsel.maxOccupants != null && <Num min={1} max={12} value={zsel.maxOccupants} onChange={(v) => update((d) => { d.zones[si].maxOccupants = v; })} />}
            </div>
          )}
          <button type="button" class="ed-btn" onClick={() => update((d) => { d.zones = map.defaultZones.map((z) => ({ id: `z-${z.id}`, name: z.name, rect: { ...z.rect }, maxOccupants: null })); })}>기본 방 구역으로 되돌리기</button>
        </div>
      </div>
    </div>
  );
}

export function EndingTab() {
  const s = draft.value!;
  const votes = s.flow.filter((st) => st.type === 'phase' && st.kind === 'vote');
  const people = [...s.characters.map((c) => ({ id: c.id, name: c.name })), ...s.suspects.map((n) => ({ id: n.id, name: n.name }))];
  return (
    <div class="ed-stack">
      <p class="ed-help">엔딩에는 투표 결과 → 진범 공개 → 결과 문서 → 사건의 진상 · 인물별 결말이 순서대로 공개됩니다. 최다 득표자가 한 명이고 그 사람이 진범이면 “성공” 결말이 나옵니다 (동률은 실패).</p>
      <div class="ed-grid">
        <Field label="결과를 판정할 투표 단계">
          <Select value={s.ending.voteStepId ?? ''} options={[['', votes.length ? '마지막 투표 단계 (자동)' : '투표 없음'], ...votes.map((v) => [v.id, v.title] as [string, string])]} onChange={(v) => update((d) => { d.ending.voteStepId = v || null; })} />
        </Field>
        <Field label="진범">
          <div class="row wrap">{people.map((p) => <Check key={p.id} label={p.name} checked={s.ending.culpritIds.includes(p.id)} onChange={(on) => update((d) => { const set = new Set(d.ending.culpritIds); on ? set.add(p.id) : set.delete(p.id); d.ending.culpritIds = [...set]; })} />)}</div>
        </Field>
      </div>
      {(['success', 'failure', 'truth'] as const).map((k) => (
        <section key={k} class="ed-card open">
          <header><b>{k === 'success' ? '✅ 진범 검거 시 결과' : k === 'failure' ? '❌ 진범을 놓쳤을 때 결과' : '🗝 사건의 진상 (항상 공개)'}</b></header>
          <div class="ed-body ed-grid">
            <Field label="제목"><Text value={s.ending[k].title} onChange={(v) => update((d) => { d.ending[k].title = v; })} /></Field>
            <Field label="본문" wide><Area rows={k === 'truth' ? 12 : 5} value={s.ending[k].body} onChange={(v) => update((d) => { d.ending[k].body = v; })} /></Field>
          </div>
        </section>
      ))}
      <section class="ed-card open">
        <header><b>🎭 인물별 결말</b></header>
        <div class="ed-body">
          {s.characters.map((c) => {
            const idx = s.ending.characterEndings.findIndex((x) => x.charId === c.id);
            const ce = s.ending.characterEndings[idx];
            if (!ce) return <button key={c.id} type="button" class="ed-btn" onClick={() => update((d) => { d.ending.characterEndings.push({ charId: c.id, success: '', failure: '' }); })}>＋ {c.name} 결말 추가</button>;
            return (
              <div key={c.id} class="ed-sub ed-grid">
                <b class="wide">{c.name}</b>
                <Field label="검거 성공 시"><Area rows={3} value={ce.success} onChange={(v) => update((d) => { d.ending.characterEndings[idx].success = v; })} /></Field>
                <Field label="검거 실패 시"><Area rows={3} value={ce.failure} onChange={(v) => update((d) => { d.ending.characterEndings[idx].failure = v; })} /></Field>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
