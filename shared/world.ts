import type { Rect, ZoneDef } from './platform';

/**
 * 플랫폼 맵 정의 + 충돌 판정. 서버(권위 검증)와 클라이언트(예측 이동)가 같은 코드를 쓴다.
 * 좌표 단위: 월드 픽셀 (1타일 = 16px). 캐릭터 좌표 = 발 위치.
 */
export const TILE = 16;
export const MOVE_SPEED = 84; // px/s

export type TileKind = '#' | '=' | '.' | 'c' | 'l' | 'g' | 'p' | 'v' | 'd';
export const SOLID_TILES = new Set<TileKind>(['#', '=']);

export interface MapObject {
  id: string;
  type: string;
  x: number; y: number; w: number; h: number; // 그려지는 영역
  hit?: Rect | null; // 충돌 영역 (없으면 통과)
  variant?: number;
  /** y-정렬 기준선 (기본: y+h) */
  sortY?: number;
}

export interface Seat { x: number; y: number; facing: 'down' | 'up' | 'left' | 'right' }
export interface TableDef { id: string; name: string; rect: Rect; seats: Seat[] }
export interface LightDef { x: number; y: number; r: number; color: string; flicker?: number; intensity?: number }

export interface MapDef {
  id: string;
  name: string;
  cols: number;
  rows: number;
  tiles: TileKind[][];
  objects: MapObject[];
  tables: TableDef[];
  lights: LightDef[];
  spawns: { x: number; y: number }[];
  defaultZones: ZoneDef[];
  /** 방 안의 구역 이름 표시용 영역 (시각 장식) */
  areas: { name: string; rect: Rect }[];
}

