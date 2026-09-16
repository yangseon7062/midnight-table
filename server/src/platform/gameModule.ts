import type { ContentSummary, ZoneDef } from '../../../shared/platform';

/**
 * 게임 모듈 계약. 로비 레이어(Room)는 이 인터페이스만 알고, 장르별 개념은 모듈 내부에만 존재한다.
 * 새 장르를 추가하려면 GameModuleDefinition 을 구현해 registry 에 등록하고
 * 클라이언트 쪽 modules/registry 에 UI 컴포넌트를 등록하면 된다.
 */

export interface ParticipantInfo {
  userId: string;
  nickname: string;
  connected: boolean;
  /** 재접속 유예 시간이 지나 부재 처리됨 */
  absent: boolean;
}

export class GameError extends Error {}

export interface GameHost {
  now(): number;
  participants(): ParticipantInfo[];
  /** 뷰가 바뀌었음을 알림 → 로비 레이어가 각 클라이언트에 viewFor() 결과를 전송 */
  pushState(): void;
  /** 일회성 연출 이벤트 */
  emit(target: string[] | 'all', type: string, payload?: unknown): void;
  /** 채팅 로그에 시스템 메시지 추가 (게임 내 알림) */
  systemMessage(text: string, audience?: string[] | 'all'): void;
  toast(target: string[] | 'all', text: string, tone?: 'info' | 'warn' | 'error'): void;
  /** 격리 구역 목록 교체 (null = 맵 기본 구역) */
  setZones(zones: ZoneDef[] | null): void;
  /** 구역 격리 on/off */
  setZonesOpen(open: boolean): void;
  setBadge(userId: string, label: string | null): void;
  endGame(): void;
  markDirty(): void;
}

export interface GameSession {
  onAction(userId: string, type: string, payload: unknown): unknown;
  viewFor(userId: string): unknown;
  tick(now: number): void;
  onParticipantConnection(userId: string, connected: boolean): void;
  onParticipantAbsent(userId: string): void;
  snapshot(): unknown;
  dispose?(): void;
}

export interface GameModuleDefinition {
  id: string;
  name: string;
  description: string;
  listContents(): ContentSummary[];
  getContent(contentId: string): ContentSummary | null;
  createSession(host: GameHost, contentId: string, participants: string[]): GameSession;
  restoreSession(host: GameHost, snapshot: unknown, timeShiftMs: number): GameSession;
}
