import { useState } from 'preact/hooks';
import { draft, update, uid } from './state';
import { Area, Check, Field, ImageInput, ListControls, MARKUP_HELP, move, Num, Select, Text } from './fields';
import { RichText } from '../modules/mm/util';

export function BasicTab() {
  const s = draft.value!;
  return (
    <div class="ed-grid">
      <Field label="시나리오 ID" hint="영문/숫자/-/_ · 파일 이름으로 쓰입니다"><Text mono value={s.id} onChange={(v) => update((d) => { d.id = v; })} /></Field>
      <Field label="공개 여부"><Check checked={s.published} onChange={(v) => update((d) => { d.published = v; })} label="게임 선반에 공개 (오류가 없을 때만 실제로 표시)" /></Field>
      <Field label="제목"><Text value={s.title} onChange={(v) => update((d) => { d.title = v; })} /></Field>
      <Field label="부제"><Text value={s.subtitle} onChange={(v) => update((d) => { d.subtitle = v; })} /></Field>
      <Field label="소개글" wide><Area rows={4} value={s.summary} onChange={(v) => update((d) => { d.summary = v; })} /></Field>
      <Field label="최소 인원"><Num min={1} max={12} value={s.minPlayers} onChange={(v) => update((d) => { d.minPlayers = v; })} /></Field>
      <Field label="최대 인원"><Num min={1} max={12} value={s.maxPlayers} onChange={(v) => update((d) => { d.maxPlayers = v; })} /></Field>
      <Field label="예상 플레이 시간(분)"><Num min={5} max={600} value={s.playtimeMin} onChange={(v) => update((d) => { d.playtimeMin = v; })} /></Field>
      <Field label="태그" hint="쉼표로 구분"><Text value={s.tags.join(', ')} onChange={(v) => update((d) => { d.tags = v.split(',').map((x) => x.trim()).filter(Boolean); })} /></Field>
      <Field label="투표 결과 공개 방식">
        <Select value={s.settings.voteVisibility} options={[['public', '공개 — 누가 누구를 지목했는지 보여줌'], ['anonymous', '익명 — 득표 수만 집계']]} onChange={(v) => update((d) => { d.settings.voteVisibility = v; })} />
      </Field>
      <Field label="표지 이미지"><ImageInput value={s.cover} onChange={(v) => update((d) => { d.cover = v; })} /></Field>
    </div>
  );
}

