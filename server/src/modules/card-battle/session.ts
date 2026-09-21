import {
  CARD_SELECT_MS,
  CB_CONTENT_SOLO,
  CB_MODULE_ID,
  CHAR_SELECT_MS,
  OTHER,
  TURN_LIMIT,
  type BattleState,
  type PlayerState,
  type Side,
} from '../../../../shared/cb/types';
import { aiContext } from './ai/context';
import { normalPick } from './ai/normalAI';
import { hardPick } from './ai/hardAI';
import type { CBCardInfo, CBCharacterInfo, CBMeView, CBPublicPlayer, CBView } from '../../../../shared/cb/view';
import { GameError, type GameHost, type GameSession, type ParticipantInfo } from '../../platform/gameModule';
import { CHARACTERS, CHARACTER_IDS, getCharacter } from './data/characters';
import { getCard, handIdsFor } from './data/cards';
import { createBattle, maxEnOf, maxHpOf, playerOf, randInt } from './engine/battleState';
import {
  autoAssignCharacters,
  beginSelecting,
  bothCharsLocked,
  chooseCharacter,
  revealCharacters,
} from './engine/characterSelect';
import {
  SIDES,
  advanceAfterTurn,
  applySelectTimeout,
  bothSubmitted,
  randomSubmission,
  resolveTurn,
  submitCards,
  validateSubmission,
} from './engine/turnResolver';
import { forfeit } from './engine/winResolver';

/**
 * 카드 대전 세션 — 플랫폼과의 접점 두 곳 중 하나 (기준서 12.5).
 *
 * 여기서만 GameHost / GameSession 을 안다. engine/ 과 data/ 는 플랫폼을 모른다.
 * 서버가 상태의 권위자이고, 클라이언트가 보낸 값은 전부 여기서 다시 검증한다.
 */

/** 대치 연출 — 두 캐릭터가 동시에 공개된 뒤 첫 선택까지 */
const CHAR_REVEAL_MS = 2200;
/** 슬롯 한 장이 열리고 다음 장이 열릴 때까지 */
const SLOT_REVEAL_MS = 1500;

export type CBDifficulty = 'normal' | 'hard';

export interface CBSnapshot {
  battle: BattleState;
  contentId: string;
  /** 다음 연출 진행 시각 */
  stepAt: number;
  ended: boolean;
  /** 이미 공개된 카드들 — AI 가 상대의 과거 패턴을 읽는 데 쓴다 (기준서 10번) */
  history: { p1: string[]; p2: string[] };
  difficulty: CBDifficulty;
}

export type CBSessionInit =
  | { participants: readonly string[]; contentId: string }
  | { snapshot: CBSnapshot; shift: number };

export class CardBattleSession implements GameSession {
  readonly st: BattleState;
  readonly contentId: string;
  private stepAt = 0;
  private ended = false;
  private history: { p1: string[]; p2: string[] } = { p1: [], p2: [] };
  private difficulty: CBDifficulty = 'normal';

  constructor(private host: GameHost, init: CBSessionInit) {
    if ('snapshot' in init) {
      const s = init.snapshot;
      this.st = s.battle;
      this.contentId = s.contentId;
      this.ended = s.ended;
      this.stepAt = s.stepAt + init.shift;
      this.history = s.history ?? { p1: [], p2: [] };
      this.difficulty = s.difficulty ?? 'normal';
      this.applyTimeShift(init.shift);
      return;
    }

    this.contentId = init.contentId;
    const solo = init.participants.length === 1;
    const now = host.now();
    this.st = createBattle({
      p1UserId: init.participants[0] ?? null,
      p2UserId: solo ? null : (init.participants[1] ?? null),
      now,
      seed: (now ^ 0x5bf03635) >>> 0,
    });

    // AI 는 캐릭터 선택 단계에서 즉시 고른다. 사람 쪽 30초는 그대로 돈다 (기준서 2-1).
    if (solo) {
      const ai = this.st.p2;
      ai.characterId = CHARACTER_IDS[randInt(this.st, CHARACTER_IDS.length)];
      ai.charLocked = true;
      ai.charAuto = true;
    }
    host.systemMessage('카드 대전이 시작되었습니다. 8명 중 한 명을 고르세요. (30초)');
  }

