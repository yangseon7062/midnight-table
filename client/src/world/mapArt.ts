import type { MapDef, MapObject } from '@shared/world';
import { TILE } from '@shared/world';
import { hash2, shade } from './color';

/** 맵 바닥/벽 레이어를 한 번 그려 캐시한다. 가구는 y-정렬을 위해 개별 스프라이트로 캐시. */

type G = CanvasRenderingContext2D;
const r = (g: G, x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

function regionOf(tx: number, ty: number): 'study' | 'greenhouse' | 'parlor' | 'gallery' | 'hall' {
  if (tx < 14 && ty < 14) return 'study';
  if (tx > 29 && ty < 14) return 'greenhouse';
  if (tx < 14 && ty > 18) return 'parlor';
  if (tx > 29 && ty > 18) return 'gallery';
  return 'hall';
}

export function renderFloor(map: MapDef): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = map.cols * TILE; cv.height = map.rows * TILE;
  const g = cv.getContext('2d')!;
  const at = (x: number, y: number) => map.tiles[y]?.[x];
  for (let ty = 0; ty < map.rows; ty++) for (let tx = 0; tx < map.cols; tx++) {
    const k = at(tx, ty);
    const x = tx * TILE, y = ty * TILE;
    const n = hash2(tx, ty);
    switch (k) {
      case '.': { // 홀: 따뜻한 원목 세로 판재
        const base = ['#4a3222', '#4f3525', '#46301f'][Math.floor(n * 3)];
        r(g, x, y, TILE, TILE, base);
        for (let i = 0; i < 4; i++) {
          const off = (i * 4);
          r(g, x + off, y, 1, TILE, 'rgba(0,0,0,0.25)');
          const seam = Math.floor(hash2(tx * 4 + i, 0) * 16);
          if ((ty + i) % 3 === 0) r(g, x + off, y + seam, 4, 1, 'rgba(0,0,0,0.3)');
          if (hash2(tx + i, ty, 3) > 0.8) r(g, x + off + 1, y + 3 + i * 2, 2, 1, 'rgba(255,220,170,0.06)');
        }
        break;
      }
      case 'l': { // 서재: 어두운 가로 판재
        r(g, x, y, TILE, TILE, n > 0.5 ? '#3a2519' : '#352216');
        for (let i = 0; i < 4; i++) {
          r(g, x, y + i * 4, TILE, 1, 'rgba(0,0,0,0.3)');
          const seam = Math.floor(hash2(0, ty * 4 + i) * 16 + tx * 7) % 16;
          r(g, x + seam, y + i * 4, 1, 4, 'rgba(0,0,0,0.35)');
        }
        break;
      }
      case 'c': { // 중앙 카펫
        r(g, x, y, TILE, TILE, '#5a1a22');
        const edgeT = at(tx, ty - 1) !== 'c', edgeB = at(tx, ty + 1) !== 'c', edgeL = at(tx - 1, ty) !== 'c', edgeR = at(tx + 1, ty) !== 'c';
        if ((tx + ty) % 2 === 0) { r(g, x + 6, y + 6, 4, 4, '#6e2530'); r(g, x + 7, y + 7, 2, 2, '#a4803f'); }
        else { r(g, x + 7, y + 2, 2, 2, '#4a141b'); r(g, x + 7, y + 12, 2, 2, '#4a141b'); }
        if (edgeT) { r(g, x, y, TILE, 3, '#2e0d12'); r(g, x, y + 3, TILE, 1, '#c29a4f'); }
        if (edgeB) { r(g, x, y + 13, TILE, 3, '#2e0d12'); r(g, x, y + 12, TILE, 1, '#c29a4f'); }
        if (edgeL) { r(g, x, y, 3, TILE, '#2e0d12'); r(g, x + 3, y, 1, TILE, '#c29a4f'); }
        if (edgeR) { r(g, x + 13, y, 3, TILE, '#2e0d12'); r(g, x + 12, y, 1, TILE, '#c29a4f'); }
        break;
      }
      case 'g': { // 온실: 석재 체크 + 이끼
        const light = (tx + ty) % 2 === 0;
        r(g, x, y, TILE, TILE, light ? '#4d5a52' : '#3f4a44');
        r(g, x, y, TILE, 1, 'rgba(255,255,255,0.05)'); r(g, x, y + 15, TILE, 1, 'rgba(0,0,0,0.3)'); r(g, x + 15, y, 1, TILE, 'rgba(0,0,0,0.3)');
        if (n > 0.7) { r(g, x + Math.floor(n * 10), y + 12, 3, 2, '#3d6b3a'); r(g, x + Math.floor(n * 10) + 1, y + 11, 1, 1, '#548f4f'); }
        break;
      }
      case 'p': { // 응접실: 청록 문양 카펫
        r(g, x, y, TILE, TILE, '#1f3a3f');
        r(g, x + 7, y + 1, 2, 14, '#264a50'); r(g, x + 1, y + 7, 14, 2, '#264a50');
        r(g, x + 6, y + 6, 4, 4, '#a4803f'); r(g, x + 7, y + 7, 2, 2, '#1f3a3f');
        break;
      }
      case 'v': { // 회랑: 대리석
        const light = (tx + ty) % 2 === 0;
        r(g, x, y, TILE, TILE, light ? '#6b6773' : '#2c2a33');
        if (light && n > 0.5) { g.strokeStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(x + 2, y + 3 + n * 8); g.lineTo(x + 14, y + 9 + n * 5); g.stroke(); }
        break;
      }
      case 'd': { r(g, x, y, TILE, TILE, '#2d1d14'); r(g, x, y, TILE, 2, '#5b4130'); r(g, x, y + 14, TILE, 2, '#1a110b'); break; }
      case '#': {
        r(g, x, y, TILE, TILE, '#16111a');
        if (at(tx, ty + 1) && at(tx, ty + 1) !== '#') r(g, x, y + 14, TILE, 2, '#2a202c');
        if (hash2(tx, ty, 9) > 0.6) r(g, x + 4, y + 5, 2, 1, 'rgba(255,255,255,0.03)');
        break;
      }
      case '=': {
        const reg = regionOf(tx, ty);
        const wall = { study: '#243629', greenhouse: '#39423f', parlor: '#4a1f2b', gallery: '#232a42', hall: '#3a1c24' }[reg];
        r(g, x, y, TILE, TILE, wall);
        if (reg === 'greenhouse') { r(g, x, y, TILE, 9, '#1f2c3a'); r(g, x + 7, y, 1, 9, '#6f7a78'); r(g, x, y + 8, TILE, 1, '#6f7a78'); }
        else { for (let i = 1; i < 16; i += 4) r(g, x + i, y, 1, 10, shade(wall, 0.08)); if ((tx + 1) % 2 === 0) r(g, x + 2, y + 3, 1, 1, shade(wall, 0.25)); }
        r(g, x, y + 9, TILE, 1, '#1a1210');
        r(g, x, y + 10, TILE, 5, '#3b2819'); r(g, x + 1, y + 11, 6, 3, '#453020'); r(g, x + 9, y + 11, 6, 3, '#453020');
        r(g, x, y + 15, TILE, 1, '#120c09');
        break;
      }
    }
  }
  // 벽 아래 그림자
  for (let ty = 0; ty < map.rows; ty++) for (let tx = 0; tx < map.cols; tx++) {
    const k = at(tx, ty);
    if (k === '=' && at(tx, ty + 1) && at(tx, ty + 1) !== '=' && at(tx, ty + 1) !== '#') r(g, tx * TILE, (ty + 1) * TILE, TILE, 4, 'rgba(0,0,0,0.28)');
    if (k === '#' && at(tx + 1, ty) && !['#', '='].includes(at(tx + 1, ty)!)) r(g, (tx + 1) * TILE, ty * TILE, 3, TILE, 'rgba(0,0,0,0.22)');
  }
  return cv;
}

