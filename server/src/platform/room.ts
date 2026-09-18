import type { Server } from 'socket.io';
import type {
  ChatMessage, Facing, MemberView, MicState, RoomSnapshot, RoomSummary, TableView, ZoneDef, ZoneView, MoveTuple,
} from '../../../shared/platform';
import { FACINGS, LIMITS, ACTIVITY_ICONS } from '../../../shared/platform';
import { MAPS, MOVE_SPEED, pathClear, zoneAt, nearestFree, type MapDef } from '../../../shared/world';
import type { AvatarLook } from '../../../shared/platform';
import type { GameHost, GameModuleDefinition, GameSession } from './gameModule';
import { GameError } from './gameModule';
import { rid, clampStr, RateLimiter } from './util';

export const GRACE_MS = Number(process.env.RECONNECT_GRACE_MS ?? 120_000);
const EMPTY_ROOM_TTL_WAITING = 10 * 60_000;
const EMPTY_ROOM_TTL_PLAYING = 60 * 60_000;
const START_COUNTDOWN_MS = 4_000;
const SNAPSHOT_HZ = 15;

export interface Member {
  userId: string;
  nickname: string;
  look: AvatarLook;
  x: number; y: number; facing: Facing; moving: boolean;
  moveBudget: number; lastMoveAt: number;
  seat: { tableId: string; index: number } | null;
  mic: MicState;
  socketId: string | null;
  connected: boolean;
  disconnectedAt: number | null;
  absent: boolean;
  badge: string | null;
  activity: string | null;
  zoneId: string | null;
  joinedAt: number;
}

interface StoredMessage extends ChatMessage { audience: string[] }

export interface RoomDeps {
  io: Server;
  modules: Map<string, GameModuleDefinition>;
  onListChanged(): void;
  persistDirty(): void;
}

export interface RoomInit { id: string; no: number; title: string; passwordHash: string | null; maxMembers: number; mapId: string; createdAt: number }

interface GameRuntime { moduleId: string; contentId: string; participants: string[]; session: GameSession }

const chatLimiter = new RateLimiter(6, 1.2);
const emoteLimiter = new RateLimiter(4, 1);
const actionLimiter = new RateLimiter(30, 15);
const signalLimiter = new RateLimiter(300, 150);

export class Room {
  readonly id: string;
  readonly no: number;
  title: string;
  passwordHash: string | null;
  maxMembers: number;
  readonly map: MapDef;
  readonly createdAt: number;
  members = new Map<string, Member>();
  zoneDefs: ZoneDef[];
  zonesOpen = true;
  table: TableView;
  messages: StoredMessage[] = [];
  game: GameRuntime | null = null;
  emptySince: number | null = null;
  private dirtyMoves = new Set<string>();
  private lastSnapshotAt = 0;
  private lastPeers = new Map<string, string>();
  private gamePushQueued = false;
  private zonesDirty = false;

  constructor(private deps: RoomDeps, init: RoomInit) {
    this.id = init.id; this.no = init.no; this.title = init.title; this.passwordHash = init.passwordHash;
    this.maxMembers = init.maxMembers; this.createdAt = init.createdAt;
    this.map = MAPS[init.mapId] ?? MAPS.salon;
    this.zoneDefs = this.map.defaultZones;
    this.table = { tableId: 'main', moduleId: null, contentId: null, contentTitle: null, minPlayers: null, maxPlayers: null, ready: [], startsAt: null, lastChangedBy: null };
  }

  get status(): 'waiting' | 'playing' { return this.game ? 'playing' : 'waiting'; }
  private get channelKey() { return `room:${this.id}`; }

  // ── 조회 ───────────────────────────────────────────
  activeMembers() { return [...this.members.values()].filter((m) => !m.absent || m.connected); }