  /**
   * 서버 재시작 복구 시 타이머 보정 (기준서 11-2).
   * 기본은 마감을 다운타임만큼 미는 것이고,
   * 다운타임이 그 단계의 제한 시간보다 길면 남은 몇 초로 고르라고 하는 셈이 되므로 단계를 처음부터 다시 준다.
   * 이 경우 자동 선택 연속 횟수는 올리지 않는다 — 서버 잘못이지 플레이어 잘못이 아니다.
   */
  private applyTimeShift(shift: number): void {
    const limit = this.st.phase === 'charSelect' ? CHAR_SELECT_MS : this.st.phase === 'selecting' ? CARD_SELECT_MS : 0;
    if (limit <= 0 || this.st.deadline <= 0) return;
    this.st.deadline = shift > limit ? this.host.now() + limit : this.st.deadline + shift;
  }

  /* ── 참가자 ─────────────────────────────────────── */

  private sideOf(userId: string): Side | null {
    if (this.st.p1.userId === userId) return 'p1';
    if (this.st.p2.userId === userId) return 'p2';
    return null;
  }

  private infoOf(userId: string | null): ParticipantInfo | null {
    if (!userId) return null;
    return this.host.participants().find((p) => p.userId === userId) ?? null;
  }

  private push(): void {
    this.host.markDirty();
    this.host.pushState();
  }

  /**
   * 엔진 함수가 상태를 바꾼 뒤의 phase 확인용.
   * `this.st.phase === 'finished'` 를 직접 쓰면 TS 가 호출 전의 좁힌 타입을 유지해
   * "겹치지 않는 비교"로 잘못 판단한다. 함수를 거치면 그 좁힘이 풀린다.
   */
  private isFinished(): boolean {
    return this.st.phase === 'finished';
  }

  /* ── 액션 ──────────────────────────────────────── */

  onAction(userId: string, type: string, payload: unknown): unknown {
    const side = this.sideOf(userId);
    if (!side) throw new GameError('관전자는 행동할 수 없습니다');
    const body = (payload ?? {}) as Record<string, unknown>;

    if (type === 'chooseChar') {
      const characterId = body.characterId;
      if (typeof characterId !== 'string') throw new GameError('캐릭터를 고르세요');
      try {
        chooseCharacter(this.st, side, characterId);
      } catch (e) {
        throw new GameError((e as Error).message);
      }
      this.host.systemMessage(`${this.nameOf(side)}님이 캐릭터를 확정했습니다.`);
      if (bothCharsLocked(this.st)) this.startReveal();
      this.push();
      return { ok: true };
    }

    if (type === 'submit') {
      const raw = body.cardIds;
      if (!Array.isArray(raw) || raw.some((c) => typeof c !== 'string')) throw new GameError('카드 3장을 고르세요');
      const cardIds = raw as string[];
      // 제출 시점에 한 번, 해결 시점에 다시 — 클라이언트가 보낸 값은 신뢰하지 않는다 (기준서 4번)
      const check = validateSubmission(this.st, side, cardIds);
      if (!check.ok) throw new GameError(check.reason ?? '제출을 받을 수 없습니다');
      submitCards(this.st, side, cardIds);
      if (bothSubmitted(this.st)) this.startResolve();
      this.push();
      return { ok: true };
    }

    if (type === 'setDifficulty') {
      if (this.contentId !== CB_CONTENT_SOLO) throw new GameError('AI 연습 판에서만 바꿀 수 있습니다');
      if (this.st.phase !== 'charSelect') throw new GameError('판이 시작되기 전에만 바꿀 수 있습니다');
      const level = body.level;
      if (level !== 'normal' && level !== 'hard') throw new GameError('알 수 없는 난이도입니다');
      this.difficulty = level;
      this.push();
      return { ok: true };
    }

    throw new GameError('알 수 없는 요청입니다');
  }

  private nameOf(side: Side): string {
    const p = playerOf(this.st, side);
    return this.infoOf(p.userId)?.nickname ?? (p.userId ? '참가자' : 'AI');
  }

  /* ── 진행 ──────────────────────────────────────── */

  private startReveal(): void {
    revealCharacters(this.st);
    this.stepAt = this.host.now() + CHAR_REVEAL_MS;
    const label = (s: Side) => getCharacter(playerOf(this.st, s).characterId!).label;
    this.host.systemMessage(`캐릭터 공개 — ${label('p1')} 대 ${label('p2')}`);
  }

