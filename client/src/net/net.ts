import { io, type Socket } from 'socket.io-client';
import { signal } from '@preact/signals';
import type {
  C2S, S2C, ChatMessage, MemberView, ModuleSummary, RoomSnapshot, RoomSummary, TableView, UserProfile, ZoneView, AvatarLook,
} from '@shared/platform';
import { FACINGS } from '@shared/platform';

/** 네트워크 + 전역 상태 저장소 (로비 레이어). 게임 모듈 상태는 gameView 에 opaque 로 들어온다. */

export const socket: Socket<S2C, C2S> = io({ transports: ['websocket', 'polling'], autoConnect: false, reconnectionDelay: 500, reconnectionDelayMax: 3000 });

export type Screen = 'boot' | 'title' | 'lobby' | 'room';
export const screen = signal<Screen>('boot');
export const connection = signal<'connecting' | 'online' | 'offline'>('connecting');
export const me = signal<UserProfile | null>(null);
export const rooms = signal<RoomSummary[]>([]);
export const modules = signal<ModuleSummary[]>([]);
export const roomMeta = signal<Omit<RoomSnapshot, 'members' | 'zones' | 'table'> | null>(null);
export const zones = signal<ZoneView[]>([]);
export const table = signal<TableView | null>(null);
export const chat = signal<ChatMessage[]>([]);
export const gameView = signal<any>(null);
export const membersVersion = signal(0);
export const kickedReason = signal<string | null>(null);

export interface Toast { id: number; text: string; tone: 'info' | 'warn' | 'error' }
export const toasts = signal<Toast[]>([]);
let toastId = 1;
export function toast(text: string, tone: Toast['tone'] = 'info') {
  const t = { id: toastId++, text, tone };
  toasts.value = [...toasts.value.slice(-4), t];
  setTimeout(() => { toasts.value = toasts.value.filter((x) => x.id !== t.id); }, tone === 'error' ? 4200 : 3000);
}

// ── 멤버 (보간 버퍼 포함) ─────────────────────────────
export interface ClientMember extends MemberView {
  buf: { t: number; x: number; y: number }[];
  rx: number; ry: number;
  walk: number;
  bubble: { text: string; until: number } | null;
  emote: { e: string; until: number } | null;
  speaking: number;
}
export const members = new Map<string, ClientMember>();
const bumpMembers = () => { membersVersion.value++; };

function upsertMember(v: MemberView) {
  const prev = members.get(v.userId);
  const isMe = v.userId === me.value?.userId;
  if (prev) {
    const teleport = Math.hypot(prev.x - v.x, prev.y - v.y) > 40;
    Object.assign(prev, { ...v, x: isMe ? prev.x : v.x, y: isMe ? prev.y : v.y });
    if (!isMe && teleport) { prev.buf = [{ t: performance.now(), x: v.x, y: v.y }]; prev.rx = v.x; prev.ry = v.y; }
  } else {
    members.set(v.userId, { ...v, buf: [{ t: performance.now(), x: v.x, y: v.y }], rx: v.x, ry: v.y, walk: 0, bubble: null, emote: null, speaking: 0 });
  }
  bumpMembers();
}

// ── 시간 동기화 ─────────────────────────────────────
export let serverOffset = 0;
export const serverNow = () => Date.now() + serverOffset;
function syncTime() {
  const samples: number[] = [];
  const once = () => {
    const t0 = Date.now();
    socket.emit('time', (s) => {
      const t1 = Date.now();
      samples.push(s - (t0 + t1) / 2);
      if (samples.length < 5) setTimeout(once, 120);
      else { samples.sort((a, b) => a - b); serverOffset = samples[2]; }
    });
  };
  once();
}

// ── 이벤트 버스 ─────────────────────────────────────
type Handler = (payload: any) => void;
const handlers = new Map<string, Set<Handler>>();
export const bus = {
  on(ev: string, h: Handler) { (handlers.get(ev) ?? handlers.set(ev, new Set()).get(ev)!).add(h); return () => handlers.get(ev)!.delete(h); },
  emit(ev: string, p?: unknown) { handlers.get(ev)?.forEach((h) => h(p)); },
};

// ── 세션 토큰 (브라우저에 저장, 새로고침/재접속 복원) ─────
const profileSuffix = new URLSearchParams(location.search).get('profile') ?? '';
const KEY = `midnight.session${profileSuffix ? `.${profileSuffix}` : ''}`;
export const storage = {
  get token(): string | null { try { return localStorage.getItem(KEY); } catch { return null; } },
  set token(v: string | null) { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* 저장 불가 환경 */ } },
  getPref<T>(k: string, d: T): T { try { const v = localStorage.getItem(`midnight.pref.${k}`); return v ? JSON.parse(v) : d; } catch { return d; } },
  setPref(k: string, v: unknown) { try { localStorage.setItem(`midnight.pref.${k}`, JSON.stringify(v)); } catch { /* */ } },
};

export let currentRoomId: string | null = null;

export function call<K extends keyof C2S>(ev: K, ...args: any[]): Promise<any> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: '서버 응답이 없습니다' }), 8000);
    (socket.emit as any)(ev, ...args, (r: any) => { clearTimeout(timer); resolve(r); });
  });
}