function buildSalon(): MapDef {
  const cols = 44, rows = 32;
  const t: TileKind[][] = Array.from({ length: rows }, () => Array<TileKind>(cols).fill('.'));
  const fill = (x: number, y: number, w: number, h: number, k: TileKind) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (t[yy] && xx >= 0 && xx < cols) t[yy][xx] = k;
  };
  // 바닥
  fill(1, 3, 12, 10, 'l');   // 서재
  fill(31, 3, 12, 10, 'g');  // 온실
  fill(1, 21, 12, 10, 'p');  // 응접실
  fill(31, 21, 12, 10, 'v'); // 회랑(갤러리)
  fill(16, 12, 12, 9, 'c');  // 중앙 카펫
  // 외벽
  fill(0, 0, cols, 2, '#'); fill(0, 2, cols, 1, '=');
  fill(0, 0, 1, rows, '#'); fill(cols - 1, 0, 1, rows, '#'); fill(0, rows - 1, cols, 1, '#');
  // 서재 칸막이
  fill(13, 0, 1, 14, '#'); fill(0, 13, 14, 1, '#'); fill(1, 14, 12, 1, '=');
  fill(13, 6, 1, 2, 'd'); fill(6, 13, 2, 2, 'd');
  // 온실 칸막이
  fill(30, 0, 1, 14, '#'); fill(30, 13, 14, 1, '#'); fill(31, 14, 12, 1, '=');
  fill(30, 6, 1, 2, 'd'); fill(36, 13, 2, 2, 'd');
  // 응접실 칸막이
  fill(0, 19, 14, 1, '#'); fill(1, 20, 12, 1, '='); fill(13, 19, 1, 12, '#');
  fill(6, 19, 2, 2, 'd'); fill(13, 24, 1, 2, 'd');
  // 회랑 칸막이
  fill(30, 19, 14, 1, '#'); fill(31, 20, 12, 1, '='); fill(30, 19, 1, 12, '#');
  fill(36, 19, 2, 2, 'd'); fill(30, 24, 1, 2, 'd');

  const T = TILE;
  const objects: MapObject[] = [];
  let oid = 0;
  const obj = (type: string, tx: number, ty: number, tw: number, th: number, hit: 'full' | 'base' | 'none' = 'full', variant = 0) => {
    const x = tx * T, y = ty * T, w = tw * T, h = th * T;
    let hr: Rect | null = null;
    if (hit === 'full') hr = { x, y, w, h };
    if (hit === 'base') hr = { x, y: y + h - T, w, h: T };
    objects.push({ id: `o${oid++}`, type, x, y, w, h, hit: hr, variant });
  };
  // 서재
  obj('bookshelf', 2, 1, 3, 2, 'none', 0); obj('bookshelf', 8, 1, 3, 2, 'none', 1);
  obj('painting', 5, 0.6, 2, 1.4, 'none', 0);
  obj('desk', 4, 7, 4, 2, 'full'); obj('armchair', 5.5, 5.6, 1, 1.2, 'base');
  obj('globe', 10, 4, 1, 2, 'base'); obj('lamp', 1, 10, 1, 2, 'base');
  obj('rug', 2, 9.5, 6, 2.5, 'none');
  // 온실
  obj('window', 32, 0.4, 3, 2.2, 'none'); obj('window', 38, 0.4, 3, 2.2, 'none');
  obj('plant', 31, 3, 1, 2, 'base', 0); obj('plant', 42, 3, 1, 2, 'base', 1); obj('plant', 34, 6, 1, 2, 'base', 2);
  obj('plant', 40, 8, 1, 2, 'base', 1); obj('plant', 31, 10, 1, 2, 'base', 2); obj('bench', 37, 6, 3, 1.5, 'base');
  obj('fountain', 36, 9, 2, 2, 'full');
  // 중앙 홀
  obj('fireplace', 20, 0.3, 4, 2.7, 'none'); obj('clock', 15, 1, 1, 3, 'base'); obj('clock-shadow', 15, 3, 1, 0.1, 'none');
  obj('plant', 28, 2.5, 1, 2, 'base', 0); obj('plant', 14, 28, 1, 2, 'base', 1); obj('plant', 29, 28, 1, 2, 'base', 2);
  obj('window', 16.5, 0.4, 2.5, 2.2, 'none'); obj('window', 25, 0.4, 2.5, 2.2, 'none');
  obj('table', 18, 14, 8, 3, 'full');
  obj('sidetable', 15, 15, 1, 1, 'full'); obj('sidetable', 28, 15, 1, 1, 'full');
  obj('statue', 21.5, 27, 1, 2, 'base');
  // 응접실
  obj('painting', 3, 18.6, 2, 1.4, 'none', 1); obj('painting', 9, 18.6, 2, 1.4, 'none', 2);
  obj('sofa', 2, 23, 4, 1.6, 'base'); obj('sofa', 2, 27.5, 4, 1.6, 'base', 1); obj('coffeetable', 2.5, 25.3, 3, 1.3, 'full');
  obj('piano', 8.5, 22, 3, 2.5, 'full'); obj('lamp', 11, 28.5, 1, 2, 'base');
  // 회랑
  obj('pedestal', 32, 23, 1, 2, 'base', 0); obj('pedestal', 35, 26, 1, 2, 'base', 1); obj('pedestal', 40, 23, 1, 2, 'base', 2);
  obj('winerack', 32, 18.6, 3, 1.4, 'none'); obj('painting', 39, 18.6, 2, 1.4, 'none', 0);
  obj('bench', 38, 28, 3, 1.5, 'base');
  obj('lamp', 42, 28.5, 1, 2, 'base');

  const cx = 18 * T, cy = 14 * T, tw = 8 * T, th = 3 * T;
  const seats: Seat[] = [
    { x: cx + 24, y: cy - 2, facing: 'down' }, { x: cx + 64, y: cy - 2, facing: 'down' }, { x: cx + 104, y: cy - 2, facing: 'down' },
    { x: cx + tw + 12, y: cy + th / 2 + 8, facing: 'left' },
    { x: cx + 104, y: cy + th + 14, facing: 'up' }, { x: cx + 64, y: cy + th + 14, facing: 'up' }, { x: cx + 24, y: cy + th + 14, facing: 'up' },
    { x: cx - 12, y: cy + th / 2 + 8, facing: 'right' },
  ];

  const zone = (id: string, name: string, tx: number, ty: number, tw2: number, th2: number, max: number | null = null): ZoneDef =>
    ({ id, name, rect: { x: tx * T, y: ty * T, w: tw2 * T, h: th2 * T }, maxOccupants: max });

  return {
    id: 'salon',
    name: '안개 저택 살롱',
    cols, rows, tiles: t, objects,
    tables: [{ id: 'main', name: '중앙 테이블', rect: { x: cx, y: cy, w: tw, h: th }, seats }],
    lights: [
      { x: cx + tw / 2, y: cy + th / 2, r: 150, color: '255,214,150', flicker: 0.04, intensity: 1 },
      { x: 22 * T, y: 3 * T, r: 90, color: '255,140,60', flicker: 0.18, intensity: 0.95 },
      { x: 6 * T, y: 7 * T, r: 90, color: '255,200,130', flicker: 0.05, intensity: 0.85 },
      { x: 1.5 * T, y: 10.5 * T, r: 60, color: '255,190,120', flicker: 0.06 },
      { x: 37 * T, y: 7 * T, r: 120, color: '150,190,255', flicker: 0.02, intensity: 0.7 },
      { x: 6 * T, y: 25 * T, r: 110, color: '255,190,120', flicker: 0.05, intensity: 0.85 },
      { x: 11.5 * T, y: 29 * T, r: 60, color: '255,190,120', flicker: 0.06 },
      { x: 37 * T, y: 25 * T, r: 110, color: '200,170,255', flicker: 0.03, intensity: 0.75 },
      { x: 42.5 * T, y: 29 * T, r: 60, color: '255,190,120', flicker: 0.06 },
      { x: 22 * T, y: 26 * T, r: 90, color: '255,214,150', flicker: 0.03, intensity: 0.6 },
      { x: 17.5 * T, y: 3 * T, r: 70, color: '160,190,255', intensity: 0.5 },
      { x: 26 * T, y: 3 * T, r: 70, color: '160,190,255', intensity: 0.5 },
    ],
    spawns: [
      { x: 20 * T, y: 24 * T }, { x: 22 * T, y: 24 * T }, { x: 24 * T, y: 24 * T },
      { x: 19 * T, y: 26 * T }, { x: 25 * T, y: 26 * T }, { x: 21 * T, y: 22.5 * T }, { x: 23 * T, y: 22.5 * T },
    ],
    defaultZones: [
      zone('study', '서재', 1, 3, 12, 10),
      zone('greenhouse', '온실', 31, 3, 12, 10),
      zone('parlor', '응접실', 1, 21, 12, 10),
      zone('gallery', '회랑', 31, 21, 12, 10),
    ],
    areas: [
      { name: '서재', rect: { x: 1 * T, y: 3 * T, w: 12 * T, h: 10 * T } },
      { name: '온실', rect: { x: 31 * T, y: 3 * T, w: 12 * T, h: 10 * T } },
      { name: '응접실', rect: { x: 1 * T, y: 21 * T, w: 12 * T, h: 10 * T } },
      { name: '회랑', rect: { x: 31 * T, y: 21 * T, w: 12 * T, h: 10 * T } },
      { name: '중앙 홀', rect: { x: 14 * T, y: 3 * T, w: 16 * T, h: 28 * T } },
    ],
  };
}