  private startResolve(): void {
    resolveTurn(this.st);
    this.stepAt = this.host.now() + SLOT_REVEAL_MS;
  }

  /**
   * AI 쪽 카드를 채운다. AI 는 자동 선택 3연속 패배 규칙의 대상이 아니다.
   * AI 에게 넘기는 입력에는 상대의 이번 턴 제출이 아예 들어 있지 않다 (ai/context.ts).
   * AI 가 낸 조합도 사람 것과 똑같이 검증한다 — 통과 못 하면 랜덤으로 떨어뜨린다.
   */
  private fillAI(): void {
    if (this.st.phase !== 'selecting') return;
    for (const side of SIDES) {
      const p = playerOf(this.st, side);
      if (p.userId !== null || p.submission) continue;
      const ctx = aiContext(this.st, side, this.history[OTHER[side]]);
      const pick = this.difficulty === 'hard' ? hardPick(ctx) : normalPick(ctx);
      const check = validateSubmission(this.st, side, pick);
      p.submission = check.ok ? pick : randomSubmission(this.st, side);
      p.submissionAuto = true;
    }
  }

  /** 세 슬롯이 다 열린 뒤, 그 턴의 카드를 공개 이력에 쌓는다 */
  private recordHistory(): void {
    const rv = this.st.reveal;
    if (!rv) return;
    for (const r of rv.results) {
      this.history.p1.push(r.cards.p1);
      this.history.p2.push(r.cards.p2);
    }
  }

  tick(now: number): void {
    if (this.ended) return;

    // 공개 중이면 그것부터 — phase 가 이미 finished 여도 남은 슬롯은 다 보여준다
    if (this.st.reveal) {
      if (now < this.stepAt) return;
      const rv = this.st.reveal;
      if (rv.slot + 1 < rv.results.length) {
        rv.slot++;
        this.stepAt = now + SLOT_REVEAL_MS;
        this.push();
        return;
      }
      this.recordHistory();
      if (this.isFinished()) { this.finish(); return; }
      advanceAfterTurn(this.st, now);
      if (this.isFinished()) { this.finish(); return; }
      this.fillAI();
      this.push();
      return;
    }

    switch (this.st.phase) {
      case 'charSelect':
        if (now >= this.st.deadline) {
          const missed = !this.st.p1.charLocked || !this.st.p2.charLocked;
          autoAssignCharacters(this.st);
          if (missed) this.host.systemMessage('시간이 다 되어 서버가 캐릭터를 배정했습니다.');
          this.startReveal();
          this.push();
        }
        break;

      case 'charReveal':
        if (now >= this.stepAt) {
          beginSelecting(this.st, now);
          this.fillAI();
          this.push();
        }
        break;

      case 'selecting':
        if (now >= this.st.deadline) {
          applySelectTimeout(this.st);
          if (this.isFinished()) { this.finish(); return; }
          this.host.systemMessage('시간이 다 되어 서버가 카드를 골랐습니다.');
          this.startResolve();
          this.push();
        }
        break;

      case 'finished':
        this.finish();
        break;

      default:
        break;
    }
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    const r = this.st.result;
    if (r) {
      const why = r.reason === 'hp' ? '체력 소진'
        : r.reason === 'turnLimit' ? `${TURN_LIMIT}턴 종료 — 체력 비율 판정`
        : r.reason === 'autoPick' ? '자동 선택 3연속'
        : '기권';
      const who = r.winner === 'draw' ? '무승부' : `${this.nameOf(r.winner)}님 승리`;
      this.host.systemMessage(`${who} (${why})`);
    }
    this.push();
    this.host.endGame();
  }

  onParticipantConnection(_userId: string, _connected: boolean): void {
    this.push();
  }

  /** 자발 퇴장은 즉시, 연결 끊김은 유예 2분 후 (기준서 7-1 ③) */
  onParticipantAbsent(userId: string): void {
    const side = this.sideOf(userId);
    if (!side || this.ended) return;
    forfeit(this.st, side);
    this.host.systemMessage(`${this.nameOf(side)}님이 자리를 떠나 기권 처리되었습니다.`);
    this.finish();
  }

  /* ── 뷰 ────────────────────────────────────────── */