  summary(): RoomSummary {
    const mod = this.table.moduleId ? this.deps.modules.get(this.table.moduleId) : null;
    return {
      id: this.id, no: this.no, title: this.title, hasPassword: !!this.passwordHash,
      members: [...this.members.values()].filter((m) => m.connected || (m.disconnectedAt && !m.absent)).length,
      maxMembers: this.maxMembers, status: this.status, moduleName: mod?.name ?? null,
      contentTitle: this.table.contentTitle, createdAt: this.createdAt,
    };
  }

  roleOf(uid: string): MemberView['role'] {
    if (!this.game) return 'idle';
    return this.game.participants.includes(uid) ? 'player' : 'spectator';
  }

  memberView(m: Member): MemberView {
    return {
      userId: m.userId, nickname: m.nickname, look: m.look, x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10, facing: m.facing,
      moving: m.moving, seat: m.seat, mic: m.mic, connected: m.connected, disconnectedAt: m.disconnectedAt,
      badge: m.badge, activity: m.activity ?? null, role: this.roleOf(m.userId),
    };
  }

  zoneViews(): ZoneView[] {
    return this.zoneDefs.map((z) => ({
      ...z, open: this.zonesOpen,
      occupants: [...this.members.values()].filter((m) => m.zoneId === z.id && !m.absent).map((m) => m.userId),
    }));
  }

  snapshotFor(): RoomSnapshot {
    return {
      roomId: this.id, no: this.no, title: this.title, hasPassword: !!this.passwordHash, maxMembers: this.maxMembers,
      mapId: this.map.id, members: [...this.members.values()].map((m) => this.memberView(m)), zones: this.zoneViews(),
      table: this.table, status: this.status, gameModuleId: this.game?.moduleId ?? null, graceMs: GRACE_MS, serverNow: Date.now(),
    };
  }

  // ── 입장/퇴장 ──────────────────────────────────────
  joinError(userId: string, passwordHash: string | null): string | null {
    const existing = this.members.get(userId);
    if (existing) return null; // 재접속은 비밀번호/정원 검사 없이 복귀
    if (this.passwordHash && this.passwordHash !== passwordHash) return passwordHash ? '비밀번호가 올바르지 않습니다' : 'PASSWORD_REQUIRED';
    const count = [...this.members.values()].filter((m) => m.connected || !m.absent).length;
    if (count >= this.maxMembers) return '방이 가득 찼습니다';
    return null;
  }

  attach(user: { userId: string; nickname: string; look: AvatarLook }, socketId: string): { restored: boolean } {
    const io = this.deps.io;
    let m = this.members.get(user.userId);
    const restored = !!m;
    if (m) {
      // 다른 소켓에 붙어 있었다면 교체
      if (m.socketId && m.socketId !== socketId) {
        const old = io.sockets.sockets.get(m.socketId);
        old?.leave(this.channelKey);
      }
      m.socketId = socketId; m.connected = true; m.disconnectedAt = null; m.absent = false;
      m.nickname = user.nickname; m.look = user.look;
      const fixed = nearestFree(this.map, m.x, m.y); m.x = fixed.x; m.y = fixed.y;
    } else {
      const spawn = this.pickSpawn();
      m = {
        userId: user.userId, nickname: user.nickname, look: user.look, x: spawn.x, y: spawn.y, facing: 'down', moving: false,
        moveBudget: 0, lastMoveAt: Date.now(), seat: null, mic: 'off', socketId, connected: true, disconnectedAt: null,
        absent: false, badge: null, activity: null, zoneId: null, joinedAt: Date.now(),
      };
      this.members.set(user.userId, m);
    }
    m.moveBudget = MOVE_SPEED * 0.3; m.lastMoveAt = Date.now();
    this.updateZoneOf(m);
    this.emptySince = null;
    io.sockets.sockets.get(socketId)?.join(this.channelKey);
    io.to(this.channelKey).emit('room:member', this.memberView(m));
    this.broadcastZones();
    if (!restored) this.addSystem(`${m.nickname}님이 입장했습니다.`);
    else this.addSystem(`${m.nickname}님이 다시 연결되었습니다.`);
    if (this.game?.participants.includes(m.userId)) this.game.session.onParticipantConnection(m.userId, true);
    this.lastPeers.delete(m.userId);
    this.recomputeVoice();
    this.evaluateTable();
    this.deps.onListChanged();
    this.deps.persistDirty();
    return { restored };
  }

