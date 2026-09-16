import type { Facing, ZoneView } from '@shared/platform';
import { FACINGS } from '@shared/platform';
import { MAPS, MOVE_SPEED, TILE, moveWithCollision, isBlocked, zoneAt, type MapDef, type Seat } from '@shared/world';
import { avatarSprite, SPRITE_H, SPRITE_W } from './avatar';
import { renderFloor, objectSprite, drawAnimated, isAnimated, setLightning } from './mapArt';
import { bus, me, members, socket, zones, roomMeta, serverNow, call, toast, type ClientMember } from '../net/net';
import { sfx, setMuffled } from '../audio/sfx';
import { updateSpeaking } from '../audio/voice';

const INTERP_DELAY = 110;
const SEND_HZ = 20;

interface Drawable { sortY: number; draw: () => void }

export class WorldEngine {
  private g: CanvasRenderingContext2D;
  private low = document.createElement('canvas');
  private lg: CanvasRenderingContext2D;
  private light = document.createElement('canvas');
  private lightG: CanvasRenderingContext2D;
  private map: MapDef;
  private floor: HTMLCanvasElement;
  scale = 3;
  private cam = { x: 0, y: 0 };
  private keys = new Set<string>();
  private path: { x: number; y: number }[] = [];
  private pendingSeat: { tableId: string; index: number } | null = null;
  private lastSendAt = 0;
  private lastSent = { x: -1, y: -1, f: -1, mv: -1 };
  private raf = 0;
  private lastT = performance.now();
  private stepAcc = 0;
  private myZone: string | null = null;
  private flash = 0;
  private nextLightning = performance.now() + 15000 + Math.random() * 20000;
  private dust = Array.from({ length: 50 }, () => ({ x: Math.random() * 704, y: Math.random() * 512, vx: (Math.random() - 0.5) * 3, vy: -1 - Math.random() * 3, p: Math.random() }));
  private unsub: (() => void)[] = [];
  tableItems = 0;
  /** 상단 HUD가 클 때 카메라를 위로 들어 올려 내 캐릭터와 말풍선이 가리지 않게 */
  camLift = 0;
  nearSeat: { tableId: string; index: number; seat: Seat } | null = null;
  onNearSeat: ((s: WorldEngine['nearSeat']) => void) | null = null;
  inputBlocked = () => false;
  private clickMarker: { x: number; y: number; t: number } | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
    this.lg = this.low.getContext('2d')!;
    this.lightG = this.light.getContext('2d')!;
    this.map = MAPS[roomMeta.value?.mapId ?? 'salon'] ?? MAPS.salon;
    this.floor = renderFloor(this.map);
    this.resize();
    const mine = this.self();
    if (mine) { this.cam.x = mine.x; this.cam.y = mine.y; }
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointerdown', this.onPointer);
    this.unsub.push(bus.on('fix', (p: { x: number; y: number; reason?: string }) => {
      const m = this.self();
      if (!m) return;
      m.x = p.x; m.y = p.y; m.rx = p.x; m.ry = p.y;
      this.lastSent = { x: p.x, y: p.y, f: -1, mv: -1 };
      if (p.reason && p.reason !== 'seat') { toast(p.reason, 'warn'); sfx.error(); this.path = []; }
      if (p.reason === 'seat') sfx.sit();
    }));
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('pointerdown', this.onPointer);
    this.unsub.forEach((u) => u());
    setMuffled(false);
  }

  private self(): ClientMember | undefined { const id = me.value?.userId; return id ? members.get(id) : undefined; }

  private resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    const target = Math.min(w / (30 * TILE), h / (18 * TILE));
    this.scale = Math.max(2, Math.round(target * dpr));
    this.low.width = Math.ceil(this.canvas.width / this.scale) + 1;
    this.low.height = Math.ceil(this.canvas.height / this.scale) + 1;
    this.light.width = this.low.width; this.light.height = this.low.height;
    this.g.imageSmoothingEnabled = false;
  };

  private typing() {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  private onKey = (e: KeyboardEvent) => {
    if (this.typing() || this.inputBlocked()) return;
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
      this.keys.add(k); this.path = []; this.pendingSeat = null; e.preventDefault();
    }
    if ((k === 'e' || k === ' ') && this.nearSeat && !this.self()?.seat) { e.preventDefault(); this.sit(this.nearSeat.tableId, this.nearSeat.index); }
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };
  private onBlur = () => this.keys.clear();

  async sit(tableId: string, index: number) {
    const r = await call('sit', { tableId, index });
    if (!r.ok) { toast(r.error, 'warn'); sfx.error(); }
  }

  private screenToWorld(sx: number, sy: number) {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / rect.width;
    return { x: ((sx - rect.left) * dpr) / this.scale + this.viewX(), y: ((sy - rect.top) * dpr) / this.scale + this.viewY() };
  }
  /** 월드 좌표 → 브라우저 화면 좌표 (테스트/툴팁용) */
  worldToClient(x: number, y: number) {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / rect.width;
    const ox = this.cam.x - this.low.width / 2, oy = this.cam.y - this.low.height / 2;
    return { x: rect.left + ((x - ox) * this.scale) / dpr, y: rect.top + ((y - oy) * this.scale) / dpr };
  }
  seats() { return this.map.tables.flatMap((t) => t.seats.map((s, index) => ({ tableId: t.id, index, ...s }))); }
  private viewX() { return Math.round(this.cam.x - this.low.width / 2); }
  private viewY() { return Math.round(this.cam.y - this.low.height / 2); }

  private onPointer = (e: PointerEvent) => {
    if (e.button !== 0 || this.inputBlocked()) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    const w = this.screenToWorld(e.clientX, e.clientY);
    const mine = this.self();
    if (!mine) return;
    // 좌석 클릭 → 걸어가서 앉기
    for (const t of this.map.tables) t.seats.forEach((s, i) => {
      if (Math.hypot(s.x - w.x, s.y - 8 - w.y) < 12) { w.x = s.x; w.y = s.y; this.pendingSeat = { tableId: t.id, index: i }; }
    });
    if (!this.goTo(w.x, w.y)) this.pendingSeat = null;
  };

  /** 목적지까지 길찾기 이동 (클릭 이동과 동일한 경로) */
  goTo(x: number, y: number) {
    const mine = this.self();
    if (!mine) return false;
    const p = this.findPath(mine.x, mine.y, x, y);
    if (!p) return false;
    this.path = p; this.clickMarker = { x, y, t: performance.now() }; sfx.click();
    return true;
  }

  /** 8px 격자 A* */
  private findPath(sx: number, sy: number, tx: number, ty: number) {
    const C = 8, cols = Math.floor((this.map.cols * TILE) / C), rows = Math.floor((this.map.rows * TILE) / C);
    const cell = (x: number, y: number) => ({ cx: Math.max(0, Math.min(cols - 1, Math.floor(x / C))), cy: Math.max(0, Math.min(rows - 1, Math.floor(y / C))) });
    const free = (cx: number, cy: number) => !isBlocked(this.map, cx * C + C / 2, cy * C + C / 2 + 2);
    const s = cell(sx, sy); let t = cell(tx, ty);
    if (!free(t.cx, t.cy)) {
      let best: typeof t | null = null, bd = 1e9;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (free(t.cx + dx, t.cy + dy) && dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; best = { cx: t.cx + dx, cy: t.cy + dy }; }
      if (!best) return null;
      t = best;
    }
    const key = (x: number, y: number) => y * cols + x;
    const open = new Map<number, number>([[key(s.cx, s.cy), 0]]);
    const g = new Map<number, number>([[key(s.cx, s.cy), 0]]);
    const came = new Map<number, number>();
    const h = (x: number, y: number) => Math.hypot(x - t.cx, y - t.cy);
    let iter = 0;
    while (open.size && iter++ < 6000) {
      let cur = -1, cf = 1e9;
      for (const [k, f] of open) if (f < cf) { cf = f; cur = k; }
      open.delete(cur);
      const cx = cur % cols, cy = Math.floor(cur / cols);
      if (cx === t.cx && cy === t.cy) {
        const pts: { x: number; y: number }[] = [];
        let k = cur;
        while (came.has(k)) { pts.push({ x: (k % cols) * C + C / 2, y: Math.floor(k / cols) * C + C / 2 + 2 }); k = came.get(k)!; }
        pts.reverse();
        if (pts.length) pts[pts.length - 1] = isBlocked(this.map, tx, ty) ? pts[pts.length - 1] : { x: tx, y: ty };
        return pts;
      }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || !free(nx, ny)) continue;
        if (dx && dy && (!free(cx + dx, cy) || !free(cx, cy + dy))) continue;
        const nk = key(nx, ny), ng = g.get(cur)! + (dx && dy ? 1.414 : 1);
        if (ng < (g.get(nk) ?? 1e9)) { g.set(nk, ng); came.set(nk, cur); open.set(nk, ng + h(nx, ny)); }
      }
    }
    return null;
  }

  private frame = (t: number) => {
    const dt = Math.min(0.05, (t - this.lastT) / 1000);
    this.lastT = t;
    try { this.update(dt, t); this.render(t / 1000); } catch (e) { console.error(e); }
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number, now: number) {
    const mine = this.self();
    if (mine) {
      let dx = 0, dy = 0;
      if (!this.typing() && !this.inputBlocked()) {
        if (this.keys.has('arrowleft') || this.keys.has('a')) dx -= 1;
        if (this.keys.has('arrowright') || this.keys.has('d')) dx += 1;
        if (this.keys.has('arrowup') || this.keys.has('w')) dy -= 1;
        if (this.keys.has('arrowdown') || this.keys.has('s')) dy += 1;
      }
      if (!dx && !dy && this.path.length) {
        const wp = this.path[0];
        const ddx = wp.x - mine.x, ddy = wp.y - mine.y, d = Math.hypot(ddx, ddy);
        if (d < 2) { this.path.shift(); if (!this.path.length) { mine.x = wp.x; mine.y = wp.y; if (this.pendingSeat) { const ps = this.pendingSeat; this.pendingSeat = null; this.sit(ps.tableId, ps.index); } } }
        else { dx = ddx / d; dy = ddy / d; }
      }
      let moving = false;
      if (dx || dy) {
        const len = Math.hypot(dx, dy);
        const step = MOVE_SPEED * dt;
        const nx = (dx / len) * step, ny = (dy / len) * step;
        const next = moveWithCollision(this.map, mine.x, mine.y, nx, ny);
        const moved = Math.hypot(next.x - mine.x, next.y - mine.y);
        moving = moved > 0.01;
        mine.x = next.x; mine.y = next.y;
        mine.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
        mine.walk += moved;
        this.stepAcc += moved;
        if (this.stepAcc > 14) { this.stepAcc = 0; sfx.step(); }
        if (!moving && this.path.length) this.path = [];
      }
      mine.moving = moving;
      mine.rx = mine.x; mine.ry = mine.y;
      const f = FACINGS.indexOf(mine.facing);
      const mv = moving ? 1 : 0;
      const changed = Math.abs(mine.x - this.lastSent.x) > 0.05 || Math.abs(mine.y - this.lastSent.y) > 0.05 || f !== this.lastSent.f || mv !== this.lastSent.mv;
      if (changed && now - this.lastSendAt >= 1000 / SEND_HZ) {
        this.lastSendAt = now;
        this.lastSent = { x: mine.x, y: mine.y, f, mv };
        socket.emit('m', { x: Math.round(mine.x * 100) / 100, y: Math.round(mine.y * 100) / 100, f, mv });
      }
      // 구역 진입/이탈
      const z = zoneAt(zones.value, mine.x, mine.y);
      const zid = z && (z as ZoneView).open ? z.id : null;
      if (zid !== this.myZone) {
        this.myZone = zid;
        setMuffled(!!zid);
        sfx.door();
        bus.emit('zone:self', zid ? z : null);
      }
      // 근처 좌석
      let near: WorldEngine['nearSeat'] = null;
      if (!mine.seat) for (const tb of this.map.tables) tb.seats.forEach((s, i) => {
        const taken = [...members.values()].some((o) => o.seat?.tableId === tb.id && o.seat.index === i);
        if (!taken && Math.hypot(s.x - mine.x, s.y - mine.y) < 30 && (!near || Math.hypot(s.x - mine.x, s.y - mine.y) < Math.hypot(near.seat.x - mine.x, near.seat.y - mine.y))) near = { tableId: tb.id, index: i, seat: s };
      });
      if ((near as WorldEngine['nearSeat'])?.index !== this.nearSeat?.index || !!near !== !!this.nearSeat) { this.nearSeat = near; this.onNearSeat?.(near); }
    }

    // 원격 보간
    const renderAt = performance.now() - INTERP_DELAY;
    for (const m of members.values()) {
      if (m === mine) continue;
      const b = m.buf;
      let tx = m.x, ty = m.y;
      if (b.length >= 2) {
        let i = b.length - 1;
        while (i > 0 && b[i - 1].t > renderAt) i--;
        const a = b[Math.max(0, i - 1)], c = b[i];
        if (renderAt <= a.t) { tx = a.x; ty = a.y; }
        else if (renderAt >= c.t) { tx = c.x; ty = c.y; }
        else { const k = (renderAt - a.t) / (c.t - a.t); tx = a.x + (c.x - a.x) * k; ty = a.y + (c.y - a.y) * k; }
      }
      const moved = Math.hypot(tx - m.rx, ty - m.ry);
      if (moved > 60) { m.rx = tx; m.ry = ty; }
      else { m.rx = tx; m.ry = ty; m.walk += moved; }
    }

    // 카메라
    if (mine) {
      const k = Math.min(1, dt * 8);
      this.cam.x += (mine.rx - this.cam.x) * k;
      this.cam.y += (mine.ry - 8 - this.camLift - this.cam.y) * k;
    }
    const mw = this.map.cols * TILE, mh = this.map.rows * TILE;
    const hw = this.low.width / 2, hh = this.low.height / 2;
    this.cam.x = mw <= this.low.width ? mw / 2 : Math.max(hw, Math.min(mw - hw, this.cam.x));
    this.cam.y = mh <= this.low.height ? mh / 2 : Math.max(hh, Math.min(mh - hh, this.cam.y));

    // 번개
    if (now > this.nextLightning) {
      this.flash = 1;
      this.nextLightning = now + 25000 + Math.random() * 45000;
      setTimeout(() => sfx.thunder(), 400 + Math.random() * 1200);
    }
    this.flash = Math.max(0, this.flash - dt * 2.2);
    setLightning(this.flash > 0.6 || (this.flash > 0.2 && this.flash < 0.35) ? this.flash : 0);
    updateSpeaking();
  }

  private render(t: number) {
    const lg = this.lg, W = this.low.width, H = this.low.height;
    const ox = this.viewX(), oy = this.viewY();
    lg.imageSmoothingEnabled = false;
    lg.fillStyle = '#07060a'; lg.fillRect(0, 0, W, H);
    lg.drawImage(this.floor, -ox, -oy);

    // 구역
    const zs = zones.value;
    const mine = this.self();
    for (const z of zs) {
      const inside = mine && mine.x >= z.rect.x && mine.x < z.rect.x + z.rect.w && mine.y >= z.rect.y && mine.y < z.rect.y + z.rect.h;
      const x = z.rect.x - ox, y = z.rect.y - oy;
      if (z.open) {
        lg.fillStyle = inside ? 'rgba(217,179,108,0.07)' : 'rgba(217,179,108,0.025)';
        lg.fillRect(x, y, z.rect.w, z.rect.h);
      }
      lg.save();
      lg.strokeStyle = z.open ? `rgba(217,179,108,${inside ? 0.55 + Math.sin(t * 3) * 0.15 : 0.28})` : 'rgba(140,140,150,0.18)';
      lg.setLineDash([3, 3]);
      lg.lineDashOffset = -t * 6;
      lg.strokeRect(x + 1.5, y + 1.5, z.rect.w - 3, z.rect.h - 3);
      lg.restore();
    }

    // 클릭 마커
    if (this.clickMarker && performance.now() - this.clickMarker.t < 600) {
      const k = (performance.now() - this.clickMarker.t) / 600;
      lg.strokeStyle = `rgba(217,179,108,${1 - k})`;
      lg.beginPath(); lg.ellipse(this.clickMarker.x - ox, this.clickMarker.y - oy, 3 + k * 6, 1.5 + k * 3, 0, 0, Math.PI * 2); lg.stroke();
    }

    // y-정렬 드로우
    const list: Drawable[] = [];
    for (const o of this.map.objects) {
      if (o.x - ox > W + 20 || o.x + o.w - ox < -20 || o.y - oy > H + 20 || o.y + o.h - oy < -40) continue;
      const sortY = o.sortY ?? (o.hit ? o.hit.y + o.hit.h : o.type === 'rug' ? -1e6 : o.y + o.h);
      if (isAnimated(o)) list.push({ sortY, draw: () => drawAnimated(lg, o, t, ox, oy, { tableItems: this.tableItems }) });
      else { const spr = objectSprite(o); if (spr) list.push({ sortY, draw: () => lg.drawImage(spr, Math.round(o.x - ox), Math.round(o.y - oy)) }); }
    }
    for (const tb of this.map.tables) tb.seats.forEach((s) => {
      const back = s.facing === 'up';
      list.push({ sortY: s.y + (back ? 2 : -3), draw: () => this.drawChair(s, ox, oy) });
    });
    const now = performance.now();
    for (const m of members.values()) {
      list.push({
        sortY: m.ry,
        draw: () => {
          const x = Math.round(m.rx - ox), y = Math.round(m.ry - oy);
          lg.fillStyle = 'rgba(0,0,0,0.35)';
          lg.beginPath(); lg.ellipse(x, y, 6, 2.5, 0, 0, Math.PI * 2); lg.fill();
          if (m.speaking > 0.08) {
            lg.strokeStyle = `rgba(120,230,150,${Math.min(0.9, m.speaking)})`;
            lg.lineWidth = 1;
            lg.beginPath(); lg.ellipse(x, y, 8 + m.speaking * 3, 3.5 + m.speaking, 0, 0, Math.PI * 2); lg.stroke();
          }
          const frame = m.moving ? Math.floor(m.walk / 7) % 4 : 0;
          const spr = avatarSprite(m.look, m.facing as Facing, frame, !!m.seat);
          const bob = m.moving && frame % 2 === 1 ? -1 : 0;
          lg.globalAlpha = m.connected ? 1 : 0.4 + Math.sin(now / 300) * 0.1;
          lg.drawImage(spr, x - SPRITE_W / 2, y - SPRITE_H + 2 + bob + (m.seat ? 2 : 0));
          lg.globalAlpha = 1;
        },
      });
    }
    list.sort((a, b) => a.sortY - b.sortY);
    for (const d of list) d.draw();

    // 먼지
    for (const p of this.dust) {
      p.x += p.vx * 0.016; p.y += p.vy * 0.016; p.p += 0.004;
      if (p.y < 0) { p.y = 512; p.x = Math.random() * 704; }
      const a = (Math.sin(p.p * 6) + 1) * 0.12;
      lg.fillStyle = `rgba(255,230,190,${a})`;
      lg.fillRect(Math.round(p.x - ox), Math.round(p.y - oy), 1, 1);
    }

    // 조명
    const L = this.lightG;
    L.globalCompositeOperation = 'source-over';
    L.fillStyle = `rgba(6,6,14,${0.66 - this.flash * 0.4})`;
    L.fillRect(0, 0, W, H);
    L.globalCompositeOperation = 'destination-out';
    const cutLight = (x: number, y: number, rad: number, a: number) => {
      const gr = L.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.55, `rgba(0,0,0,${a * 0.55})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      L.fillStyle = gr; L.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    };
    for (const li of this.map.lights) {
      const fl = 1 - (li.flicker ?? 0) * (Math.sin(t * 13 + li.x) * 0.5 + Math.sin(t * 7.3 + li.y) * 0.5);
      cutLight(li.x - ox, li.y - oy, li.r * fl, (li.intensity ?? 0.9) * fl);
    }
    for (const m of members.values()) cutLight(m.rx - ox, m.ry - oy - 10, m === mine ? 56 : 36, m === mine ? 0.6 : 0.4);
    lg.drawImage(this.light, 0, 0);
    lg.globalCompositeOperation = 'lighter';
    for (const li of this.map.lights) {
      const fl = 1 - (li.flicker ?? 0) * Math.sin(t * 11 + li.x);
      const x = li.x - ox, y = li.y - oy, rad = li.r * 0.7 * fl;
      const gr = lg.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${li.color},${0.16 * (li.intensity ?? 1)})`); gr.addColorStop(1, `rgba(${li.color},0)`);
      lg.fillStyle = gr; lg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    lg.globalCompositeOperation = 'source-over';

    // 확대
    const g = this.g;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const subX = (this.cam.x - this.low.width / 2 - ox) * this.scale, subY = (this.cam.y - this.low.height / 2 - oy) * this.scale;
    g.drawImage(this.low, -subX, -subY, this.low.width * this.scale, this.low.height * this.scale);
    this.drawOverlay(ox + subX / this.scale, oy + subY / this.scale, t);
  }

  private drawChair(s: Seat, ox: number, oy: number) {
    const g = this.lg, x = Math.round(s.x - ox), y = Math.round(s.y - oy);
    g.fillStyle = '#3a2517';
    if (s.facing === 'down') { g.fillRect(x - 6, y - 16, 12, 12); g.fillStyle = '#5a3b24'; g.fillRect(x - 5, y - 15, 10, 3); g.fillStyle = '#6d2330'; g.fillRect(x - 5, y - 6, 10, 4); }
    else if (s.facing === 'up') { g.fillStyle = '#6d2330'; g.fillRect(x - 5, y - 6, 10, 4); g.fillStyle = '#3a2517'; g.fillRect(x - 6, y - 3, 12, 6); g.fillStyle = '#5a3b24'; g.fillRect(x - 5, y - 2, 10, 2); }
    else { const dir = s.facing === 'left' ? 1 : -1; g.fillRect(x + dir * 4 - 1, y - 16, 3, 16); g.fillStyle = '#6d2330'; g.fillRect(x - 5, y - 6, 10, 4); }
  }

  /** 고해상도 오버레이: 이름표, 말풍선, 마이크, 구역 이름 */
  private drawOverlay(ox: number, oy: number, t: number) {
    const g = this.g, S = this.scale;
    const dpr = this.canvas.width / (this.canvas.clientWidth || 1);
    const font = (px: number, weight = 400) => `${weight} ${Math.round(px * dpr)}px Galmuri11, Pretendard, sans-serif`;
    const mine = this.self();
    const nowS = serverNow();
    const grace = roomMeta.value?.graceMs ?? 120000;

    for (const z of zones.value) {
      const cx = (z.rect.x + z.rect.w / 2 - ox) * S, top = (z.rect.y - oy) * S + 8 * dpr;
      const label = `${z.open ? '🔒' : '·'} ${z.name}${z.maxOccupants ? ` (${z.occupants.length}/${z.maxOccupants})` : z.occupants.length ? ` · ${z.occupants.length}명` : ''}`;
      g.font = font(11);
      const w = g.measureText(label).width + 14 * dpr;
      g.fillStyle = z.open ? 'rgba(20,14,10,0.72)' : 'rgba(20,20,24,0.5)';
      roundRect(g, cx - w / 2, top, w, 18 * dpr, 9 * dpr); g.fill();
      g.fillStyle = z.open ? '#e8cf98' : '#8b8793';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, cx, top + 9.5 * dpr);
    }

    const list = [...members.values()].sort((a, b) => a.ry - b.ry);
    for (const m of list) {
      const x = (m.rx - ox) * S, headY = (m.ry - oy - SPRITE_H - 1 + (m.seat ? 2 : 0)) * S;
      const isMe = m === mine;
      const label = m.badge ? `${m.badge}` : m.nickname;
      const sub = m.badge ? m.nickname : null;
      g.font = font(12, 700);
      const w1 = g.measureText(label).width;
      g.font = font(10);
      const w2 = sub ? g.measureText(sub).width : 0;
      const boxW = Math.max(w1, w2) + 30 * dpr, boxH = (sub ? 30 : 18) * dpr;
      const by = headY - boxH - 4 * dpr;
      g.fillStyle = isMe ? 'rgba(60,40,18,0.85)' : 'rgba(14,11,16,0.78)';
      roundRect(g, x - boxW / 2, by, boxW, boxH, 6 * dpr); g.fill();
      if (isMe) { g.strokeStyle = 'rgba(217,179,108,0.8)'; g.lineWidth = 1 * dpr; g.stroke(); }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = font(12, 700);
      g.fillStyle = m.connected ? (m.badge ? '#f1dca9' : '#efe6cf') : '#9a9098';
      g.fillText(label, x + 7 * dpr, by + 9.5 * dpr);
      if (sub) { g.font = font(10); g.fillStyle = '#a59a8a'; g.fillText(sub, x + 7 * dpr, by + 22 * dpr); }
      // 마이크
      const mx = x - boxW / 2 + 10 * dpr, my = by + 9.5 * dpr;
      g.beginPath(); g.arc(mx, my, 5 * dpr, 0, Math.PI * 2);
      g.fillStyle = m.mic === 'on' ? (m.speaking > 0.08 ? '#6be08b' : '#3f8f57') : m.mic === 'off' ? '#8e2a2a' : '#555';
      g.fill();
      if (m.mic !== 'on') { g.strokeStyle = '#efe6cf'; g.lineWidth = 1.2 * dpr; g.beginPath(); g.moveTo(mx - 3 * dpr, my - 3 * dpr); g.lineTo(mx + 3 * dpr, my + 3 * dpr); g.stroke(); }

      if (!m.connected) {
        const left = m.disconnectedAt ? Math.max(0, grace - (nowS - m.disconnectedAt)) : 0;
        const txt = left > 0 ? `연결 끊김 · ${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}` : '부재 중';
        g.font = font(10); g.fillStyle = '#ffb0a0'; g.fillText(txt, x, by - 9 * dpr);
      }
      if (isMe && !m.badge) { g.fillStyle = '#d9b36c'; g.beginPath(); const ty2 = by - 6 * dpr + Math.sin(t * 4) * 2 * dpr; g.moveTo(x - 4 * dpr, ty2 - 5 * dpr); g.lineTo(x + 4 * dpr, ty2 - 5 * dpr); g.lineTo(x, ty2); g.fill(); }

      const nowP = performance.now();
      if (m.emote && m.emote.until > nowP) {
        const k = 1 - (m.emote.until - nowP) / 2600;
        g.font = `${Math.round(22 * dpr)}px sans-serif`;
        g.globalAlpha = Math.min(1, (1 - k) * 4);
        g.fillText(m.emote.e, x, by - 18 * dpr - Math.min(1, k * 5) * 10 * dpr);
        g.globalAlpha = 1;
      }
      if (m.bubble && m.bubble.until > nowP) {
        const alpha = Math.min(1, (m.bubble.until - nowP) / 400);
        g.font = font(12);
        const lines = wrap(g, m.bubble.text, 180 * dpr, 3);
        const lw = Math.max(...lines.map((l) => g.measureText(l).width)) + 16 * dpr;
        const lh = 16 * dpr, bh = lines.length * lh + 10 * dpr;
        const bx = x - lw / 2, byy = by - bh - 10 * dpr - (m.emote && m.emote.until > nowP ? 24 * dpr : 0);
        g.globalAlpha = alpha;
        g.fillStyle = 'rgba(239,230,207,0.96)';
        roundRect(g, bx, byy, lw, bh, 8 * dpr); g.fill();
        g.beginPath(); g.moveTo(x - 5 * dpr, byy + bh); g.lineTo(x + 5 * dpr, byy + bh); g.lineTo(x, byy + bh + 6 * dpr); g.fill();
        g.fillStyle = '#1b1418';
        lines.forEach((l, i) => g.fillText(l, x, byy + 5 * dpr + lh * i + lh / 2));
        g.globalAlpha = 1;
      }
    }

    if (this.nearSeat && mine && !mine.seat) {
      const s = this.nearSeat.seat;
      const x = (s.x - ox) * S, y = (s.y - oy + 6) * S;
      g.font = font(12, 700);
      const label = '[E] 앉기';
      const w = g.measureText(label).width + 16 * dpr;
      g.fillStyle = `rgba(217,179,108,${0.85 + Math.sin(t * 5) * 0.1})`;
      roundRect(g, x - w / 2, y, w, 20 * dpr, 10 * dpr); g.fill();
      g.fillStyle = '#1b1418'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, x, y + 10.5 * dpr);
    }
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const out: string[] = [];
  let line = '';
  for (const ch of text) {
    if (g.measureText(line + ch).width > maxW) { out.push(line); line = ch; if (out.length === maxLines) break; }
    else line += ch;
  }
  if (out.length < maxLines && line) out.push(line);
  if (out.length === maxLines && text.length > out.join('').length) out[maxLines - 1] = out[maxLines - 1].slice(0, -1) + '…';
  return out;
}
