/**
 * 로비 레이어(플랫폼) 공용 타입 & 소켓 프로토콜.
 * ⚠️ 이 파일에는 특정 장르(머더미스터리 등)의 개념이 들어오면 안 된다.
 *    게임 모듈은 `g:*` 이벤트의 opaque payload 로만 통신한다.
 */

export type Facing = 'down' | 'up' | 'left' | 'right';

export interface AvatarLook {
  skin: number;
  hair: number;
  hairColor: number;
  outfit: number;
  outfitColor: number;
  accessory: number;
}

export interface Rect { x: number; y: number; w: number; h: number }

/** 음성/텍스트가 격리되는 구역. 로비 레이어 개념이며 게임 모듈이 목록을 교체할 수 있다. */
export interface ZoneDef {
  id: string;
  name: string;
  rect: Rect;
  /** null/undefined = 제한 없음 */
  maxOccupants?: number | null;
}

export interface ZoneView extends ZoneDef {
  /** false 이면 구역 표시만 되고 격리되지 않는다 (게임 단계에 따라 닫힘) */
  open: boolean;
  occupants: string[];
}

export type MicState = 'on' | 'off' | 'none';

export interface MemberView {
  userId: string;
  nickname: string;
  look: AvatarLook;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  seat: { tableId: string; index: number } | null;
  mic: MicState;
  connected: boolean;
  /** 연결 끊김 시각(ms). 재접속 유예 표시에 사용 */
  disconnectedAt: number | null;
  /** 게임 모듈이 붙여주는 이름표 부가 라벨 (예: 배역 이름) */
  badge: string | null;
  /** 지금 무엇을 하는 중인지 나타내는 작은 아이콘 (예: 📖 읽는 중). 모듈이 정하지만 로비는 의미를 모른다 */
  activity: string | null;
  /** 게임 참가자 여부 (게임 중일 때) */
  role: 'player' | 'spectator' | 'idle';
}

export interface RoomSummary {
  id: string;
  no: number;
  title: string;
  hasPassword: boolean;
  members: number;
  maxMembers: number;
  status: 'waiting' | 'playing';
  moduleName: string | null;
  contentTitle: string | null;
  createdAt: number;
}

export interface ContentSummary {
  moduleId: string;
  contentId: string;
  title: string;
  subtitle?: string;
  summary: string;
  minPlayers: number;
  maxPlayers: number;
  playtimeMin?: number;
  cover?: string | null;
  tags?: string[];
}

export interface ModuleSummary {
  id: string;
  name: string;
  description: string;
  contents: ContentSummary[];
}

/** 로비(게임 시작 전) 테이블 상태 */
export interface TableView {
  tableId: string;
  moduleId: string | null;
  contentId: string | null;
  contentTitle: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  ready: string[];
  /** 전원 준비 → 자동 시작 카운트다운 종료 시각 */
  startsAt: number | null;
  lastChangedBy: string | null;
}

export interface ChatMessage {
  id: string;
  ts: number;
  /** 'public' | zoneId | 'system' */
  channel: string;
  channelName: string;
  fromId: string | null;
  fromName: string | null;
  text: string;
  kind: 'chat' | 'system' | 'game';
}

export interface RoomSnapshot {
  roomId: string;
  no: number;
  title: string;
  hasPassword: boolean;
  maxMembers: number;
  mapId: string;
  members: MemberView[];
  zones: ZoneView[];
  table: TableView;
  status: 'waiting' | 'playing';
  gameModuleId: string | null;
  graceMs: number;
  serverNow: number;
}

export type MoveTuple = [userId: string, x: number, y: number, facing: number, moving: 0 | 1];

export const FACINGS: Facing[] = ['down', 'up', 'left', 'right'];
export const ACTIVITY_ICONS = ['📖', '🔎', '✉️', '🗳️', '🃏', '💬'];

export const LIMITS = {
  nicknameMax: 12,
  roomTitleMax: 24,
  chatMax: 300,
  maxMembersCap: 12,
};

/** 클라이언트 → 서버 이벤트 */
export interface C2S {
  'auth': (p: { token?: string | null; nickname?: string; look?: AvatarLook }, ack: (r: AuthResult) => void) => void;
  'profile:update': (p: { nickname?: string; look?: AvatarLook }, ack: (r: Result) => void) => void;
  'rooms:list': (ack: (r: { rooms: RoomSummary[]; modules: ModuleSummary[] }) => void) => void;
  'rooms:create': (p: { title: string; password?: string; maxMembers?: number }, ack: (r: Result<{ roomId: string }>) => void) => void;
  'room:join': (p: { roomId?: string; no?: number; password?: string }, ack: (r: Result<{ snapshot: RoomSnapshot; history: ChatMessage[] }>) => void) => void;
  'room:leave': (ack?: (r: Result) => void) => void;
  'm': (p: { x: number; y: number; f: number; mv: 0 | 1 }) => void;
  'sit': (p: { tableId: string; index: number }, ack: (r: Result) => void) => void;
  'stand': () => void;
  'chat:send': (p: { text: string }, ack: (r: Result) => void) => void;
  'mic': (p: { state: MicState }) => void;
  'emote': (p: { e: string }) => void;
  'activity': (p: { a: string | null }) => void;
  'table:select': (p: { moduleId: string; contentId: string }, ack: (r: Result) => void) => void;
  'table:ready': (p: { ready: boolean }, ack: (r: Result) => void) => void;
  'v:signal': (p: { to: string; data: unknown }) => void;
  'g:action': (p: { type: string; payload?: unknown }, ack: (r: Result<unknown>) => void) => void;
  'time': (ack: (serverNow: number) => void) => void;
}

/** 서버 → 클라이언트 이벤트 */
export interface S2C {
  'rooms:changed': () => void;
  'room:snapshot': (s: RoomSnapshot) => void;
  'room:member': (m: MemberView) => void;
  'room:memberLeft': (p: { userId: string }) => void;
  'room:zones': (z: ZoneView[]) => void;
  'room:table': (t: TableView) => void;
  'room:status': (p: { status: 'waiting' | 'playing'; gameModuleId: string | null }) => void;
  's': (moves: MoveTuple[]) => void;
  'm:fix': (p: { x: number; y: number; reason?: string }) => void;
  'chat:msg': (m: ChatMessage) => void;
  'emote': (p: { userId: string; e: string }) => void;
  'v:peers': (p: { channel: string; peers: string[] }) => void;
  'v:signal': (p: { from: string; data: unknown }) => void;
  'g:state': (view: unknown) => void;
  'g:event': (e: { type: string; payload?: unknown }) => void;
  'toast': (p: { text: string; tone?: 'info' | 'warn' | 'error' }) => void;
  'kicked': (p: { reason: string }) => void;
}

export interface UserProfile { userId: string; nickname: string; look: AvatarLook }
export type AuthResult = Result<{ token: string; user: UserProfile; lastRoomId: string | null }>;

export type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string };