export const MAPS: Record<string, MapDef> = { salon: buildSalon() };
export const DEFAULT_MAP_ID = 'salon';

// ── 충돌 ───────────────────────────────────────────────
const FOOT_W = 10, FOOT_H = 6;

function rectHit(ax: number, ay: number, aw: number, ah: number, r: Rect) {
  return ax < r.x + r.w && ax + aw > r.x && ay < r.y + r.h && ay + ah > r.y;
}

export function isBlocked(map: MapDef, x: number, y: number): boolean {
  const left = x - FOOT_W / 2, top = y - FOOT_H;
  if (left < 0 || top < 0 || left + FOOT_W > map.cols * TILE || y > map.rows * TILE) return true;
  const tx0 = Math.floor(left / TILE), tx1 = Math.floor((left + FOOT_W - 0.01) / TILE);
  const ty0 = Math.floor(top / TILE), ty1 = Math.floor((y - 0.01) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const k = map.tiles[ty]?.[tx];
    if (!k || SOLID_TILES.has(k)) return true;
  }
  for (const o of map.objects) if (o.hit && rectHit(left, top, FOOT_W, FOOT_H, o.hit)) return true;
  return false;
}

/** 축 분리 슬라이딩 이동 */
export function moveWithCollision(map: MapDef, x: number, y: number, dx: number, dy: number): { x: number; y: number } {
  let nx = x, ny = y;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 3));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (sx !== 0 && !isBlocked(map, nx + sx, ny)) nx += sx;
    if (sy !== 0 && !isBlocked(map, nx, ny + sy)) ny += sy;
  }
  return { x: nx, y: ny };
}

/** 선분 경로 위 충돌 검사 (서버 치트 방지용: 벽 통과 여부) */
export function pathClear(map: MapDef, x0: number, y0: number, x1: number, y1: number): boolean {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / 3));
  for (let i = 1; i <= steps; i++) {
    const px = x0 + ((x1 - x0) * i) / steps, py = y0 + ((y1 - y0) * i) / steps;
    if (isBlocked(map, px, py)) {
      // 슬라이딩 경로 허용: 축별로 한 번 더 시도
      const midA = !isBlocked(map, px, y0 + ((y1 - y0) * (i - 1)) / steps);
      const midB = !isBlocked(map, x0 + ((x1 - x0) * (i - 1)) / steps, py);
      if (!midA && !midB) return false;
    }
  }
  return !isBlocked(map, x1, y1);
}

export function pointInRect(x: number, y: number, r: Rect) {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

export function zoneAt(zones: ZoneDef[], x: number, y: number): ZoneDef | null {
  // 작은 구역이 우선 (겹칠 경우)
  let best: ZoneDef | null = null;
  for (const z of zones) if (pointInRect(x, y, z.rect)) {
    if (!best || z.rect.w * z.rect.h < best.rect.w * best.rect.h) best = z;
  }
  return best;
}

/** 막히지 않은 가장 가까운 지점 탐색 (스폰/복원 시 끼임 방지) */
export function nearestFree(map: MapDef, x: number, y: number): { x: number; y: number } {
  if (!isBlocked(map, x, y)) return { x, y };
  for (let r = 4; r < 200; r += 4) {
    for (let a = 0; a < 16; a++) {
      const px = x + Math.cos((a / 16) * Math.PI * 2) * r, py = y + Math.sin((a / 16) * Math.PI * 2) * r;
      if (!isBlocked(map, px, py)) return { x: px, y: py };
    }
  }
  return map.spawns[0];
}
