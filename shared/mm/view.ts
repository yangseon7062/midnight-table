import type { CommonBlock } from './scenario';

/** 서버 → 클라이언트 머더미스터리 뷰 (플레이어별로 필터링된 상태) */

export type MMStage = 'casting' | 'flow' | 'ending';

export interface MMPersonPublic {
  id: string;
  name: string;
  title: string;
  age: string;
  publicIntro: string;
  color: string;
  portrait: string | null;
  isCharacter: boolean;
  required: boolean;
  canVote: boolean;
  takenBy: string | null;
  takenByName: string | null;
}

export interface MMItemView {
  key: string;
  kind: 'sheet' | 'common' | 'clue';
  refId: string;
  stepIndex: number;
  at: number;
  opened: boolean;
  title: string;
  sheet?: { body: string };
  common?: { blocks: CommonBlock[] };
  clue?: { type: 'text' | 'image'; text: string; image: string | null; caption: string; scope: 'public' | 'private' };
}

export interface MMCardView { id: string; name: string; description: string; uses: number; usesLeft: number }

export interface MMLogEntry { at: number; kind: 'step' | 'card' | 'extend' | 'vote' | 'system'; text: string; charId?: string }

export interface MMStepView {
  index: number;
  total: number;
  id: string;
  type: 'reveal' | 'phase';
  kind: 'discussion' | 'interrogation' | 'vote' | null;
  title: string;
  note: string;
  advance: 'allReady' | 'timer' | 'either' | 'immediate';
  startedAt: number;
  endsAt: number | null;
  durationSec: number;
  extendSec: number;
  zonesOpen: boolean;
  /** 이 단계에서 내가 받은 항목 키 */
  myItemKeys: string[];
  /** 진행 조건이 충족되어 곧 다음 단계로 넘어가는 시각 */
  advanceAt: number | null;
  vote: { question: string; candidates: string[] } | null;
}

export interface MMParticipantView {
  userId: string;
  nickname: string;
  charId: string | null;
  connected: boolean;
  absent: boolean;
  ready: boolean;
}

export interface MMVoteView {
  stepId: string;
  eligible: boolean;
  myChoice: string | null;
  confirmed: boolean;
  confirmedCount: number;
  eligibleCount: number;
}

export interface MMEndingView {
  hasVote: boolean;
  question: string;
  anonymous: boolean;
  tally: { candidateId: string; count: number; voters: string[] | null }[];
  topIds: string[];
  culpritIds: string[];
  outcome: 'success' | 'failure' | 'novote';
  truth: { title: string; body: string };
  result: { title: string; body: string };
  characterEndings: { charId: string; text: string }[];
  leaving: string[];
}

export interface MMView {
  moduleId: 'murder-mystery';
  serverNow: number;
  scenario: { id: string; title: string; subtitle: string; summary: string; cover: string | null; minPlayers: number; maxPlayers: number; playtimeMin: number; voteVisibility: 'anonymous' | 'public' };
  stage: MMStage;
  me: { userId: string; charId: string | null; participant: boolean };
  participants: MMParticipantView[];
  people: MMPersonPublic[];
  casting: { startsAt: number | null; ready: string[] } | null;
  outline: { index: number; title: string; type: 'reveal' | 'phase'; kind: string | null }[];
  step: MMStepView | null;
  items: MMItemView[];
  cards: MMCardView[];
  log: MMLogEntry[];
  extend: { cooldownUntil: number; lastBy: string | null };
  vote: MMVoteView | null;
  ending: MMEndingView | null;
}

export type MMEvent =
  | { type: 'step'; payload: { index: number; title: string; stepType: 'reveal' | 'phase'; kind: string | null; received: number } }
  | { type: 'card'; payload: { charId: string; cardId: string; cardName: string; description: string; usesLeft: number; by: string } }
  | { type: 'extend'; payload: { by: string; sec: number } }
  | { type: 'voteConfirm'; payload: { charId: string } }
  | { type: 'ending'; payload: {} }
  | { type: 'castStart'; payload: { startsAt: number } };

export const MM_MODULE_ID = 'murder-mystery';
export const EXTEND_COOLDOWN_MS = 10_000;
