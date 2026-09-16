import type { AvatarLook, UserProfile } from '../../../shared/platform';
import { LIMITS } from '../../../shared/platform';
import { sanitizeLook, randomLook } from '../../../shared/avatar';
import { rid, writeJsonAtomic, readJson, clampStr } from './util';

/**
 * 로그인 없는 세션: 닉네임 입력 시 서버가 토큰을 발급하고, 브라우저 localStorage 에 저장된 토큰으로
 * 새로고침/재접속 시 같은 유저로 식별한다.
 */
export interface UserRecord {
  userId: string;
  token: string;
  nickname: string;
  look: AvatarLook;
  lastRoomId: string | null;
  lastSeen: number;
}

export class UserStore {
  private byToken = new Map<string, UserRecord>();
  private byId = new Map<string, UserRecord>();
  private saveTimer: NodeJS.Timeout | null = null;
  constructor(private file: string) {
    const list = readJson<UserRecord[]>(file, []);
    const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 30;
    for (const u of list) if (u.lastSeen > cutoff) this.index(u);
  }
  private index(u: UserRecord) { this.byToken.set(u.token, u); this.byId.set(u.userId, u); }

  static nicknameError(n: string): string | null {
    if (!n) return '닉네임을 입력해 주세요';
    if (n.length > LIMITS.nicknameMax) return `닉네임은 ${LIMITS.nicknameMax}자 이하로 입력해 주세요`;
    return null;
  }

  getByToken(token: unknown) { return typeof token === 'string' ? this.byToken.get(token) ?? null : null; }
  getById(id: string) { return this.byId.get(id) ?? null; }

  create(nickname: string, look?: unknown): UserRecord {
    const u: UserRecord = {
      userId: rid(6), token: rid(24), nickname: clampStr(nickname, LIMITS.nicknameMax),
      look: look ? sanitizeLook(look) : randomLook(), lastRoomId: null, lastSeen: Date.now(),
    };
    this.index(u);
    this.save();
    return u;
  }

  update(u: UserRecord, patch: { nickname?: unknown; look?: unknown; lastRoomId?: string | null }) {
    if (patch.nickname !== undefined) { const n = clampStr(patch.nickname, LIMITS.nicknameMax); if (n) u.nickname = n; }
    if (patch.look !== undefined) u.look = sanitizeLook(patch.look);
    if (patch.lastRoomId !== undefined) u.lastRoomId = patch.lastRoomId;
    u.lastSeen = Date.now();
    this.save();
  }

  profile(u: UserRecord): UserProfile { return { userId: u.userId, nickname: u.nickname, look: u.look }; }

  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.flush(); }, 1000);
  }
  flush() { writeJsonAtomic(this.file, [...this.byToken.values()]); }
}