  private publicOf(p: PlayerState, viewer: Side | null): CBPublicPlayer {
    // 캐릭터는 둘 다 확정된 뒤에야 공개된다. 그 전에는 자기 것만 보인다.
    const shown = this.st.phase !== 'charSelect' || viewer === p.side;
    const info = this.infoOf(p.userId);
    return {
      side: p.side,
      userId: p.userId,
      nickname: info?.nickname ?? (p.userId ? '참가자' : 'AI'),
      connected: info ? info.connected : true,
      absent: info ? info.absent : false,
      characterId: shown ? p.characterId : null,
      charLocked: p.charLocked,
      charAuto: shown ? p.charAuto : false,
      hp: p.hp,
      maxHp: maxHpOf(p),
      en: p.en,
      maxEn: maxEnOf(p),
      pos: { ...p.pos },
      submitted: p.submission !== null,
    };
  }

  private meOf(viewer: Side): CBMeView {
    const p = playerOf(this.st, viewer);
    const hand = p.characterId ? handIdsFor(p.characterId) : [];
    return {
      side: viewer,
      hand,
      submission: p.submission ? [...p.submission] : null,
      affordable: hand.filter((id) => getCard(id).energyCost <= p.en),
    };
  }

  /**
   * 이 뷰가 그려야 할 카드들 — **딱 필요한 만큼만.**
   *
   * 내 손패와, 이미 열린 슬롯에 실제로 나온 카드뿐이다.
   * 상대 캐릭터의 기술 네 장을 통째로 실어 보내면 "무엇을 낼 수 있는가"가 아니라
   * 페이로드 검사가 무뎌진다 — 아직 안 열린 슬롯의 카드 id 가 목록에 섞여 있으면
   * 실제 누설과 구분할 수 없어진다. 좁게 보내야 누설 검사가 의미를 갖는다.
   */
  private cardsFor(viewer: Side | null): CBCardInfo[] {
    const ids = new Set<string>();
    if (viewer) for (const id of this.meOf(viewer).hand) ids.add(id);
    const rv = this.st.reveal;
    if (rv) {
      for (const r of rv.results.slice(0, rv.slot + 1)) {
        ids.add(r.cards.p1);
        ids.add(r.cards.p2);
      }
    }
    return [...ids].map((id) => cardInfo(id));
  }

  /** 8명 명단은 캐릭터 선택 단계에서만 보낸다. 그 뒤로는 쓸 데가 없어 payload 만 늘린다. */
  private rosterFor(): CBCharacterInfo[] {
    if (this.st.phase !== 'charSelect' && this.st.phase !== 'charReveal') return [];
    return CHARACTERS.map((c) => ({
      id: c.id,
      label: c.label,
      maxHp: c.maxHp,
      maxEn: c.maxEn,
      note: c.note,
      skills: c.skillIds.map((id) => cardInfo(id)),
    }));
  }

  viewFor(userId: string): CBView {
    const viewer = this.sideOf(userId);
    const rv = this.st.reveal;
    return {
      moduleId: CB_MODULE_ID,
      contentId: this.contentId,
      phase: this.st.phase,
      turn: this.st.turn,
      turnLimit: TURN_LIMIT,
      deadline: this.st.deadline,
      serverNow: this.host.now(),
      p1: this.publicOf(this.st.p1, viewer),
      p2: this.publicOf(this.st.p2, viewer),
      // 관전자에게는 어느 쪽 패도 담지 않는다 — 플레이어 뷰에서 빼는 게 아니라 아예 만들지 않는다 (기준서 5-1)
      me: viewer ? this.meOf(viewer) : null,
      spectator: viewer === null,
      // 열린 슬롯까지만. 아직 안 열린 슬롯의 카드 id 는 여기 실리지 않는다.
      revealed: rv ? rv.results.slice(0, rv.slot + 1) : [],
      result: this.st.result,
      cards: this.cardsFor(viewer),
      roster: this.rosterFor(),
      solo: this.contentId === CB_CONTENT_SOLO,
      difficulty: this.difficulty,
    };
  }

  snapshot(): CBSnapshot {
    return {
      battle: this.st,
      contentId: this.contentId,
      stepAt: this.stepAt,
      ended: this.ended,
      history: this.history,
      difficulty: this.difficulty,
    };
  }
}

function cardInfo(id: string): CBCardInfo {
  const c = getCard(id);
  return { id, type: c.type, energyCost: c.energyCost, damage: c.damage, range: c.rangePattern, move: c.move };
}
