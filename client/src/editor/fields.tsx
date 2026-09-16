import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { uploadImage } from './state';

export function Field(props: { label: string; hint?: string; children: ComponentChildren; wide?: boolean }) {
  return (
    <label class={`ed-field ${props.wide ? 'wide' : ''}`}>
      <span class="ed-label">{props.label}{props.hint && <em>{props.hint}</em>}</span>
      {props.children}
    </label>
  );
}

export function Text(props: { value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number; mono?: boolean }) {
  return <input class={`ed-input ${props.mono ? 'mono' : ''}`} value={props.value} placeholder={props.placeholder} maxLength={props.maxLength} onInput={(e) => props.onChange((e.target as HTMLInputElement).value)} />;
}

export function Area(props: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return <textarea class="ed-input area" rows={props.rows ?? 4} value={props.value} placeholder={props.placeholder} onInput={(e) => props.onChange((e.target as HTMLTextAreaElement).value)} />;
}

export function Num(props: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return <input class="ed-input num" type="number" value={props.value} min={props.min} max={props.max} step={props.step} onInput={(e) => { const n = Number((e.target as HTMLInputElement).value); if (Number.isFinite(n)) props.onChange(n); }} />;
}

export function Check(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <label class="ed-check"><input type="checkbox" checked={props.checked} onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)} /> {props.label}</label>;
}

export function Select<T extends string>(props: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <select class="ed-input" value={props.value} onChange={(e) => props.onChange((e.target as HTMLSelectElement).value as T)}>{props.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
}

/** 분:초 입력 */
export function Duration(props: { sec: number; onChange: (s: number) => void }) {
  const m = Math.floor(props.sec / 60), s = props.sec % 60;
  return (
    <span class="ed-duration">
      <input class="ed-input num" type="number" min={0} value={m} onInput={(e) => props.onChange(Math.max(0, Number((e.target as HTMLInputElement).value)) * 60 + s)} />분
      <input class="ed-input num" type="number" min={0} max={59} value={s} onInput={(e) => props.onChange(m * 60 + Math.min(59, Math.max(0, Number((e.target as HTMLInputElement).value))))} />초
    </span>
  );
}

export function ImageInput(props: { value: string | null; onChange: (v: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f?: File | null) => {
    if (!f) return;
    setBusy(true);
    const url = await uploadImage(f);
    setBusy(false);
    if (url) props.onChange(url);
  };
  return (
    <div class="ed-image" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer?.files?.[0]); }}>
      {props.value ? <img src={props.value} alt="" /> : <div class="ph">이미지를 끌어다 놓거나<br />선택하세요</div>}
      <div class="row">
        <button type="button" class="ed-btn sm" onClick={() => ref.current?.click()} disabled={busy}>{busy ? '올리는 중…' : props.value ? '바꾸기' : '업로드'}</button>
        {props.value && <button type="button" class="ed-btn sm ghost" onClick={() => props.onChange(null)}>제거</button>}
      </div>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => pick((e.target as HTMLInputElement).files?.[0])} />
    </div>
  );
}

export function ListControls(props: { index: number; length: number; onMove: (to: number) => void; onRemove: () => void; onDuplicate?: () => void }) {
  return (
    <span class="ed-listctl">
      <button type="button" title="위로" disabled={props.index === 0} onClick={() => props.onMove(props.index - 1)}>▲</button>
      <button type="button" title="아래로" disabled={props.index === props.length - 1} onClick={() => props.onMove(props.index + 1)}>▼</button>
      {props.onDuplicate && <button type="button" title="복제" onClick={props.onDuplicate}>⧉</button>}
      <button type="button" title="삭제" class="danger" onClick={() => { if (confirm('삭제할까요?')) props.onRemove(); }}>✕</button>
    </span>
  );
}

export function move<T>(arr: T[], from: number, to: number) {
  const [x] = arr.splice(from, 1);
  arr.splice(to, 0, x);
}

export const MARKUP_HELP = '# 제목 · ## 소제목 · > 인용 · - 목록 · !! 비밀 강조 · **굵게**';