  /** 소켓 끊김 또는 명시적 퇴장 */
  detach(userId: string, reason: 'disconnect' | 'leave') {
    const m = this.members.get(userId);
    if (!m) return;
    const sock = m.socketId ? this.deps.io.sockets.sockets.get(m.socketId) : null;
    sock?.leave(this.channelKey);
    const isPlayer = !!this.game?.participants.includes(userId);
    if (reason === 'leave' && !isPlayer) {
      this.removeMember(m, `${m.nickname}님이 퇴장했습니다.`);
      return;
    }
    m.connected = false; m.socketId = null; m.disconnectedAt = Date.now(); m.moving = false; m.activity = null;
    if (m.mic === 'on') m.mic = 'off';
    if (reason === 'leave') { m.absent = true; }
    this.deps.io.to(this.channelKey).emit('room:member', this.memberView(m));
    this.addSystem(reason === 'leave' ? `${m.nickname}님이 게임 도중 자리를 떠났습니다. (같은 브라우저로 다시 입장하면 복귀합니다)` : `${m.nickname}님의 연결이 끊겼습니다. ${Math.round(GRACE_MS / 1000)}초 동안 재접속을 기다립니다.`);
    this.table.ready = this.table.ready.filter((id) => id !== userId);
    if (this.game && isPlayer) {
      this.game.session.onParticipantConnection(userId, false);
      if (m.absent) this.game.session.onParticipantAbsent(userId);
    }
    this.recomputeVoice();
    this.broadcastZones();
    this.evaluateTable();
    this.deps.onListChanged();
    this.deps.persistDirty();
  }

  private removeMember(m: Member, msg: string) {
    this.members.delete(m.userId);
    this.lastPeers.delete(m.userId);
    this.table.ready = this.table.ready.filter((id) => id !== m.userId);
    this.deps.io.to(this.channelKey).emit('room:memberLeft', { userId: m.userId });
    this.addSystem(msg);
    this.recomputeVoice();
    this.broadcastZones();
    this.evaluateTable();
    this.deps.onListChanged();
    this.deps.persistDirty();
  }

  private pickSpawn() {
    const taken = [...this.members.values()];
    const free = this.map.spawns.find((s) => !taken.some((m) => Math.hypot(m.x - s.x, m.y - s.y) < 12));
    const s = free ?? this.map.spawns[Math.floor(Math.random() * this.map.spawns.length)];
    return nearestFree(this.map, s.x + (free ? 0 : (Math.random() - 0.5) * 20), s.y);
  }