export async function authenticate(nickname?: string, look?: AvatarLook) {
  const r = await call('auth', { token: storage.token, nickname, look });
  if (!r.ok) {
    if (r.error === 'SESSION_EXPIRED') { storage.token = null; screen.value = 'title'; return r; }
    return r;
  }
  storage.token = r.token;
  me.value = r.user;
  return r;
}

export async function refreshRooms() {
  const r = await call('rooms:list');
  if (r?.rooms) { rooms.value = r.rooms; modules.value = r.modules; }
}

function applySnapshot(s: RoomSnapshot) {
  const { members: ms, zones: zs, table: tb, ...meta } = s;
  const keep = new Set(ms.map((m) => m.userId));
  for (const id of [...members.keys()]) if (!keep.has(id)) members.delete(id);
  for (const m of ms) upsertMember(m);
  const mine = ms.find((m) => m.userId === me.value?.userId);
  const mm = mine && members.get(mine.userId);
  if (mine && mm) { mm.x = mine.x; mm.y = mine.y; mm.rx = mine.x; mm.ry = mine.y; }
  roomMeta.value = meta;
  zones.value = zs;
  table.value = tb;
  serverOffset = s.serverNow - Date.now();
}

export async function joinRoom(p: { roomId?: string; no?: number; password?: string }) {
  const r = await call('room:join', p);
  if (!r.ok) return r;
  currentRoomId = r.snapshot.roomId;
  members.clear();
  applySnapshot(r.snapshot);
  chat.value = r.history;
  if (r.snapshot.status === 'waiting') gameView.value = null;
  screen.value = 'room';
  syncTime();
  bus.emit('room:joined', r.snapshot);
  return r;
}

export async function leaveRoom() {
  await call('room:leave');
  currentRoomId = null;
  members.clear();
  gameView.value = null;
  roomMeta.value = null;
  bus.emit('room:left');
  screen.value = 'lobby';
  refreshRooms();
}

// ── 소켓 이벤트 배선 ────────────────────────────────
let everConnected = false;
socket.on('connect', async () => {
  connection.value = 'online';
  syncTime();
  if (!storage.token) { if (!everConnected) screen.value = 'title'; everConnected = true; return; }
  const r = await authenticate();
  if (!r.ok) { if (!everConnected) screen.value = 'title'; everConnected = true; return; }
  const target = currentRoomId ?? (!everConnected ? r.lastRoomId : null);
  everConnected = true;
  if (target) {
    const j = await joinRoom({ roomId: target });
    if (j.ok) { if (currentRoomId && screen.value === 'room') toast('다시 연결되었습니다. 진행 상태를 복원했습니다.'); return; }
    currentRoomId = null;
  }
  if (screen.value === 'boot' || screen.value === 'title' || screen.value === 'room') screen.value = 'lobby';
  refreshRooms();
});
socket.on('disconnect', () => { connection.value = 'offline'; });
socket.io.on('reconnect_attempt', () => { connection.value = 'connecting'; });

socket.on('rooms:changed', () => { if (screen.value === 'lobby') refreshRooms(); });
socket.on('room:snapshot', (s) => applySnapshot(s));
socket.on('room:member', (m) => { upsertMember(m); bus.emit('member', m); });
socket.on('room:memberLeft', ({ userId }) => { members.delete(userId); bumpMembers(); });
socket.on('room:zones', (z) => { zones.value = z; });
socket.on('room:table', (t) => { table.value = t; bus.emit('table', t); });
socket.on('room:status', (p) => {
  if (roomMeta.value) roomMeta.value = { ...roomMeta.value, status: p.status, gameModuleId: p.gameModuleId };
  if (p.status === 'waiting') gameView.value = null;
  bus.emit('status', p);
});
socket.on('s', (moves) => {
  const now = performance.now();
  const myId = me.value?.userId;
  for (const [id, x, y, f, mv] of moves) {
    const m = members.get(id);
    if (!m || id === myId) continue;
    m.buf.push({ t: now, x, y });
    if (m.buf.length > 12) m.buf.shift();
    m.x = x; m.y = y; m.facing = FACINGS[f] ?? m.facing; m.moving = !!mv;
  }
});
socket.on('m:fix', (p) => bus.emit('fix', p));
socket.on('chat:msg', (m) => {
  chat.value = [...chat.value.slice(-299), m];
  if (m.kind === 'chat' && m.fromId) {
    const mem = members.get(m.fromId);
    if (mem) mem.bubble = { text: m.text, until: performance.now() + 4500 + m.text.length * 60 };
  }
  bus.emit('chat', m);
});
socket.on('emote', ({ userId, e }) => { const m = members.get(userId); if (m) m.emote = { e, until: performance.now() + 2600 }; bus.emit('emote', { userId, e }); });
socket.on('v:peers', (p) => bus.emit('v:peers', p));
socket.on('v:signal', (p) => bus.emit('v:signal', p));
socket.on('g:state', (v) => { gameView.value = v; });
socket.on('g:event', (e) => bus.emit(`g:${e.type}`, e.payload));
socket.on('toast', (p) => toast(p.text, p.tone));
socket.on('kicked', (p) => { kickedReason.value = p.reason; });

export function boot() { socket.connect(); }

// 자동 테스트/디버그용 핸들
(window as any).__members = members;
(window as any).__me = () => me.value?.userId;
