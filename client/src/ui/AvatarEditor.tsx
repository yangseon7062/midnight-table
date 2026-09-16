import type { AvatarLook } from '@shared/platform';
import { SKIN_TONES, HAIR_STYLES, HAIR_COLORS, OUTFITS, OUTFIT_COLORS, ACCESSORIES, randomLook } from '@shared/avatar';
import { AvatarPreview } from './common';
import { sfx } from '../audio/sfx';

const ROWS: { key: keyof AvatarLook; label: string; options: string[]; swatch?: boolean }[] = [
  { key: 'hair', label: '머리', options: HAIR_STYLES },
  { key: 'hairColor', label: '머리색', options: HAIR_COLORS, swatch: true },
  { key: 'skin', label: '피부', options: SKIN_TONES, swatch: true },
  { key: 'outfit', label: '옷', options: OUTFITS },
  { key: 'outfitColor', label: '옷 색', options: OUTFIT_COLORS, swatch: true },
  { key: 'accessory', label: '소품', options: ACCESSORIES },
];

export function AvatarEditor(props: { look: AvatarLook; onChange: (l: AvatarLook) => void }) {
  const { look, onChange } = props;
  const set = (key: keyof AvatarLook, dir: number) => {
    const n = ROWS.find((r) => r.key === key)!.options.length;
    onChange({ ...look, [key]: (look[key] + dir + n) % n });
    sfx.click();
  };
  return (
    <div class="avatar-editor">
      <div class="avatar-stage">
        <div class="avatar-spot" />
        <AvatarPreview look={look} size={6} spin walking />
        <button type="button" class="btn sm ghost" onClick={() => { onChange(randomLook()); sfx.cardFlip(); }}>🎲 무작위</button>
      </div>
      <div class="avatar-rows">
        {ROWS.map((r) => (
          <div class="avatar-row" key={r.key}>
            <span class="pixel dim">{r.label}</span>
            <button type="button" class="btn sm icon" aria-label={`${r.label} 이전`} onClick={() => set(r.key, -1)}>◀</button>
            <div class="avatar-value">
              {r.swatch
                ? <div class="swatches">{r.options.map((c, i) => <button type="button" key={c} class={`swatch ${i === look[r.key] ? 'on' : ''}`} style={{ background: c }} onClick={() => { onChange({ ...look, [r.key]: i }); sfx.click(); }} aria-label={`${r.label} ${i + 1}`} />)}</div>
                : <span class="pixel">{r.options[look[r.key]]}</span>}
            </div>
            <button type="button" class="btn sm icon" aria-label={`${r.label} 다음`} onClick={() => set(r.key, 1)}>▶</button>
          </div>
        ))}
      </div>
    </div>
  );
}
