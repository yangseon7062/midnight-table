import type { AvatarLook, Facing } from '@shared/platform';
import { SKIN_TONES, HAIR_COLORS, OUTFIT_COLORS } from '@shared/avatar';
import { shade } from './color';

/**
 * 도트 아바타를 코드로 그린다 (16×24 + 외곽선 1px → 18×26).
 * 방향 4개 × 걷기 프레임 4개를 조합별로 캐시한다.
 */
export const SPRITE_W = 18, SPRITE_H = 26;
const cache = new Map<string, HTMLCanvasElement>();

type Px = (x: number, y: number, w: number, h: number, c: string) => void;

export function avatarSprite(look: AvatarLook, facing: Facing, frame: number, sitting = false): HTMLCanvasElement {
  const key = `${look.skin}.${look.hair}.${look.hairColor}.${look.outfit}.${look.outfitColor}.${look.accessory}|${facing}|${frame}|${sitting ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const base = document.createElement('canvas');
  base.width = 16; base.height = 24;
  const g = base.getContext('2d')!;
  const px: Px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const side = facing === 'left' || facing === 'right';
  if (facing === 'right') { g.translate(16, 0); g.scale(-1, 1); }
  if (side) drawSide(px, look, frame, sitting); else drawFront(px, look, facing === 'up', frame, sitting);

  const out = document.createElement('canvas');
  out.width = SPRITE_W; out.height = SPRITE_H;
  const o = out.getContext('2d')!;
  // 외곽선: 알파 마스크를 8방향으로 번지게 한 뒤 원본을 위에
  const src = g.getImageData(0, 0, 16, 24);
  const outline = o.createImageData(SPRITE_W, SPRITE_H);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 16; x++) {
    if (src.data[(y * 16 + x) * 4 + 3] < 10) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (Math.abs(dx) + Math.abs(dy) !== 1) continue;
      const i = ((y + 1 + dy) * SPRITE_W + (x + 1 + dx)) * 4;
      outline.data[i] = 14; outline.data[i + 1] = 10; outline.data[i + 2] = 14; outline.data[i + 3] = 235;
    }
  }
  o.putImageData(outline, 0, 0);
  o.drawImage(base, 1, 1);
  cache.set(key, out);
  return out;
}

function colors(look: AvatarLook) {
  const skin = SKIN_TONES[look.skin] ?? SKIN_TONES[0];
  const hair = HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[0];
  const cloth = OUTFIT_COLORS[look.outfitColor] ?? OUTFIT_COLORS[0];
  return {
    skin, skinD: shade(skin, -0.18), hair, hairL: shade(hair, 0.22), hairD: shade(hair, -0.3),
    cloth, clothL: shade(cloth, 0.2), clothD: shade(cloth, -0.28), pants: '#2a2531', shoe: '#141013', eye: '#1b1418', white: '#e9e2d3',
  };
}

function legs(px: Px, c: ReturnType<typeof colors>, frame: number, sitting: boolean, narrow = false) {
  if (sitting) { px(5, 19, 6, 2, c.pants); px(5, 21, 2, 1, c.shoe); px(9, 21, 2, 1, c.shoe); return; }
  const lift = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  const lx = narrow ? 6 : 5, rx = narrow ? 8 : 8.99;
  const L = Math.round(lx), R = Math.round(rx);
  px(L, 19, 3, lift > 0 ? 3 : 4, c.pants); px(L, lift > 0 ? 22 : 23, 3, 1, c.shoe);
  px(R, 19, 3, lift < 0 ? 3 : 4, c.pants); px(R, lift < 0 ? 22 : 23, 3, 1, c.shoe);
}

function drawFront(px: Px, look: AvatarLook, back: boolean, frame: number, sitting: boolean) {
  const c = colors(look);
  const o = look.outfit;
  const swing = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  legs(px, c, frame, sitting);
  // 몸통
  const torsoBottom = o === 0 || o === 4 ? 21 : o === 2 ? 16 : 19;
  if (o === 3) { px(4, 12, 8, 7, c.white); px(5, 13, 6, 6, c.cloth); }
  else px(4, 12, 8, torsoBottom - 12, c.cloth);
  if (o === 2) { px(5, 12, 6, 4, c.cloth); px(3, 16, 10, 4, c.cloth); px(3, 19, 10, 1, c.clothD); px(4, 16, 8, 1, c.clothD); }
  px(11, 12, 1, torsoBottom - 12, c.clothD);
  px(4, 12, 1, torsoBottom - 12, c.clothL);
  // 팔
  const armC = o === 3 ? c.white : c.clothD;
  px(3, 13 + (swing > 0 ? -1 : 0), 1, 5, armC); px(12, 13 + (swing < 0 ? -1 : 0), 1, 5, armC);
  px(3, 18 + (swing > 0 ? -1 : 0), 1, 1, c.skin); px(12, 18 + (swing < 0 ? -1 : 0), 1, 1, c.skin);
  if (!back) {
    if (o === 0) { px(6, 12, 4, 1, c.clothL); px(7, 12, 2, 2, c.white); px(4, 16, 8, 1, c.clothD); px(8, 17, 1, 4, c.clothD); }
    if (o === 1) { px(6, 12, 4, 1, c.white); px(7, 13, 2, 1, c.white); px(7, 13, 2, 4, '#8e2a2a'); px(7, 13, 2, 1, '#b33a3a'); }
    if (o === 3) { px(7, 12, 2, 2, c.white); px(6, 15, 1, 1, c.clothL); px(9, 17, 1, 1, c.clothL); }
    if (o === 4) { px(5, 12, 3, 1, c.clothL); px(8, 13, 2, 1, c.clothL); px(4, 16, 8, 1, c.white); }
    if (o === 5) { px(5, 11, 6, 2, c.cloth); px(5, 14, 6, 1, c.clothD); }
  } else if (o === 0) px(4, 16, 8, 1, c.clothD);
  // 목 + 머리
  if (o !== 5) px(7, 12, 2, 1, c.skinD);
  px(4, 4, 8, 8, c.skin);
  px(4, 11, 8, 1, c.skinD);
  px(3, 8, 1, 2, c.skinD); px(12, 8, 1, 2, c.skinD);
  if (!back) { px(6, 8, 1, 2, c.eye); px(9, 8, 1, 2, c.eye); px(5, 10, 1, 1, 'rgba(220,120,120,0.45)'); px(10, 10, 1, 1, 'rgba(220,120,120,0.45)'); }
  // 머리카락
  const h = look.hair;
  const H = c.hair, HL = c.hairL;
  if (back) {
    if (h <= 5) {
      px(4, 3, 8, 7, H); px(3, 5, 1, 5, H); px(12, 5, 1, 5, H);
      if (h === 1) { px(3, 5, 10, 9, H); px(4, 13, 8, 1, c.hairD); }
      if (h === 2) { px(3, 5, 10, 6, H); }
      if (h === 3) { px(3, 2, 10, 9, H); px(3, 2, 1, 1, 'rgba(0,0,0,0)'); px(5, 2, 1, 1, HL); px(9, 3, 1, 1, HL); px(2, 5, 1, 4, H); px(13, 5, 1, 4, H); }
      if (h === 4) { px(4, 3, 8, 7, H); px(7, 9, 2, 6, H); px(7, 14, 2, 1, c.hairD); px(7, 9, 2, 1, '#8e2a2a'); }
      if (h === 5) { px(6, 3, 2, 1, HL); }
    }
  } else {
    if (h === 0) { px(4, 3, 8, 3, H); px(5, 2, 6, 1, H); px(4, 6, 1, 2, H); px(11, 6, 1, 2, H); px(5, 6, 3, 1, H); px(6, 2, 2, 1, HL); }
    if (h === 1) { px(4, 3, 8, 3, H); px(5, 2, 6, 1, H); px(3, 5, 2, 9, H); px(11, 5, 2, 9, H); px(4, 6, 2, 1, H); px(10, 6, 2, 1, H); px(8, 3, 1, 2, c.hairD); px(5, 2, 2, 1, HL); }
    if (h === 2) { px(3, 3, 10, 4, H); px(4, 2, 8, 1, H); px(3, 7, 2, 4, H); px(11, 7, 2, 4, H); px(5, 7, 6, 1, H); px(5, 2, 3, 1, HL); }
    if (h === 3) {
      px(3, 2, 10, 5, H); px(2, 4, 1, 5, H); px(13, 4, 1, 5, H); px(3, 7, 1, 3, H); px(12, 7, 1, 3, H);
      px(4, 1, 2, 1, H); px(7, 1, 2, 1, H); px(10, 1, 2, 1, H); px(5, 7, 2, 1, H); px(9, 7, 2, 1, H);
      px(4, 2, 1, 1, HL); px(8, 2, 1, 1, HL); px(11, 3, 1, 1, HL); px(6, 5, 1, 1, c.hairD); px(10, 5, 1, 1, c.hairD);
    }
    if (h === 4) { px(4, 3, 8, 3, H); px(5, 2, 6, 1, H); px(9, 6, 3, 1, H); px(4, 6, 1, 1, H); px(12, 4, 2, 4, H); px(12, 4, 1, 1, '#8e2a2a'); px(6, 2, 2, 1, HL); }
    if (h === 5) { px(4, 3, 8, 2, H); px(5, 2, 6, 1, H); px(4, 5, 1, 2, H); px(11, 5, 1, 2, H); px(6, 3, 3, 1, HL); }
  }
  if (h === 6) { // 중절모
    px(4, 6, 1, 2, H); px(11, 6, 1, 2, H);
    const hat = '#2b2426', hatL = '#3d3437';
    px(5, 1, 6, 4, hat); px(5, 1, 6, 1, hatL); px(5, 4, 6, 1, '#6d2330'); px(2, 5, 12, 1, hat); px(3, 6, 10, 1, 'rgba(0,0,0,0.25)');
  }
  if (h === 7) { // 베레모
    px(4, 6, 1, 3, H); px(11, 6, 1, 3, H);
    const b = shade(c.cloth, -0.1);
    px(4, 2, 7, 1, b); px(3, 3, 9, 2, b); px(4, 5, 8, 1, shade(c.cloth, -0.35)); px(7, 1, 1, 1, b); px(4, 3, 2, 1, shade(c.cloth, 0.2));
  }
  if (!back) {
    const a = look.accessory;
    if (a === 1) { px(5, 7, 6, 1, '#2a2226'); px(5, 8, 1, 2, '#2a2226'); px(8, 8, 1, 1, '#2a2226'); px(7, 8, 1, 1, '#2a2226'); px(10, 8, 1, 2, '#2a2226'); px(6, 9, 1, 1, 'rgba(180,210,255,0.5)'); }
    if (a === 2) { px(8, 7, 3, 1, '#d9b36c'); px(8, 10, 3, 1, '#d9b36c'); px(8, 8, 1, 2, '#d9b36c'); px(10, 8, 1, 2, '#d9b36c'); px(11, 10, 1, 4, 'rgba(217,179,108,0.7)'); }
    if (a === 3) { px(4, 11, 8, 2, '#9c2b2b'); px(4, 11, 8, 1, '#b84141'); px(9, 13, 2, 4, '#9c2b2b'); px(9, 16, 2, 1, '#e9e2d3'); }
    if (a === 4) { px(10, 2, 4, 2, '#c43d5a'); px(11, 1, 2, 1, '#c43d5a'); px(11, 4, 2, 1, '#c43d5a'); px(11, 2, 2, 2, '#e0607a'); }
    if (a === 5) { px(6, 10, 4, 1, c.hairD); px(5, 10, 1, 1, c.hairD); px(10, 10, 1, 1, c.hairD); }
  } else if (look.accessory === 3) { px(4, 11, 8, 2, '#9c2b2b'); }
}

function drawSide(px: Px, look: AvatarLook, frame: number, sitting: boolean) {
  const c = colors(look);
  const o = look.outfit;
  const swing = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  // 다리 (보폭)
  if (sitting) { px(4, 19, 7, 2, c.pants); px(4, 21, 2, 1, c.shoe); }
  else if (swing === 0) { px(6, 19, 4, 4, c.pants); px(5, 23, 5, 1, c.shoe); }
  else {
    px(5, 19, 3, 4, swing > 0 ? c.pants : shade(c.pants, -0.25)); px(4, 23, 3, 1, c.shoe);
    px(8, 19, 3, 4, swing > 0 ? shade(c.pants, -0.25) : c.pants); px(9, 23, 3, 1, c.shoe);
  }
  const torsoBottom = o === 0 || o === 4 ? 21 : o === 2 ? 16 : 19;
  const body = o === 3 ? c.white : c.cloth;
  px(5, 12, 6, torsoBottom - 12, body);
  if (o === 3) px(6, 13, 5, 6, c.cloth);
  if (o === 2) { px(4, 16, 8, 4, c.cloth); px(4, 19, 8, 1, c.clothD); }
  px(10, 12, 1, torsoBottom - 12, c.clothD);
  if (o === 0) { px(5, 16, 6, 1, c.clothD); px(4, 12, 2, 2, c.clothL); }
  if (o === 1) { px(4, 12, 1, 3, c.white); px(4, 13, 1, 3, '#8e2a2a'); }
  if (o === 4) px(5, 16, 6, 1, c.white);
  if (o === 5) px(5, 11, 5, 2, c.cloth);
  // 팔 (앞쪽)
  const armC = o === 3 ? c.white : c.clothD;
  px(7 + swing, 13, 2, 5, armC); px(7 + swing, 18, 2, 1, c.skin);
  // 머리
  if (o !== 5) px(7, 12, 2, 1, c.skinD);
  px(5, 4, 7, 8, c.skin); px(5, 11, 7, 1, c.skinD); px(4, 8, 1, 2, c.skin);
  px(6, 8, 1, 2, c.eye); px(6, 10, 1, 1, 'rgba(220,120,120,0.45)');
  const h = look.hair, H = c.hair, HL = c.hairL;
  if (h === 0) { px(5, 3, 7, 3, H); px(6, 2, 5, 1, H); px(9, 6, 3, 3, H); px(5, 6, 2, 1, H); px(7, 2, 2, 1, HL); }
  if (h === 1) { px(5, 3, 7, 3, H); px(6, 2, 5, 1, H); px(8, 6, 4, 8, H); px(5, 6, 2, 1, H); px(7, 2, 2, 1, HL); }
  if (h === 2) { px(4, 3, 8, 4, H); px(5, 2, 6, 1, H); px(8, 7, 4, 4, H); px(4, 7, 2, 1, H); px(6, 2, 2, 1, HL); }
  if (h === 3) { px(4, 2, 9, 5, H); px(9, 7, 4, 3, H); px(5, 1, 2, 1, H); px(9, 1, 2, 1, H); px(12, 4, 1, 4, H); px(4, 7, 1, 1, H); px(6, 2, 1, 1, HL); px(10, 3, 1, 1, HL); }
  if (h === 4) { px(5, 3, 7, 3, H); px(6, 2, 5, 1, H); px(10, 6, 2, 2, H); px(12, 5, 2, 7, H); px(12, 5, 2, 1, '#8e2a2a'); px(7, 2, 2, 1, HL); }
  if (h === 5) { px(5, 3, 7, 2, H); px(6, 2, 6, 1, H); px(10, 5, 2, 3, H); px(7, 3, 3, 1, HL); }
  if (h === 6) { const hat = '#2b2426'; px(10, 6, 2, 2, H); px(6, 1, 6, 4, hat); px(6, 1, 6, 1, '#3d3437'); px(6, 4, 6, 1, '#6d2330'); px(3, 5, 11, 1, hat); }
  if (h === 7) { const b = shade(c.cloth, -0.1); px(10, 6, 2, 3, H); px(5, 2, 7, 1, b); px(4, 3, 9, 2, b); px(5, 5, 7, 1, shade(c.cloth, -0.35)); px(8, 1, 1, 1, b); }
  const a = look.accessory;
  if (a === 1) { px(4, 7, 4, 1, '#2a2226'); px(5, 8, 1, 1, '#2a2226'); px(7, 8, 1, 1, '#2a2226'); }
  if (a === 2) { px(5, 7, 3, 1, '#d9b36c'); px(5, 10, 3, 1, '#d9b36c'); px(5, 8, 1, 2, '#d9b36c'); px(7, 8, 1, 2, '#d9b36c'); }
  if (a === 3) { px(5, 11, 6, 2, '#9c2b2b'); px(4, 12, 2, 4, '#9c2b2b'); }
  if (a === 4) { px(11, 2, 3, 2, '#c43d5a'); px(12, 1, 1, 4, '#e0607a'); }
  if (a === 5) { px(4, 10, 3, 1, c.hairD); }
}
