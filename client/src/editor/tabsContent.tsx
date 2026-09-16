import { useState } from 'preact/hooks';
import { draft, update, uid } from './state';
import { Area, Check, Field, ImageInput, ListControls, MARKUP_HELP, move, Select, Text } from './fields';
import { RichText } from '../modules/mm/util';

export function CommonTab() {
  const s = draft.value!;
  const speakers = [...s.characters.map((c) => c.name), ...s.suspects.map((n) => n.name)];
  const [open, setOpen] = useState<string | null>(s.commonEntries[0]?.id ?? null);
  return (
    <div class="ed-stack">
      <p class="ed-help">공용집은 공개되는 순간 모든 대상에게 동시에 보입니다. 대사 블록에는 <b>화자 라벨</b>만 붙고, 누가 소리 내어 읽을지는 참가자들이 정합니다.</p>
      <datalist id="speakers">{speakers.map((n) => <option key={n} value={n} />)}</datalist>
      {s.commonEntries.map((e, ei) => {
        const isOpen = open === e.id;
        return (
          <section key={e.id} class={`ed-card ${isOpen ? 'open' : ''}`}>
            <header onClick={() => setOpen(isOpen ? null : e.id)}>
              <span>📖</span><b>{e.title}</b><span class="chips"><i>블록 {e.blocks.length}</i><i class="mono">{e.id}</i></span>
              <span onClick={(ev) => ev.stopPropagation()}><ListControls index={ei} length={s.commonEntries.length} onMove={(to) => update((d) => move(d.commonEntries, ei, to))} onRemove={() => update((d) => { d.commonEntries.splice(ei, 1); })} /></span>
            </header>
            {isOpen && (
              <div class="ed-body">
                <div class="ed-grid">
                  <Field label="제목"><Text value={e.title} onChange={(v) => update((d) => { d.commonEntries[ei].title = v; })} /></Field>
                  <Field label="ID"><Text mono value={e.id} onChange={(v) => update((d) => { d.commonEntries[ei].id = v; })} /></Field>
                </div>
                {e.blocks.map((b, bi) => (
                  <div key={bi} class={`ed-block ${b.type}`}>
                    <Select value={b.type} options={[['narration', '서술'], ['dialogue', '대사'], ['heading', '소제목']]} onChange={(v) => update((d) => { d.commonEntries[ei].blocks[bi].type = v; })} />
                    {b.type === 'dialogue' && <input class="ed-input speaker" list="speakers" placeholder="화자 라벨" value={b.speaker} onInput={(ev) => update((d) => { d.commonEntries[ei].blocks[bi].speaker = (ev.target as HTMLInputElement).value; })} />}
                    <Area rows={b.type === 'heading' ? 1 : 3} value={b.text} onChange={(v) => update((d) => { d.commonEntries[ei].blocks[bi].text = v; })} />
                    <ListControls index={bi} length={e.blocks.length} onMove={(to) => update((d) => move(d.commonEntries[ei].blocks, bi, to))} onRemove={() => update((d) => { d.commonEntries[ei].blocks.splice(bi, 1); })}
                      onDuplicate={() => update((d) => { d.commonEntries[ei].blocks.splice(bi + 1, 0, { ...b }); })} />
                  </div>
                ))}
                <div class="row">
                  <button type="button" class="ed-btn" onClick={() => update((d) => { d.commonEntries[ei].blocks.push({ type: 'narration', speaker: '', text: '' }); })}>＋ 서술</button>
                  <button type="button" class="ed-btn" onClick={() => update((d) => { d.commonEntries[ei].blocks.push({ type: 'dialogue', speaker: '', text: '' }); })}>＋ 대사</button>
                  <button type="button" class="ed-btn" onClick={() => update((d) => { d.commonEntries[ei].blocks.push({ type: 'heading', speaker: '', text: '' }); })}>＋ 소제목</button>
                </div>
              </div>
            )}
          </section>
        );
      })}
      <button type="button" class="ed-btn primary" onClick={() => update((d) => { const id = uid('common'); d.commonEntries.push({ id, title: '새 공용집 항목', blocks: [] }); setOpen(id); })}>＋ 공용집 항목 추가</button>
    </div>
  );
}

