import type { BattleResult, CBPhase, Pos, Side, SlotResult } from './types';

/**
 * 서버 → 클라이언트 카드 대전 뷰 (기준서 5번, 5-1).
 *
 * 규칙은 하나다: **아직 공개되지 않은 것은 여기에 담기지 않는다.**
 * 화면에서 숨기는 방식은 개발자 도구로 뚫리므로, 애초에 내려보내지 않는다.
 *
 * - 상대가 제출한 3장은 슬롯이 열릴 때 그 슬롯만 `revealed` 에 실린다.
 * - 캐릭터 선택 중에는 상대의 선택이 `characterId: null` 로 나간다.
 * - 관전자는 `me` 가 null 이고, 양쪽 누구의 미공개 패도 받지 못한다.
 */

export interface CBPublicPlayer {
  side: Side;
  /** AI 면 null */
  userId: string | null;
  nickname: string;
  connected: boolean;
  absent: boolean;
  /** 아직 공개 전이면 null */
  characterId: string | null;
  charLocked: boolean;
  /** 서버가 랜덤 배정했는가 (공개 후에만 의미 있음) */
  charAuto: boolean;
  hp: number;
  maxHp: number;
  en: number;
  maxEn: number;
  pos: Pos;
  /** 이번 턴 제출 완료 여부**만**. 무엇을 냈는지는 공개 전까지 담지 않는다. */
  submitted: boolean;
}

export interface CBMeView {
  side: Side;
  /** 내 손패 14장 */
  hand: readonly string[];
  /** 내가 낸 3장 — 안 냈으면 null */
  submission: readonly string[] | null;
  /** 지금 기력으로 첫 장에 낼 수 있는 카드 (회색·자물쇠 표시용) */
  affordable: readonly string[];
}

export interface CBView {
  moduleId: string;
  contentId: string;
  phase: CBPhase;
  turn: number;
  turnLimit: number;
  /** 현재 단계 마감 시각 (epoch ms). 마감이 없으면 0. */
  deadline: number;
  serverNow: number;
  p1: CBPublicPlayer;
  p2: CBPublicPlayer;
  /** 관전자면 null */
  me: CBMeView | null;
  spectator: boolean;
  /** 지금까지 열린 슬롯만. 아직 안 열린 슬롯은 들어 있지 않다. */
  revealed: readonly SlotResult[];
  result: BattleResult | null;
}
