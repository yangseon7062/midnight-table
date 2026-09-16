import type { Server, Socket } from 'socket.io';
import type { C2S, S2C, RoomSummary, ModuleSummary } from '../../../shared/platform';
import { LIMITS } from '../../../shared/platform';
import { DEFAULT_MAP_ID } from '../../../shared/world';
import type { GameModuleDefinition } from './gameModule';
import { Room, type RoomDeps } from './room';
import { UserStore, type UserRecord } from './users';
import { rid, sha256, clampStr, writeJsonAtomic, readJson } from './util';

type IO = Server<C2S, S2C>;
type Sock = Socket<C2S, S2C>;

export class RoomManager {
  rooms = new Map<string, Room>();
  private nextNo = 1;
  private listDirty = false;
  private persistDirtyFlag = false;
  private userSockets = new Map<string, string>(); // userId → socketId
  private deps: RoomDeps;

  constructor(private io: IO, private users: UserStore, private modules: Map<string, GameModuleDefinition>, private roomsFile: string) {
    this.deps = {
      io: io as unknown as Server,
      modules,
      onListChanged: () => { this.listDirty = true; },
      persistDirty: () => { this.persistDirtyFlag = true; },
    };
    this.restore();
    setInterval(() => this.tick(), 50);
    setInterval(() => this.persist(), 3000);
  }

  // ── 영속화 (서버 재시작 시에도 진행 중인 방/게임 복원) ──
  private restore() {
    const data = readJson<{ nextNo: number; rooms: ReturnType<Room['serialize']>[] }>(this.roomsFile, { nextNo: 1, rooms: [] });
    this.nextNo = data.nextNo || 1;
    for (const r of data.rooms) {
      try {
        const room = Room.restore(this.deps, r);
        this.rooms.set(room.id, room);
      } catch (e) { console.warn('[rooms] 복원 실패', e); }
    }
    if (this.rooms.size) console.log(`[rooms] ${this.rooms.size}개 방 복원`);
  }

  persist(force = false) {
    if (!this.persistDirtyFlag && !force) return;
    this.persistDirtyFlag = false;
    try {
      writeJsonAtomic(this.roomsFile, { nextNo: this.nextNo, rooms: [...this.rooms.values()].map((r) => r.serialize()) });
    } catch (e) { console.error('[rooms] 저장 실패', e); }
  }