export function CharactersTab() {
  const s = draft.value!;
  const [open, setOpen] = useState<string | null>(s.characters[0]?.id ?? null);
  const [preview, setPreview] = useState<string | null>(null);
  const add = () => update((d) => {
    const id = uid('char');
    d.characters.push({ id, name: '새 인물', title: '', age: '', publicIntro: '', color: '#6d5a3a', portrait: null, required: true, canVote: true, cards: [] });
    d.sheetPages.push({ id: uid('sheet'), charId: id, title: '새 인물 — 설정집', body: '' });
    setOpen(id);
  });
  return (
    <div class="ed-stack">
      <p class="ed-help">캐릭터는 플레이어가 맡는 인물입니다. <b>GM(진행 설명 역할)</b>이 필요하면 설정집에 규칙 설명을 쓴 일반 캐릭터로 만들고, 피해자처럼 투표하지 않는 역할은 “투표 참여”를 끄세요.</p>
      {s.characters.map((c, ci) => {
        const pages = s.sheetPages.filter((p) => p.charId === c.id);
        const isOpen = open === c.id;
        return (
          <section key={c.id} class={`ed-card ${isOpen ? 'open' : ''}`}>
            <header onClick={() => setOpen(isOpen ? null : c.id)}>
              <span class="swatch" style={{ background: c.color }} />
              <b>{c.name}</b><span class="dim">{c.title}</span>
              <span class="chips">{c.required ? <i>필수</i> : <i>선택</i>}{!c.canVote && <i>투표 안 함</i>}<i>설정집 {pages.length}</i><i>카드 {c.cards.length}</i></span>
              <span onClick={(e) => e.stopPropagation()}>
                <ListControls index={ci} length={s.characters.length} onMove={(to) => update((d) => move(d.characters, ci, to))}
                  onRemove={() => update((d) => { d.characters.splice(ci, 1); d.sheetPages = d.sheetPages.filter((p) => p.charId !== c.id); d.ending.characterEndings = d.ending.characterEndings.filter((x) => x.charId !== c.id); })} />
              </span>
            </header>
            {isOpen && (
              <div class="ed-body">
                <div class="ed-grid">
                  <Field label="ID"><Text mono value={c.id} onChange={(v) => update((d) => {
                    const old = d.characters[ci].id; d.characters[ci].id = v;
                    d.sheetPages.forEach((p) => { if (p.charId === old) p.charId = v; });
                  })} /></Field>
                  <Field label="이름"><Text value={c.name} onChange={(v) => update((d) => { d.characters[ci].name = v; })} /></Field>
                  <Field label="직업/관계"><Text value={c.title} onChange={(v) => update((d) => { d.characters[ci].title = v; })} /></Field>
                  <Field label="나이"><Text value={c.age} onChange={(v) => update((d) => { d.characters[ci].age = v; })} /></Field>
                  <Field label="대표 색"><input type="color" class="ed-color" value={c.color} onInput={(e) => update((d) => { d.characters[ci].color = (e.target as HTMLInputElement).value; })} /></Field>
                  <Field label="옵션">
                    <div class="col">
                      <Check checked={c.required} onChange={(v) => update((d) => { d.characters[ci].required = v; })} label="반드시 누군가 맡아야 함" />
                      <Check checked={c.canVote} onChange={(v) => update((d) => { d.characters[ci].canVote = v; })} label="최종 투표 참여" />
                    </div>
                  </Field>
                  <Field label="공개 소개 (캐릭터 선택 화면)" wide><Area rows={2} value={c.publicIntro} onChange={(v) => update((d) => { d.characters[ci].publicIntro = v; })} /></Field>
                  <Field label="초상 이미지 (선택)"><ImageInput value={c.portrait} onChange={(v) => update((d) => { d.characters[ci].portrait = v; })} /></Field>
                </div>

                <h4>📜 설정집 페이지 <span class="dim small">본인만 볼 수 있습니다. 진행 흐름의 “공개 이벤트”에서 언제 전달할지 정합니다. {MARKUP_HELP}</span></h4>
                {pages.map((p) => {
                  const pi = s.sheetPages.indexOf(p);
                  const used = s.flow.some((st) => st.type === 'reveal' && st.items.some((it) => it.kind === 'sheet' && it.refId === p.id));
                  return (
                    <div key={p.id} class="ed-sub">
                      <div class="row">
                        <Text value={p.title} onChange={(v) => update((d) => { d.sheetPages[pi].title = v; })} />
                        <span class="mono dim small">{p.id}</span>
                        {!used && <span class="warn small">⚠ 아직 어떤 공개 단계에도 없음</span>}
                        <button type="button" class="ed-btn sm ghost" onClick={() => setPreview(preview === p.id ? null : p.id)}>{preview === p.id ? '편집' : '미리보기'}</button>
                        <button type="button" class="ed-btn sm ghost danger" onClick={() => { if (confirm('이 페이지를 삭제할까요?')) update((d) => { d.sheetPages.splice(pi, 1); }); }}>삭제</button>
                      </div>
                      {preview === p.id ? <div class="ed-preview paper"><RichText text={p.body} /></div> : <Area rows={12} value={p.body} onChange={(v) => update((d) => { d.sheetPages[pi].body = v; })} />}
                    </div>
                  );
                })}
                <button type="button" class="ed-btn" onClick={() => update((d) => { d.sheetPages.push({ id: uid('sheet'), charId: c.id, title: `${c.name} — 추가 설정집`, body: '' }); })}>＋ 설정집 페이지 추가</button>

                <h4>🃏 능력/아이템 카드 <span class="dim small">효과는 설명 텍스트로만 정의되며, 시스템은 보유·사용 횟수만 관리합니다.</span></h4>
                {c.cards.map((card, ki) => (
                  <div key={card.id} class="ed-sub row top">
                    <div class="grow ed-grid tight">
                      <Field label="카드 이름"><Text value={card.name} onChange={(v) => update((d) => { d.characters[ci].cards[ki].name = v; })} /></Field>
                      <Field label="사용 가능 횟수"><Num min={1} max={99} value={card.uses} onChange={(v) => update((d) => { d.characters[ci].cards[ki].uses = v; })} /></Field>
                      <Field label="설명 (효과)" wide><Area rows={2} value={card.description} onChange={(v) => update((d) => { d.characters[ci].cards[ki].description = v; })} /></Field>
                    </div>
                    <ListControls index={ki} length={c.cards.length} onMove={(to) => update((d) => move(d.characters[ci].cards, ki, to))} onRemove={() => update((d) => { d.characters[ci].cards.splice(ki, 1); })} />
                  </div>
                ))}
                <button type="button" class="ed-btn" onClick={() => update((d) => { d.characters[ci].cards.push({ id: uid('card'), name: '새 카드', description: '', uses: 1 }); })}>＋ 카드 추가</button>
              </div>
            )}
          </section>
        );
      })}
      <button type="button" class="ed-btn primary" onClick={add}>＋ 캐릭터 추가</button>
    </div>
  );
}

export function SuspectsTab() {
  const s = draft.value!;
  return (
    <div class="ed-stack">
      <p class="ed-help">NPC 용의자는 플레이어가 맡지 않지만 투표 후보가 될 수 있는 인물입니다. (예: 2인 시나리오에서 제3의 진범)</p>
      {s.suspects.map((n, i) => (
        <section key={n.id} class="ed-card open">
          <header><span class="swatch" style={{ background: n.color }} /><b>{n.name}</b><span class="dim">{n.title}</span><span />
            <ListControls index={i} length={s.suspects.length} onMove={(to) => update((d) => move(d.suspects, i, to))} onRemove={() => update((d) => { d.suspects.splice(i, 1); })} />
          </header>
          <div class="ed-body ed-grid">
            <Field label="ID"><Text mono value={n.id} onChange={(v) => update((d) => { d.suspects[i].id = v; })} /></Field>
            <Field label="이름"><Text value={n.name} onChange={(v) => update((d) => { d.suspects[i].name = v; })} /></Field>
            <Field label="직업/관계 · 나이"><Text value={n.title} onChange={(v) => update((d) => { d.suspects[i].title = v; })} /></Field>
            <Field label="대표 색"><input type="color" class="ed-color" value={n.color} onInput={(e) => update((d) => { d.suspects[i].color = (e.target as HTMLInputElement).value; })} /></Field>
            <Field label="설명" wide><Area rows={2} value={n.description} onChange={(v) => update((d) => { d.suspects[i].description = v; })} /></Field>
            <Field label="초상 이미지"><ImageInput value={n.portrait} onChange={(v) => update((d) => { d.suspects[i].portrait = v; })} /></Field>
          </div>
        </section>
      ))}
      <button type="button" class="ed-btn primary" onClick={() => update((d) => { d.suspects.push({ id: uid('npc'), name: '새 NPC', title: '', description: '', color: '#5a5a6b', portrait: null }); })}>＋ NPC 용의자 추가</button>
    </div>
  );
}