const objCache = new Map<string, HTMLCanvasElement>();
const ANIMATED = new Set(['fireplace', 'clock', 'fountain', 'table', 'window', 'lamp']);
export const isAnimated = (o: MapObject) => ANIMATED.has(o.type);

export function objectSprite(o: MapObject): HTMLCanvasElement | null {
  if (ANIMATED.has(o.type)) return null;
  const key = `${o.type}.${o.variant}.${o.w}.${o.h}`;
  const hit = objCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(o.w); cv.height = Math.ceil(o.h) + 4;
  const g = cv.getContext('2d')!;
  drawStatic(g, o);
  objCache.set(key, cv);
  return cv;
}

function drawStatic(g: G, o: MapObject) {
  const W = Math.ceil(o.w), H = Math.ceil(o.h);
  const v = o.variant ?? 0;
  switch (o.type) {
    case 'bookshelf': {
      r(g, 0, 0, W, H, '#2b1b12'); r(g, 1, 1, W - 2, H - 2, '#1a100b');
      const rows = 3;
      for (let i = 0; i < rows; i++) {
        const y = 2 + i * Math.floor((H - 4) / rows);
        let x = 2;
        while (x < W - 3) {
          const bw = 2 + Math.floor(hash2(x, i, v) * 3);
          const hh = 6 + Math.floor(hash2(x, i + 7, v) * 3);
          const col = ['#6d2330', '#355244', '#2f5c73', '#b59a64', '#4b3f6b', '#7b5b3c', '#8f8f96'][Math.floor(hash2(x, i, v + 3) * 7)];
          r(g, x, y + (9 - hh), bw, hh, col); r(g, x, y + (9 - hh), 1, hh, 'rgba(255,255,255,0.12)');
          x += bw + (hash2(x, i, 5) > 0.85 ? 2 : 0);
        }
        r(g, 1, y + 9, W - 2, 1, '#3d2819');
      }
      break;
    }
    case 'painting': {
      r(g, 0, 0, W, H, '#8a6a2f'); r(g, 1, 1, W - 2, H - 2, '#c29a4f'); r(g, 3, 3, W - 6, H - 6, '#1b1f2b');
      const sky = ['#2c3a55', '#3b2a3a', '#2d3d35'][v % 3];
      r(g, 3, 3, W - 6, H - 6, sky);
      r(g, 3, H - 9, W - 6, 6, '#15191f'); r(g, 6, 6, 3, 3, '#e9e2c8');
      g.fillStyle = 'rgba(230,230,240,0.25)'; g.fillRect(4, H - 12, W - 8, 3);
      break;
    }
    case 'desk': {
      r(g, 0, 6, W, H - 6, '#3a2517'); r(g, 0, 2, W, 8, '#5a3b24'); r(g, 0, 2, W, 1, '#7a5634');
      r(g, 3, H - 4, 3, 4, '#23160e'); r(g, W - 6, H - 4, 3, 4, '#23160e');
      r(g, 8, 3, 12, 6, '#e6dcc3'); r(g, 10, 4, 7, 1, '#9a8f7a'); r(g, 10, 6, 5, 1, '#9a8f7a');
      r(g, W - 16, 1, 4, 7, 'rgba(210,230,240,0.6)'); r(g, W - 15, 4, 2, 3, '#7a1f24');
      r(g, W - 22, 0, 1, 8, '#b59a64'); r(g, W - 25, 0, 7, 3, '#355244');
      break;
    }
    case 'armchair': { r(g, 1, 2, W - 2, H - 2, '#6d2330'); r(g, 0, 6, 3, H - 6, '#551a25'); r(g, W - 3, 6, 3, H - 6, '#551a25'); r(g, 3, 4, W - 6, 3, '#8a3040'); break; }
    case 'globe': { r(g, 7, H - 3, 2, 3, '#3a2517'); r(g, 4, H - 1, 8, 1, '#23160e'); g.fillStyle = '#2f5c73'; g.beginPath(); g.arc(8, 11, 6, 0, Math.PI * 2); g.fill(); r(g, 5, 8, 4, 3, '#4b7b4e'); r(g, 9, 12, 3, 2, '#4b7b4e'); g.strokeStyle = '#b59a64'; g.beginPath(); g.arc(8, 11, 7, -1.2, 2); g.stroke(); break; }
    case 'rug': { r(g, 0, 0, W, H, '#5e3a1c'); r(g, 2, 2, W - 4, H - 4, '#7b4a22'); r(g, 4, 4, W - 8, H - 8, '#5e3a1c'); for (let i = 8; i < W - 8; i += 8) r(g, i, H / 2 - 1, 3, 3, '#c29a4f'); break; }
    case 'plant': {
      r(g, 4, H - 8, 8, 8, '#6b3f25'); r(g, 3, H - 9, 10, 2, '#824d2e');
      const leaf = ['#2f5e34', '#3d7040', '#27502d'];
      for (let i = 0; i < 14; i++) { const a = hash2(i, v, 1) * Math.PI * 2; const d = hash2(i, v, 2) * 6; r(g, 8 + Math.cos(a) * d - 2, H - 16 + Math.sin(a) * d * 1.2 - (v === 2 ? 6 : 2), 4, 3, leaf[i % 3]); }
      r(g, 7, H - 12, 1, 4, '#27502d');
      break;
    }
    case 'bench': { r(g, 0, 4, W, 5, '#5a3b24'); r(g, 0, 4, W, 1, '#7a5634'); r(g, 2, 9, 2, H - 9, '#23160e'); r(g, W - 4, 9, 2, H - 9, '#23160e'); break; }
    case 'sidetable': { r(g, 1, 3, W - 2, 8, '#4a3020'); r(g, 1, 3, W - 2, 2, '#6a4a30'); r(g, 6, 0, 4, 4, '#c29a4f'); r(g, 7, 1, 2, 1, '#fff2c8'); break; }
    case 'statue': { r(g, 3, H - 8, 10, 8, '#6b6773'); r(g, 2, H - 9, 12, 2, '#8b8793'); r(g, 5, 6, 6, H - 14, '#b8b4bf'); g.fillStyle = '#c9c5d0'; g.beginPath(); g.arc(8, 6, 4, 0, Math.PI * 2); g.fill(); r(g, 6, 12, 1, 6, 'rgba(0,0,0,0.2)'); break; }
    case 'sofa': {
      const col = v ? '#355244' : '#6d2330';
      r(g, 0, 0, W, 10, shade(col, -0.2)); r(g, 0, 8, W, H - 8, col); r(g, 0, 6, 4, H - 6, shade(col, -0.3)); r(g, W - 4, 6, 4, H - 6, shade(col, -0.3));
      for (let i = 6; i < W - 6; i += 16) r(g, i, 10, 14, 4, shade(col, 0.12));
      break;
    }
    case 'coffeetable': { r(g, 0, 2, W, H - 4, '#3a2517'); r(g, 0, 2, W, 3, '#5a3b24'); r(g, 8, 3, 6, 4, '#e6dcc3'); r(g, W - 12, 2, 5, 5, '#d9d0bd'); r(g, W - 11, 3, 3, 3, '#6b3f25'); break; }
    case 'piano': {
      r(g, 0, 0, W, H - 6, '#0f0c0e'); r(g, 2, 2, W - 4, 6, '#1f1a1d'); r(g, 0, H - 12, W, 6, '#e9e2d3');
      for (let i = 2; i < W; i += 4) r(g, i, H - 12, 2, 4, '#0f0c0e');
      r(g, 3, H - 6, 3, 6, '#0f0c0e'); r(g, W - 6, H - 6, 3, 6, '#0f0c0e'); r(g, 6, 3, 8, 3, '#e6dcc3');
      break;
    }
    case 'pedestal': {
      r(g, 3, 12, 10, H - 12, '#8b8793'); r(g, 2, 11, 12, 2, '#a7a3ae'); r(g, 2, H - 2, 12, 2, '#6b6773');
      if (v === 0) { r(g, 5, 4, 6, 8, '#2f5c73'); r(g, 6, 2, 4, 2, '#2f5c73'); r(g, 6, 6, 4, 1, '#d9b36c'); }
      if (v === 1) { g.fillStyle = '#d9d0bd'; g.beginPath(); g.arc(8, 6, 4, 0, Math.PI * 2); g.fill(); r(g, 5, 9, 6, 3, '#d9d0bd'); }
      if (v === 2) { r(g, 4, 5, 8, 7, '#7a1f24'); r(g, 5, 3, 6, 2, '#d9b36c'); }
      break;
    }
    case 'winerack': { r(g, 0, 0, W, H, '#2b1b12'); for (let i = 3; i < W - 2; i += 5) for (let j = 3; j < H - 2; j += 5) { r(g, i, j, 3, 3, '#140c08'); r(g, i + 1, j + 1, 1, 1, '#7a1f24'); } break; }
    case 'clock-shadow': break;
  }
}