  // ── 이동 (서버 권위) ────────────────────────────────
  handleMove(userId: string, p: { x: number; y: number; f: number; mv: 0 | 1 }) {
    const m = this.members.get(userId);
    if (!m || !m.connected) return;
    const x = Number(p?.x), y = Number(p?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const now = Date.now();
    const dt = Math.min(1, (now - m.lastMoveAt) / 1000);
    m.lastMoveAt = now;
    // 이동 가능 거리 예산 (토큰 버킷: 네트워크 지터로 몰려 도착한 패킷을 허용하되 순간이동은 차단)
    m.moveBudget = Math.min(MOVE_SPEED * 0.6, m.moveBudget + MOVE_SPEED * dt * 1.25);
    const d = Math.hypot(x - m.x, y - m.y);
    const facing = FACINGS[Number(p.f)] ?? m.facing;
    if (d > 0.01) {
      if (d > m.moveBudget + 2 || !pathClear(this.map, m.x, m.y, x, y)) {
        this.fix(m);
        return;
      }
      // 밀담 구역에는 인원 제한이 없다. 들어가려는 행동 자체를 막지 않는다.
      m.moveBudget -= d;
      m.x = x; m.y = y;
      if (m.seat) {
        const seat = this.map.tables.find((t) => t.id === m.seat!.tableId)?.seats[m.seat.index];
        if (!seat || Math.hypot(seat.x - x, seat.y - y) > 3) this.standUp(m, false);
      }
      this.updateZoneOf(m);
    }
    m.facing = facing;
    m.moving = !!p.mv;
    this.dirtyMoves.add(userId);
  }

  private fix(m: Member, reason?: string) {
    if (m.socketId) this.deps.io.to(m.socketId).emit('m:fix', { x: m.x, y: m.y, reason });
  }

  private updateZoneOf(m: Member) {
    const z = zoneAt(this.zoneDefs, m.x, m.y);
    const next = z?.id ?? null;
    if (next !== m.zoneId) {
      m.zoneId = next;
      this.zonesDirty = true;
      this.recomputeVoice();
      // 대화 채널이 바뀌면 게임 뷰도 달라질 수 있다 (예: 테이블에 펼쳐 둔 자료가 보이는 범위)
      if (this.game) this.pushGame();
    }
  }

  sit(userId: string, tableId: string, index: number): string | null {
    const m = this.members.get(userId);
    const table = this.map.tables.find((t) => t.id === tableId);
    const seat = table?.seats[index];
    if (!m || !table || !seat) return '자리를 찾을 수 없습니다';
    if (Math.hypot(seat.x - m.x, seat.y - m.y) > 40) return '자리에 더 가까이 가야 합니다';
    for (const o of this.members.values()) if (o !== m && o.seat?.tableId === tableId && o.seat.index === index && !o.absent) return '이미 누군가 앉아 있습니다';
    m.seat = { tableId, index };
    m.x = seat.x; m.y = seat.y; m.facing = seat.facing; m.moving = false;
    this.updateZoneOf(m);
    this.fix(m, 'seat');
    this.dirtyMoves.add(userId);
    this.deps.io.to(this.channelKey).emit('room:member', this.memberView(m));
    this.evaluateTable();
    return null;
  }

  stand(userId: string) { const m = this.members.get(userId); if (m?.seat) this.standUp(m, true); }

  private standUp(m: Member, emit: boolean) {
    m.seat = null;
    this.table.ready = this.table.ready.filter((id) => id !== m.userId);
    if (emit) this.fix(m);
    this.deps.io.to(this.channelKey).emit('room:member', this.memberView(m));
    this.evaluateTable();
  }

  // ── 채팅 (구역 격리) ────────────────────────────────
  channelOf(m: Member): string {
    return this.zonesOpen && m.zoneId && this.zoneDefs.some((z) => z.id === m.zoneId) ? m.zoneId : 'public';
  }
  channelName(ch: string) { return ch === 'public' ? '공용 공간' : this.zoneDefs.find((z) => z.id === ch)?.name ?? ch; }

  audienceOf(channel: string): string[] {
    return [...this.members.values()].filter((o) => !o.absent && this.channelOf(o) === channel).map((o) => o.userId);
  }

  chat(userId: string, textRaw: unknown): string | null {
    const m = this.members.get(userId);
    if (!m) return '방에 없습니다';
    const text = clampStr(textRaw, LIMITS.chatMax);
    if (!text) return null;
    if (!chatLimiter.take(userId)) return '메시지를 너무 빠르게 보내고 있습니다';
    const ch = this.channelOf(m);
    this.addMessage({ channel: ch, channelName: this.channelName(ch), fromId: userId, fromName: m.nickname, text, kind: 'chat' }, this.audienceOf(ch));
    return null;
  }

  addMessage(msg: Omit<ChatMessage, 'id' | 'ts'>, audience: string[]) {
    const full: StoredMessage = { ...msg, id: rid(6), ts: Date.now(), audience };
    this.messages.push(full);
    if (this.messages.length > 1500) this.messages.splice(0, this.messages.length - 1200);
    const { audience: _a, ...wire } = full;
    for (const uid of audience) {
      const sid = this.members.get(uid)?.socketId;
      if (sid) this.deps.io.to(sid).emit('chat:msg', wire);
    }
    this.deps.persistDirty();
  }

  addSystem(text: string) {
    this.addMessage({ channel: 'system', channelName: '알림', fromId: null, fromName: null, text, kind: 'system' }, [...this.members.keys()]);
  }

  historyFor(userId: string): ChatMessage[] {
    const out: ChatMessage[] = [];
    for (let i = this.messages.length - 1; i >= 0 && out.length < 200; i--) {
      const msg = this.messages[i];
      if (msg.audience.includes(userId)) { const { audience: _a, ...wire } = msg; out.push(wire); }
    }
    return out.reverse();
  }

  emote(userId: string, e: unknown) {
    const m = this.members.get(userId);
    const allowed = ['❗', '❓', '👍', '😮', '🤔', '👋', '😂', '🙏'];
    if (!m || typeof e !== 'string' || !allowed.includes(e) || !emoteLimiter.take(userId)) return;
    for (const uid of this.audienceOf(this.channelOf(m))) {
      const sid = this.members.get(uid)?.socketId;
      if (sid) this.deps.io.to(sid).emit('emote', { userId, e });
    }
  }

  setActivity(userId: string, a: unknown) {
    const m = this.members.get(userId);
    if (!m) return;
    const next = typeof a === 'string' && ACTIVITY_ICONS.includes(a) ? a : null;
    if (m.activity === next) return;
    m.activity = next;
    this.deps.io.to(this.channelKey).emit('room:member', this.memberView(m));
  }

  // ── 음성 (WebRTC 시그널링: 같은 채널끼리만 연결 허용) ──
  setMic(userId: string, state: unknown) {
    const m = this.members.get(userId);
    if (!m || !['on', 'off', 'none'].includes(state as string)) return;
    m.mic = state as MicState;
    this.deps.io.to(this.channelKey).emit('room:member', this.memberView(m));
  }

  recomputeVoice() {
    const connected = [...this.members.values()].filter((m) => m.connected && m.socketId);
    for (const m of connected) {
      const ch = this.channelOf(m);
      const peers = connected.filter((o) => o !== m && this.channelOf(o) === ch).map((o) => o.userId).sort();
      const key = `${ch}|${peers.join(',')}`;
      if (this.lastPeers.get(m.userId) !== key) {
        this.lastPeers.set(m.userId, key);
        this.deps.io.to(m.socketId!).emit('v:peers', { channel: ch, peers });
      }
    }
  }

  relaySignal(from: string, to: unknown, data: unknown) {
    if (typeof to !== 'string' || !signalLimiter.take(from)) return;
    const a = this.members.get(from), b = this.members.get(to);
    if (!a || !b || !a.connected || !b.connected || !b.socketId) return;
    if (this.channelOf(a) !== this.channelOf(b)) return; // 격리: 다른 채널끼리는 연결 자체를 막는다
    this.deps.io.to(b.socketId).emit('v:signal', { from, data });
  }

  // ── 테이블 (게임 선택/준비/자동 시작) ─────────────────
  seatedMembers() {
    return [...this.members.values()].filter((m) => m.seat?.tableId === this.table.tableId && m.connected).sort((a, b) => a.seat!.index - b.seat!.index);
  }

  tableSelect(userId: string, moduleId: unknown, contentId: unknown): string | null {
    if (this.game) return '게임이 진행 중입니다';
    const m = this.members.get(userId);
    if (!m?.seat) return '테이블에 앉은 사람만 게임을 고를 수 있습니다';
    const mod = typeof moduleId === 'string' ? this.deps.modules.get(moduleId) : null;
    const content = mod && typeof contentId === 'string' ? mod.getContent(contentId) : null;
    if (!mod || !content) return '게임을 찾을 수 없습니다';
    this.table = {
      ...this.table, moduleId: mod.id, contentId: content.contentId, contentTitle: content.title,
      minPlayers: content.minPlayers, maxPlayers: content.maxPlayers, ready: [], startsAt: null, lastChangedBy: userId,
    };
    this.addSystem(`${m.nickname}님이 게임을 「${content.title}」(으)로 정했습니다. (${content.minPlayers === content.maxPlayers ? content.minPlayers : `${content.minPlayers}~${content.maxPlayers}`}인)`);
    this.evaluateTable(true);
    this.deps.onListChanged();
    return null;
  }

  tableReady(userId: string, ready: boolean): string | null {
    if (this.game) return '게임이 진행 중입니다';
    const m = this.members.get(userId);
    if (!m?.seat) return '먼저 테이블에 앉아 주세요';
    if (!this.table.contentId) return '먼저 게임을 골라 주세요';
    const set = new Set(this.table.ready);
    ready ? set.add(userId) : set.delete(userId);
    this.table.ready = [...set];
    this.evaluateTable(true);
    return null;
  }

  private evaluateTable(forceEmit = false) {
    if (this.game) return;
    const seated = this.seatedMembers();
    const seatedIds = new Set(seated.map((m) => m.userId));
    const before = JSON.stringify(this.table);
    this.table.ready = this.table.ready.filter((id) => seatedIds.has(id));
    const t = this.table;
    let content = t.moduleId && t.contentId ? this.deps.modules.get(t.moduleId)?.getContent(t.contentId) : null;
    if (t.contentId && !content) { // 시나리오가 삭제/비공개됨
      this.table = { ...t, moduleId: null, contentId: null, contentTitle: null, minPlayers: null, maxPlayers: null, ready: [], startsAt: null };
      content = null;
    }
    const ok = !!content && seated.length >= content.minPlayers && seated.length <= content.maxPlayers && seated.every((m) => this.table.ready.includes(m.userId));
    if (ok && !this.table.startsAt) this.table.startsAt = Date.now() + START_COUNTDOWN_MS;
    if (!ok) this.table.startsAt = null;
    if (forceEmit || before !== JSON.stringify(this.table)) this.deps.io.to(this.channelKey).emit('room:table', this.table);
  }

  private startGame() {
    const t = this.table;
    const mod = t.moduleId ? this.deps.modules.get(t.moduleId) : null;
    const seated = this.seatedMembers();
    if (!mod || !t.contentId) return;
    const participants = seated.map((m) => m.userId);
    this.game = { moduleId: mod.id, contentId: t.contentId, participants, session: null as unknown as GameSession };
    try {
      this.game.session = mod.createSession(this.makeHost(), t.contentId, participants);
    } catch (e) {
      console.error('[room] 게임 시작 실패', e);
      this.game = null;
      this.addSystem(`게임을 시작하지 못했습니다: ${(e as Error).message}`);
      this.table.startsAt = null; this.table.ready = [];
      this.deps.io.to(this.channelKey).emit('room:table', this.table);
      return;
    }
    this.table.startsAt = null; this.table.ready = [];
    this.addSystem(`🎲 「${t.contentTitle}」 게임이 시작되었습니다! 참가자: ${seated.map((m) => m.nickname).join(', ')}`);
    this.broadcastStatus();
    this.pushGame();
    this.deps.onListChanged();
    this.deps.persistDirty();
  }

  private endGame() {
    if (!this.game) return;
    this.game.session.dispose?.();
    const participants = this.game.participants;
    this.game = null;
    this.zoneDefs = this.map.defaultZones; this.zonesOpen = true;
    for (const m of this.members.values()) { m.badge = null; m.activity = null; }
    for (const uid of participants) {
      const m = this.members.get(uid);
      if (m && !m.connected && m.absent) this.members.delete(uid);
    }
    for (const m of this.members.values()) this.updateZoneOf(m);
    this.addSystem('게임이 끝났습니다. 테이블에서 새 게임을 고를 수 있습니다.');
    this.broadcastStatus();
    this.deps.io.to(this.channelKey).emit('room:snapshot', this.snapshotFor());
    this.recomputeVoice();
    this.evaluateTable(true);
    this.deps.onListChanged();
    this.deps.persistDirty();
  }

  private broadcastStatus() {
    this.deps.io.to(this.channelKey).emit('room:status', { status: this.status, gameModuleId: this.game?.moduleId ?? null });
    for (const m of this.members.values()) this.deps.io.to(this.channelKey).emit('room:member', this.memberView(m));
  }

  gameAction(userId: string, type: unknown, payload: unknown): { ok: true; result?: unknown } | { ok: false; error: string } {
    if (!this.game) return { ok: false, error: '진행 중인 게임이 없습니다' };
    if (typeof type !== 'string') return { ok: false, error: '잘못된 요청' };
    if (!actionLimiter.take(userId)) return { ok: false, error: '요청이 너무 많습니다' };
    try {
      const result = this.game.session.onAction(userId, type, payload);
      this.deps.persistDirty();
      return { ok: true, result };
    } catch (e) {
      if (e instanceof GameError) return { ok: false, error: e.message };
      console.error('[game] action error', type, e);
      return { ok: false, error: '처리 중 오류가 발생했습니다' };
    }
  }

  private makeHost(): GameHost {
    const io = this.deps.io;
    const sidsOf = (target: string[] | 'all') => (target === 'all' ? [...this.members.values()] : target.map((u) => this.members.get(u)).filter(Boolean) as Member[])
      .map((m) => m.socketId).filter(Boolean) as string[];
    return {
      now: () => Date.now(),
      participants: () => (this.game?.participants ?? []).map((uid) => {
        const m = this.members.get(uid);
        return { userId: uid, nickname: m?.nickname ?? '(퇴장)', connected: !!m?.connected, absent: !m || m.absent };
      }),
      pushState: () => this.pushGame(),
      emit: (target, type, payload) => { for (const sid of sidsOf(target)) io.to(sid).emit('g:event', { type, payload }); },
      channelOf: (uid) => { const m = this.members.get(uid); return m ? this.channelOf(m) : 'public'; },
      audienceOf: (ch) => this.audienceOf(ch),
      systemMessage: (text, audience = 'all') => {
        const ids = audience === 'all' ? [...this.members.keys()] : audience;
        this.addMessage({ channel: 'system', channelName: '게임', fromId: null, fromName: null, text, kind: 'game' }, ids);
      },
      toast: (target, text, tone = 'info') => { for (const sid of sidsOf(target)) io.to(sid).emit('toast', { text, tone }); },
      setZones: (zones) => {
        this.zoneDefs = zones && zones.length ? zones : zones ? [] : this.map.defaultZones;
        for (const m of this.members.values()) this.updateZoneOf(m);
        this.broadcastZones(true);
        this.recomputeVoice();
      },
      setZonesOpen: (open) => {
        if (this.zonesOpen === open) return;
        this.zonesOpen = open;
        this.broadcastZones(true);
        this.recomputeVoice();
      },
      setBadge: (uid, label) => {
        const m = this.members.get(uid);
        if (!m) return;
        m.badge = label;
        io.to(this.channelKey).emit('room:member', this.memberView(m));
      },
      endGame: () => setImmediate(() => this.endGame()),
      markDirty: () => this.deps.persistDirty(),
    };
  }

  pushGame() {
    if (this.gamePushQueued) return;
    this.gamePushQueued = true;
    setImmediate(() => {
      this.gamePushQueued = false;
      if (!this.game) return;
      for (const m of this.members.values()) {
        if (!m.socketId) continue;
        try {
          this.deps.io.to(m.socketId).emit('g:state', this.game.session.viewFor(m.userId));
        } catch (e) { console.error('[game] viewFor 실패', e); }
      }
    });
  }

  sendGameStateTo(userId: string) {
    const m = this.members.get(userId);
    if (this.game && m?.socketId) this.deps.io.to(m.socketId).emit('g:state', this.game.session.viewFor(userId));
  }

  broadcastZones(force = false) {
    if (force) this.zonesDirty = true;
    if (!this.zonesDirty) return;
    this.zonesDirty = false;
    this.deps.io.to(this.channelKey).emit('room:zones', this.zoneViews());
  }

  // ── 틱 ─────────────────────────────────────────────
  tick(now: number) {
    if (now - this.lastSnapshotAt >= 1000 / SNAPSHOT_HZ && this.dirtyMoves.size) {
      this.lastSnapshotAt = now;
      const moves: MoveTuple[] = [];
      for (const uid of this.dirtyMoves) {
        const m = this.members.get(uid);
        if (m) moves.push([uid, Math.round(m.x * 10) / 10, Math.round(m.y * 10) / 10, FACINGS.indexOf(m.facing), m.moving ? 1 : 0]);
      }
      this.dirtyMoves.clear();
      this.deps.io.to(this.channelKey).emit('s', moves);
    }
    if (this.zonesDirty) this.broadcastZones();

    // 재접속 유예 만료 처리
    for (const m of [...this.members.values()]) {
      if (m.connected || m.absent || !m.disconnectedAt) continue;
      if (now - m.disconnectedAt < GRACE_MS) continue;
      if (this.game?.participants.includes(m.userId)) {
        m.absent = true;
        this.addSystem(`${m.nickname}님이 제한 시간 안에 돌아오지 않아 부재 처리되었습니다. 진행 확인은 자동으로 넘어가며, 돌아오면 그대로 복귀합니다.`);
        this.game.session.onParticipantAbsent(m.userId);
        this.deps.io.to(this.channelKey).emit('room:member', this.memberView(m));
        this.broadcastZones(true);
      } else {
        this.removeMember(m, `${m.nickname}님이 돌아오지 않아 퇴장 처리되었습니다.`);
      }
    }

    if (this.table.startsAt && now >= this.table.startsAt && !this.game) this.startGame();
    if (this.game) {
      try { this.game.session.tick(now); } catch (e) { console.error('[game] tick 오류', e); }
    }

    const anyConnected = [...this.members.values()].some((m) => m.connected);
    if (anyConnected) this.emptySince = null;
    else if (this.emptySince === null) this.emptySince = now;
  }

  isExpired(now: number) {
    if (this.emptySince === null) return false;
    return now - this.emptySince > (this.game ? EMPTY_ROOM_TTL_PLAYING : EMPTY_ROOM_TTL_WAITING);
  }

  // ── 저장/복원 ───────────────────────────────────────
  serialize() {
    return {
      init: { id: this.id, no: this.no, title: this.title, passwordHash: this.passwordHash, maxMembers: this.maxMembers, mapId: this.map.id, createdAt: this.createdAt },
      members: [...this.members.values()].map((m) => ({ ...m, socketId: null, connected: false, disconnectedAt: m.disconnectedAt ?? Date.now() })),
      zoneDefs: this.zoneDefs, zonesOpen: this.zonesOpen, table: { ...this.table, startsAt: null, ready: [] },
      messages: this.messages.slice(-400),
      game: this.game ? { moduleId: this.game.moduleId, contentId: this.game.contentId, participants: this.game.participants, state: this.game.session.snapshot() } : null,
      savedAt: Date.now(),
    };
  }

  static restore(deps: RoomDeps, data: ReturnType<Room['serialize']>): Room {
    const room = new Room(deps, data.init);
    const shift = Date.now() - data.savedAt;
    for (const m of data.members) room.members.set(m.userId, { ...m, disconnectedAt: Date.now(), mic: m.mic === 'on' ? 'off' : m.mic });
    room.zoneDefs = data.zoneDefs; room.zonesOpen = data.zonesOpen; room.table = data.table;
    room.messages = data.messages;
    if (data.game) {
      const mod = deps.modules.get(data.game.moduleId);
      if (mod) {
        room.game = { moduleId: data.game.moduleId, contentId: data.game.contentId, participants: data.game.participants, session: null as unknown as GameSession };
        try { room.game.session = mod.restoreSession(room.makeHost(), data.game.state, shift); }
        catch (e) { console.error('[room] 게임 복원 실패', e); room.game = null; }
      }
    }
    return room;
  }
}