export function CluesTab() {
  const s = draft.value!;
  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <div class="ed-stack">
      <p class="ed-help">단서는 텍스트 또는 이미지(사진·문서 스캔본)입니다. <b>공용</b>은 공개 대상 전원에게, <b>개인</b>은 지정한 캐릭터에게만 전달됩니다. 플레이어는 확대·돋보기로 자세히 볼 수 있습니다.</p>
      <div class="ed-clue-grid">
        {s.clues.map((c, i) => {
          const isOpen = open === c.id;
          return (
            <section key={c.id} class={`ed-card ${isOpen ? 'open wide' : ''}`}>
              <header onClick={() => setOpen(isOpen ? null : c.id)}>
                <span>{c.type === 'image' ? '🖼' : '📝'}</span><b>{c.title}</b>
                <span class="chips"><i class={c.scope === 'private' ? 'red' : ''}>{c.scope === 'private' ? `개인: ${c.owners.map((o) => s.characters.find((x) => x.id === o)?.name ?? o).join(', ')}` : '공용'}</i></span>
                <span onClick={(e) => e.stopPropagation()}><ListControls index={i} length={s.clues.length} onMove={(to) => update((d) => move(d.clues, i, to))} onRemove={() => update((d) => { d.clues.splice(i, 1); })}
                  onDuplicate={() => update((d) => { d.clues.splice(i + 1, 0, { ...structuredClone(c), id: uid('clue'), title: `${c.title} (복사)` }); })} /></span>
              </header>
              {!isOpen && c.type === 'image' && c.image && <img class="ed-thumb" src={c.image} alt="" onClick={() => setOpen(c.id)} />}
              {isOpen && (
                <div class="ed-body ed-grid">
                  <Field label="제목"><Text value={c.title} onChange={(v) => update((d) => { d.clues[i].title = v; })} /></Field>
                  <Field label="ID"><Text mono value={c.id} onChange={(v) => update((d) => { d.clues[i].id = v; })} /></Field>
                  <Field label="종류"><Select value={c.type} options={[['text', '텍스트'], ['image', '이미지']]} onChange={(v) => update((d) => { d.clues[i].type = v; })} /></Field>
                  <Field label="공개 범위">
                    <div class="col">
                      <Select value={c.scope} options={[['public', '공용 (전체 공개)'], ['private', '개인 (특정 캐릭터만)']]} onChange={(v) => update((d) => { d.clues[i].scope = v; })} />
                      {c.scope === 'private' && <div class="row wrap">{s.characters.map((ch) => (
                        <Check key={ch.id} label={ch.name} checked={c.owners.includes(ch.id)} onChange={(on) => update((d) => { const o = new Set(d.clues[i].owners); on ? o.add(ch.id) : o.delete(ch.id); d.clues[i].owners = [...o]; })} />
                      ))}</div>}
                    </div>
                  </Field>
                  {c.type === 'image' && <Field label="이미지"><ImageInput value={c.image} onChange={(v) => update((d) => { d.clues[i].image = v; })} /></Field>}
                  <Field label="캡션 (이미지 아래 설명)"><Text value={c.caption} onChange={(v) => update((d) => { d.clues[i].caption = v; })} /></Field>
                  <Field label={c.type === 'image' ? '부가 설명 (선택)' : '본문'} hint={MARKUP_HELP} wide>
                    {preview === c.id ? <div class="ed-preview paper"><RichText text={c.text} /></div> : <Area rows={6} value={c.text} onChange={(v) => update((d) => { d.clues[i].text = v; })} />}
                    <button type="button" class="ed-btn sm ghost" onClick={() => setPreview(preview === c.id ? null : c.id)}>{preview === c.id ? '편집' : '미리보기'}</button>
                  </Field>
                </div>
              )}
            </section>
          );
        })}
      </div>
      <button type="button" class="ed-btn primary" onClick={() => update((d) => { const id = uid('clue'); d.clues.push({ id, title: '새 단서', type: 'text', text: '', image: null, caption: '', scope: 'public', owners: [] }); setOpen(id); })}>＋ 단서 추가</button>
    </div>
  );
}