  private tick() {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      room.tick(now);
      if (room.isExpired(now)) {
        console.log(`[rooms] 빈 방 정리: #${room.no} ${room.title}`);
        this.rooms.delete(room.id);
        this.listDirty = true; this.persistDirtyFlag = true;
      }
    }
    if (this.listDirty) {
      this.listDirty = false;
      this.io.to('lobby').emit('rooms:changed');
    }
  }

  summaries(): RoomSummary[] { return [...this.rooms.values()].map((r) => r.summary()).sort((a, b) => a.no - b.no); }
  moduleSummaries(): ModuleSummary[] {
    return [...this.modules.values()].map((m) => ({ id: m.id, name: m.name, description: m.description, contents: m.listContents() }));
  }

  roomOfUser(userId: string): Room | null {
    for (const r of this.rooms.values()) if (r.members.get(userId)?.connected) return r;
    return null;
  }

  // ── 소켓 ────────────────────────────────────────────
  bind(socket: Sock) {
    let user: UserRecord | null = null;
    let room: Room | null = null;

    const need = () => { if (!user) throw new Error('인증되지 않았습니다'); return user; };
    const safe = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => {
      try { fn(...a); } catch (e) {
        const ack = a[a.length - 1];
        if (typeof ack === 'function') (ack as (r: unknown) => void)({ ok: false, error: (e as Error).message });
        else console.warn('[socket]', (e as Error).message);
      }
    };

    socket.on('time', safe((ack) => typeof ack === 'function' && ack(Date.now())));

    socket.on('auth', safe((p, ack) => {
      let u = this.users.getByToken(p?.token);
      if (!u) {
        const nickname = clampStr(p?.nickname, LIMITS.nicknameMax);
        const err = UserStore.nicknameError(nickname);
        if (err) return ack({ ok: false, error: p?.token ? 'SESSION_EXPIRED' : err });
        u = this.users.create(nickname, p?.look);
      } else if (p?.nickname || p?.look) {
        this.users.update(u, { nickname: p.nickname, look: p.look });
      }
      // 같은 유저의 다른 탭 연결은 끊는다 (한 유저 = 한 연결)
      const prevSid = this.userSockets.get(u.userId);
      if (prevSid && prevSid !== socket.id) {
        const prev = this.io.sockets.sockets.get(prevSid);
        if (prev) { prev.emit('kicked', { reason: '다른 창에서 같은 세션으로 접속했습니다.' }); prev.disconnect(true); }
      }
      this.userSockets.set(u.userId, socket.id);
      user = u;
      socket.join('lobby');
      const last = u.lastRoomId ? this.rooms.get(u.lastRoomId) : null;
      ack({ ok: true, token: u.token, user: this.users.profile(u), lastRoomId: last?.members.has(u.userId) ? last.id : null });
    }));

    socket.on('profile:update', safe((p, ack) => {
      const u = need();
      this.users.update(u, { nickname: p?.nickname, look: p?.look });
      if (room) {
        const m = room.members.get(u.userId);
        if (m) { m.nickname = u.nickname; m.look = u.look; this.io.to(`room:${room.id}`).emit('room:member', room.memberView(m)); }
      }
      ack({ ok: true });
    }));

    socket.on('rooms:list', safe((ack) => ack({ rooms: this.summaries(), modules: this.moduleSummaries() })));

    socket.on('rooms:create', safe((p, ack) => {
      need();
      const title = clampStr(p?.title, LIMITS.roomTitleMax);
      if (!title) return ack({ ok: false, error: '방 제목을 입력해 주세요' });
      const pw = clampStr(p?.password, 20);
      const maxMembers = Math.min(LIMITS.maxMembersCap, Math.max(2, Math.floor(Number(p?.maxMembers) || 8)));
      const r = new Room(this.deps, { id: rid(6), no: this.nextNo++, title, passwordHash: pw ? sha256(pw) : null, maxMembers, mapId: DEFAULT_MAP_ID, createdAt: Date.now() });
      r.emptySince = Date.now();
      this.rooms.set(r.id, r);
      this.listDirty = true; this.persistDirtyFlag = true;
      ack({ ok: true, roomId: r.id });
    }));

    socket.on('room:join', safe((p, ack) => {
      const u = need();
      const target = p?.roomId ? this.rooms.get(p.roomId) : [...this.rooms.values()].find((r) => r.no === Number(p?.no));
      if (!target) return ack({ ok: false, error: '방을 찾을 수 없습니다' });
      const pw = clampStr(p?.password, 20);
      const err = target.joinError(u.userId, pw ? sha256(pw) : null);
      if (err) return ack({ ok: false, error: err });
      if (room && room !== target) { room.detach(u.userId, 'leave'); }
      room = target;
      socket.leave('lobby');
      room.attach(u, socket.id);
      this.users.update(u, { lastRoomId: room.id });
      ack({ ok: true, snapshot: room.snapshotFor(), history: room.historyFor(u.userId) });
      room.sendGameStateTo(u.userId);
    }));

    socket.on('room:leave', safe((ack) => {
      const u = need();
      if (room) { room.detach(u.userId, 'leave'); room = null; }
      this.users.update(u, { lastRoomId: null });
      socket.join('lobby');
      if (typeof ack === 'function') ack({ ok: true });
    }));

    socket.on('m', (p) => { if (user && room) room.handleMove(user.userId, p); });
    socket.on('sit', safe((p, ack) => { const u = need(); if (!room) return ack({ ok: false, error: '방에 없습니다' }); const e = room.sit(u.userId, String(p?.tableId), Number(p?.index)); ack(e ? { ok: false, error: e } : { ok: true }); }));
    socket.on('stand', () => { if (user && room) room.stand(user.userId); });
    socket.on('chat:send', safe((p, ack) => { const u = need(); if (!room) return ack({ ok: false, error: '방에 없습니다' }); const e = room.chat(u.userId, p?.text); ack(e ? { ok: false, error: e } : { ok: true }); }));
    socket.on('mic', (p) => { if (user && room) room.setMic(user.userId, p?.state); });
    socket.on('emote', (p) => { if (user && room) room.emote(user.userId, p?.e); });
    socket.on('activity', (p) => { if (user && room) room.setActivity(user.userId, p?.a); });
    socket.on('table:select', safe((p, ack) => { const u = need(); if (!room) return ack({ ok: false, error: '방에 없습니다' }); const e = room.tableSelect(u.userId, p?.moduleId, p?.contentId); ack(e ? { ok: false, error: e } : { ok: true }); }));
    socket.on('table:ready', safe((p, ack) => { const u = need(); if (!room) return ack({ ok: false, error: '방에 없습니다' }); const e = room.tableReady(u.userId, !!p?.ready); ack(e ? { ok: false, error: e } : { ok: true }); }));
    socket.on('v:signal', (p) => { if (user && room) room.relaySignal(user.userId, p?.to, p?.data); });
    socket.on('g:action', safe((p, ack) => {
      const u = need();
      if (!room) return ack({ ok: false, error: '방에 없습니다' });
      ack(room.gameAction(u.userId, p?.type, p?.payload) as never);
    }));

    socket.on('disconnect', () => {
      if (!user) return;
      if (this.userSockets.get(user.userId) === socket.id) this.userSockets.delete(user.userId);
      if (room && room.members.get(user.userId)?.connected && room.members.get(user.userId)?.socketId === socket.id) room.detach(user.userId, 'disconnect');
    });
  }

  shutdown() { this.persist(true); this.users.flush(); }
}