/** 애니메이션이 있는 오브젝트는 매 프레임 그린다 */
export function drawAnimated(g: G, o: MapObject, t: number, ox: number, oy: number, extra?: { tableItems?: number }) {
  const x = Math.round(o.x - ox), y = Math.round(o.y - oy);
  const W = Math.ceil(o.w), H = Math.ceil(o.h);
  switch (o.type) {
    case 'fireplace': {
      r(g, x, y, W, H, '#3a302c'); r(g, x + 2, y + 2, W - 4, 6, '#57493f'); r(g, x, y, W, 3, '#6b5c50');
      r(g, x + 10, y + 12, W - 20, H - 14, '#0c0806');
      for (let i = 0; i < 9; i++) {
        const fl = Math.sin(t * 9 + i * 1.7) * 0.5 + 0.5;
        const fx = x + 13 + i * ((W - 26) / 8), fh = 6 + fl * 9 + Math.sin(t * 5 + i) * 2;
        r(g, fx - 1, y + H - 3 - fh, 3, fh, i % 2 ? '#e8742a' : '#f0a03a');
        r(g, fx, y + H - 3 - fh * 0.6, 1, fh * 0.6, '#ffe28a');
      }
      r(g, x + 12, y + H - 4, W - 24, 3, '#2a1a12');
      break;
    }
    case 'clock': {
      r(g, x + 1, y, W - 2, H, '#3a2517'); r(g, x, y, W, 3, '#5a3b24');
      g.fillStyle = '#e6dcc3'; g.beginPath(); g.arc(x + W / 2, y + 9, 5, 0, Math.PI * 2); g.fill();
      const sec = (Date.now() / 1000) % 60;
      g.strokeStyle = '#1a1418'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + W / 2, y + 9); g.lineTo(x + W / 2 + Math.cos(sec / 60 * Math.PI * 2 - Math.PI / 2) * 4, y + 9 + Math.sin(sec / 60 * Math.PI * 2 - Math.PI / 2) * 4); g.stroke();
      r(g, x + 4, y + 17, W - 8, H - 22, '#1a100b');
      const sw = Math.sin(t * 3.2) * 3;
      g.strokeStyle = '#c29a4f'; g.beginPath(); g.moveTo(x + W / 2, y + 18); g.lineTo(x + W / 2 + sw, y + H - 10); g.stroke();
      g.fillStyle = '#d9b36c'; g.beginPath(); g.arc(x + W / 2 + sw, y + H - 9, 2, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'fountain': {
      r(g, x, y + 8, W, H - 8, '#6b6773'); r(g, x + 2, y + 10, W - 4, H - 14, '#2f5c73');
      r(g, x + W / 2 - 2, y + 2, 4, 12, '#8b8793');
      for (let i = 0; i < 6; i++) { const ph = (t * 1.5 + i / 6) % 1; r(g, x + W / 2 - 1 + Math.sin(i * 2) * ph * 8, y + 2 + ph * ph * 16, 1, 2, `rgba(190,220,255,${1 - ph})`); }
      r(g, x + 4 + (Math.sin(t * 2) + 1) * 8, y + 16, 4, 1, 'rgba(255,255,255,0.3)');
      break;
    }
    case 'window': {
      r(g, x, y, W, H, '#2b1b12'); r(g, x + 2, y + 2, W - 4, H - 4, '#0e1a2c');
      const flash = lightning > 0 ? lightning : 0;
      if (flash) r(g, x + 2, y + 2, W - 4, H - 4, `rgba(200,220,255,${flash * 0.8})`);
      for (let i = 0; i < 7; i++) { const ph = (t * 1.8 + hash2(i, Math.round(o.x)) ) % 1; r(g, x + 3 + hash2(i, 3, Math.round(o.x)) * (W - 6), y + 2 + ph * (H - 6), 1, 3, 'rgba(160,190,230,0.35)'); }
      r(g, x + W / 2 - 1, y + 2, 2, H - 4, '#2b1b12'); r(g, x + 2, y + H / 2 - 1, W - 4, 2, '#2b1b12');
      r(g, x - 1, y + H - 2, W + 2, 3, '#4a3020');
      break;
    }
    case 'lamp': {
      r(g, x + 7, y + 8, 2, H - 9, '#2a1f18'); r(g, x + 4, y + H - 2, 8, 2, '#1a120d');
      const fl = 0.85 + Math.sin(t * 7 + o.x) * 0.08;
      g.fillStyle = `rgba(255,${190 * fl | 0},110,1)`; g.beginPath(); g.moveTo(x + 3, y + 9); g.lineTo(x + 13, y + 9); g.lineTo(x + 11, y + 2); g.lineTo(x + 5, y + 2); g.closePath(); g.fill();
      r(g, x + 5, y + 2, 6, 1, '#fff0c8');
      break;
    }
    case 'table': {
      // 큰 식탁: 식탁보 + 촛대
      r(g, x - 2, y + 4, W + 4, H, 'rgba(0,0,0,0.35)');
      r(g, x, y, W, H - 2, '#4a2c1a'); r(g, x + 2, y + 2, W - 4, H - 8, '#e3d7bd'); r(g, x + 2, y + H - 8, W - 4, 3, '#b9ab8c');
      r(g, x + 2, y + 2, W - 4, 1, '#f3ead5');
      for (let i = 6; i < W - 6; i += 10) r(g, x + i, y + H - 6, 4, 2, '#cfc2a3');
      r(g, x + 4, y + H - 2, 3, 4, '#2a1a10'); r(g, x + W - 7, y + H - 2, 3, 4, '#2a1a10');
      const cx = x + W / 2;
      r(g, cx - 1, y + 8, 3, 14, '#c29a4f'); r(g, cx - 8, y + 12, 17, 2, '#c29a4f');
      for (const dx of [-8, 0, 8]) {
        r(g, cx + dx - 0.5, y + (dx ? 6 : 3), 2, 6, '#efe6cf');
        const fl = Math.sin(t * 11 + dx) * 0.7;
        r(g, cx + dx - 0.5 + fl * 0.4, y + (dx ? 3 : 0), 2, 3, '#ffd27a'); r(g, cx + dx, y + (dx ? 4 : 1), 1, 1, '#fff6d8');
      }
      const items = extra?.tableItems ?? 0;
      for (let i = 0; i < items; i++) {
        const px = x + 12 + ((i * 23) % (W - 30)), py = y + 8 + ((i * 11) % (H - 22));
        r(g, px, py, 9, 12, '#f2ead8'); r(g, px + 1, py + 1, 7, 1, '#7a1f24'); r(g, px + 1, py + 4, 6, 1, '#a59a85'); r(g, px + 1, py + 6, 5, 1, '#a59a85');
      }
      break;
    }
  }
}

export let lightning = 0;
export function setLightning(v: number) { lightning = v; }
