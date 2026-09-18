import type { GameHost, GameSession } from '../../platform/gameModule';
import { GameError } from '../../platform/gameModule';
import type { Scenario, Step, Character } from '../../../../shared/mm/scenario';
import type { MMView, MMItemView, MMLogEntry, MMStage, MMEndingView, MMPersonPublic, MMPresentationView } from '../../../../shared/mm/view';
import { EXTEND_COOLDOWN_MS, MM_MODULE_ID } from '../../../../shared/mm/view';
import { clampStr } from '../../platform/util';

interface Received { key: string; kind: 'sheet' | 'common' | 'clue'; refId: string; stepIndex: number; at: number; opened: boolean }
interface VoteRecord { choice: string | null; confirmed: boolean }
/** 테이블에 펼쳐 둔 자료 (한 방에 하나) */
interface Presentation { key: string; kind: 'sheet' | 'common' | 'clue'; refId: string; by: string; charId: string | null; at: number; wasPrivate: boolean }

export interface MMState {
  version: 1;
  scenario: Scenario;
  participants: string[];
  stage: MMStage;
  picks: Record<string, string>;
  castReady: string[];
  castStartsAt: number | null;
  stepIndex: number;
  stepStartedAt: number;
  stepEndsAt: number | null;
  advanceAt: number | null;
  ready: string[];
  received: Record<string, Received[]>;
  cards: Record<string, Record<string, number>>;
  votes: Record<string, Record<string, VoteRecord>>;
  extendCooldownUntil: number;
  extendLastBy: string | null;
  log: MMLogEntry[];
  ending: MMEndingView | null;
  endingAt: number | null;
  presentation?: Presentation | null;
}

const CAST_COUNTDOWN_MS = 3500;
const ALL_READY_BEAT_MS = 1600;
const ENDING_AUTO_CLOSE_MS = 45 * 60_000;

export class MurderMysterySession implements GameSession {
  st: MMState;

  constructor(private host: GameHost, init: { scenario: Scenario; participants: string[] } | { state: MMState; shift: number }) {
    if ('state' in init) {
      const s = init.state;
      const sh = (v: number | null) => (v == null ? v : v + init.shift);
      s.castStartsAt = sh(s.castStartsAt); s.stepStartedAt = sh(s.stepStartedAt)!; s.stepEndsAt = sh(s.stepEndsAt);
      s.advanceAt = sh(s.advanceAt); s.extendCooldownUntil = sh(s.extendCooldownUntil)!; s.endingAt = sh(s.endingAt);
      if (s.presentation) s.presentation.at = sh(s.presentation.at)!;
      this.st = s;
    } else {
      this.st = {
        version: 1, scenario: structuredClone(init.scenario), participants: [...init.participants], stage: 'casting',
        picks: {}, castReady: [], castStartsAt: null, stepIndex: -1, stepStartedAt: 0, stepEndsAt: null, advanceAt: null, ready: [],
        received: {}, cards: {}, votes: {}, extendCooldownUntil: 0, extendLastBy: null, log: [], ending: null, endingAt: null, presentation: null,
      };
      this.host.setZones(this.sc.zones.length ? this.sc.zones : null);
      this.host.setZonesOpen(true);
      this.host.systemMessage(`「${this.sc.title}」 — 테이블 위에 놓인 인물 카드 중 맡을 캐릭터를 골라 주세요.`);
      this.host.pushState();
    }
  }

  get sc() { return this.st.scenario; }
  private now() { return this.host.now(); }
  private charOf(uid: string) { return this.st.picks[uid] ?? null; }
  private userOfChar(charId: string) { return Object.keys(this.st.picks).find((u) => this.st.picks[u] === charId) ?? null; }
  private character(id: string) { return this.sc.characters.find((c) => c.id === id) ?? null; }
  private personName(id: string) { return this.character(id)?.name ?? this.sc.suspects.find((s) => s.id === id)?.name ?? id; }
  private step(): Step | null { return this.sc.flow[this.st.stepIndex] ?? null; }
  private info(uid: string) { return this.host.participants().find((p) => p.userId === uid); }
  private isParticipant(uid: string) { return this.st.participants.includes(uid); }
  private addLog(kind: MMLogEntry['kind'], text: string, charId?: string) {
    this.st.log.push({ at: this.now(), kind, text, charId });
    if (this.st.log.length > 300) this.st.log.shift();
  }

  // ── 액션 ────────────────────────────────────────────
  onAction(uid: string, type: string, payload: unknown): unknown {
    if (!this.isParticipant(uid)) throw new GameError('관전 중에는 조작할 수 없습니다');
    const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
    switch (type) {
      case 'pick': return this.pick(uid, String(p.charId ?? ''));
      case 'unpick': return this.unpick(uid);
      case 'random': return this.randomize(uid);
      case 'castReady': return this.setCastReady(uid, !!p.ready);
      case 'open': return this.open(uid, String(p.key ?? ''));
      case 'ready': return this.setReady(uid, !!p.ready);
      case 'extend': return this.extend(uid);
      case 'useCard': return this.useCard(uid, String(p.cardId ?? ''), p.note);
      case 'present': return this.present(uid, String(p.key ?? ''), !!p.confirm);
      case 'unpresent': return this.unpresent(uid);
      case 'vote': return this.vote(uid, String(p.candidateId ?? ''));
      case 'voteConfirm': return this.voteConfirm(uid, !!p.confirmed);
      case 'leave': return this.leaveEnding(uid);
      default: throw new GameError('알 수 없는 동작입니다');
    }
  }

  private requireStage(s: MMStage) { if (this.st.stage !== s) throw new GameError('지금은 할 수 없는 동작입니다'); }

  private pick(uid: string, charId: string) {
    this.requireStage('casting');
    const c = this.character(charId);
    if (!c) throw new GameError('캐릭터를 찾을 수 없습니다');
    const owner = this.userOfChar(charId);
    if (owner && owner !== uid) throw new GameError(`이미 ${this.info(owner)?.nickname ?? '다른 참가자'}님이 고른 캐릭터입니다`);
    this.st.picks[uid] = charId;
    this.st.castReady = this.st.castReady.filter((x) => x !== uid);
    this.evaluateCasting();
    this.host.pushState();
  }

  private unpick(uid: string) {
    this.requireStage('casting');
    delete this.st.picks[uid];
    this.st.castReady = this.st.castReady.filter((x) => x !== uid);
    this.evaluateCasting();
    this.host.pushState();
  }

  private randomize(uid: string) {
    this.requireStage('casting');
    const unpicked = this.st.participants.filter((u) => !this.st.picks[u]);
    if (!unpicked.length) throw new GameError('모두 캐릭터를 골랐습니다');
    const taken = new Set(Object.values(this.st.picks));
    const free = this.sc.characters.filter((c) => !taken.has(c.id));
    const shuffle = <T,>(a: T[]) => a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
    const ordered = [...shuffle(free.filter((c) => c.required)), ...shuffle(free.filter((c) => !c.required))];
    shuffle(unpicked).forEach((u, i) => { if (ordered[i]) this.st.picks[u] = ordered[i].id; });
    this.host.systemMessage(`${this.info(uid)?.nickname}님이 남은 캐릭터를 무작위로 배정했습니다.`, this.st.participants);
    this.evaluateCasting();
    this.host.pushState();
  }

  private setCastReady(uid: string, ready: boolean) {
    this.requireStage('casting');
    if (ready && !this.st.picks[uid]) throw new GameError('먼저 캐릭터를 골라 주세요');
    const set = new Set(this.st.castReady);
    ready ? set.add(uid) : set.delete(uid);
    this.st.castReady = [...set];
    this.evaluateCasting();
    this.host.pushState();
  }

  private castingComplete() {
    const infos = this.host.participants();
    const allPicked = this.st.participants.every((u) => this.st.picks[u]);
    const taken = new Set(Object.values(this.st.picks));
    const requiredOk = this.sc.characters.filter((c) => c.required).every((c) => taken.has(c.id));
    const allReady = this.st.participants.every((u) => this.st.castReady.includes(u) || infos.find((i) => i.userId === u)?.absent);
    return allPicked && requiredOk && allReady && infos.some((i) => i.connected);
  }

  private evaluateCasting() {
    const ok = this.castingComplete();
    if (ok && !this.st.castStartsAt) {
      this.st.castStartsAt = this.now() + CAST_COUNTDOWN_MS;
      this.host.emit(this.st.participants, 'castStart', { startsAt: this.st.castStartsAt });
    } else if (!ok) this.st.castStartsAt = null;
  }

  private beginFlow() {
    this.st.stage = 'flow';
    for (const uid of this.st.participants) {
      const c = this.character(this.st.picks[uid]);
      if (!c) continue;
      this.host.setBadge(uid, c.name);
      this.st.cards[c.id] = Object.fromEntries(c.cards.map((card) => [card.id, card.uses]));
      this.st.received[c.id] = [];
    }
    const cast = this.st.participants.map((u) => `${this.info(u)?.nickname} → ${this.personName(this.st.picks[u])}`).join(', ');
    this.host.systemMessage(`🎭 배역이 정해졌습니다: ${cast}`);
    this.addLog('system', `배역: ${cast}`);
    this.enterStep(0);
  }

  private enterStep(i: number) {
    if (i >= this.sc.flow.length) return this.finish();
    const step = this.sc.flow[i];
    const now = this.now();
    this.st.stepIndex = i;
    this.st.stepStartedAt = now;
    this.st.stepEndsAt = step.durationSec > 0 ? now + step.durationSec * 1000 : null;
    this.st.advanceAt = null;
    this.st.ready = [];
    this.st.presentation = null;
    this.host.setZonesOpen(step.zonesOpen);
    const receivedCount: Record<string, number> = {};
    if (step.type === 'reveal') {
      const assigned = new Set(Object.values(this.st.picks));
      const targets = step.targets === 'all' ? [...assigned] : step.targets.filter((t) => assigned.has(t));
      for (const item of step.items) {
        for (const charId of this.recipients(item.kind, item.refId, targets)) {
          const key = `${item.kind}:${item.refId}`;
          const list = (this.st.received[charId] ??= []);
          if (list.some((r) => r.key === key)) continue;
          list.push({ key, kind: item.kind, refId: item.refId, stepIndex: i, at: now, opened: false });
          receivedCount[charId] = (receivedCount[charId] ?? 0) + 1;
        }
      }
      if (step.advance === 'immediate') this.st.advanceAt = now + 600;
    } else if (step.kind === 'vote') {
      this.st.votes[step.id] ??= {};
    }
    this.addLog('step', `${i + 1}. ${step.title}`);
    this.host.systemMessage(`━ ${i + 1}/${this.sc.flow.length} · ${step.title} ━`);
    for (const uid of this.st.participants) {
      const charId = this.st.picks[uid];
      this.host.emit([uid], 'step', { index: i, title: step.title, stepType: step.type, kind: step.type === 'phase' ? step.kind : null, received: receivedCount[charId] ?? 0 });
    }
    this.host.pushState();
    this.host.markDirty();
  }

  /** 공개 대상(targets) ∩ 항목 열람 권한 = 실제 수신자. 비공개 정보가 새지 않도록 서버에서만 계산한다. */
  private recipients(kind: 'sheet' | 'common' | 'clue', refId: string, targets: string[]): string[] {
    if (kind === 'sheet') {
      const page = this.sc.sheetPages.find((p) => p.id === refId);
      return page && targets.includes(page.charId) ? [page.charId] : [];
    }
    if (kind === 'common') return this.sc.commonEntries.some((c) => c.id === refId) ? targets : [];
    const clue = this.sc.clues.find((c) => c.id === refId);
    if (!clue) return [];
    return clue.scope === 'public' ? targets : targets.filter((t) => clue.owners.includes(t));
  }

  private open(uid: string, key: string) {
    const charId = this.charOf(uid);
    const item = charId ? this.st.received[charId]?.find((r) => r.key === key) : null;
    if (!item) throw new GameError('받지 않은 자료입니다');
    if (!item.opened) {
      item.opened = true;
      this.host.pushState();
    }
  }

  private setReady(uid: string, ready: boolean) {
    this.requireStage('flow');
    const step = this.step();
    if (!step) throw new GameError('진행 단계가 없습니다');
    if (ready && step.type === 'reveal') {
      const charId = this.charOf(uid);
      const unopened = (charId ? this.st.received[charId] ?? [] : []).filter((r) => r.stepIndex === this.st.stepIndex && !r.opened);
      if (unopened.length) throw new GameError(`아직 열어보지 않은 자료가 ${unopened.length}개 있습니다`);
    }
    if (step.type === 'phase' && step.kind === 'vote' && this.character(this.charOf(uid) ?? '')?.canVote) throw new GameError('투표를 확정해 주세요');
    const set = new Set(this.st.ready);
    ready ? set.add(uid) : set.delete(uid);
    this.st.ready = [...set];
    this.host.pushState();
  }

  private extend(uid: string) {
    this.requireStage('flow');
    const step = this.step();
    if (!step || this.st.stepEndsAt == null) throw new GameError('이 단계에는 타이머가 없습니다');
    const now = this.now();
    if (now < this.st.extendCooldownUntil) throw new GameError(`${Math.ceil((this.st.extendCooldownUntil - now) / 1000)}초 뒤에 다시 연장할 수 있습니다`);
    this.st.stepEndsAt = Math.max(this.st.stepEndsAt, now) + step.extendSec * 1000;
    this.st.extendCooldownUntil = now + EXTEND_COOLDOWN_MS;
    this.st.extendLastBy = uid;
    if (step.advance === 'timer') this.st.advanceAt = null;
    const who = this.displayName(uid);
    const label = step.extendSec >= 60 ? `${Math.round(step.extendSec / 60 * 10) / 10}분` : `${step.extendSec}초`;
    this.addLog('extend', `${who} — 시간 ${label} 연장`);
    this.host.systemMessage(`⏳ ${who}이(가) 시간을 ${label} 연장했습니다.`);
    this.host.emit('all', 'extend', { by: who, sec: step.extendSec });
    this.host.pushState();
  }

  private displayName(uid: string) {
    const c = this.character(this.charOf(uid) ?? '');
    const nick = this.info(uid)?.nickname ?? '?';
    return c ? `${c.name}(${nick})` : nick;
  }

  private useCard(uid: string, cardId: string, noteRaw: unknown) {
    this.requireStage('flow');
    const charId = this.charOf(uid);
    const c = this.character(charId ?? '');
    const card = c?.cards.find((x) => x.id === cardId);
    if (!c || !card) throw new GameError('보유하지 않은 카드입니다');
    const left = this.st.cards[c.id]?.[card.id] ?? 0;
    if (left <= 0) throw new GameError('남은 사용 횟수가 없습니다');
    this.st.cards[c.id][card.id] = left - 1;
    const note = clampStr(noteRaw, 60);
    const text = `🃏 ${c.name}이(가) [${card.name}] 카드를 사용했습니다${note ? ` — “${note}”` : ''} (남은 횟수 ${left - 1}/${card.uses})`;
    this.addLog('card', text, c.id);
    this.host.systemMessage(text);
    this.host.emit('all', 'card', { charId: c.id, charName: c.name, cardId: card.id, cardName: card.name, description: card.description, usesLeft: left - 1, uses: card.uses, note, by: this.info(uid)?.nickname });
    this.host.pushState();
  }

  // ── 테이블에 펼치기 ────────────────────────────────
  // 말로만 설명하는 대신 자료를 모두의 화면에 동시에 띄운다.
  // 보이는 범위는 대화와 같은 규칙을 따른다 — 밀담 구역 안이면 그 구역 사람에게만.
  private present(uid: string, key: string, confirm: boolean) {
    this.requireStage('flow');
    const charId = this.charOf(uid);
    const mine = (charId ? this.st.received[charId] ?? [] : []).find((r) => r.key === key);
    if (!mine) throw new GameError('가지고 있지 않은 자료입니다');
    if (!mine.opened) throw new GameError('아직 열어보지 않은 자료입니다');
    const wasPrivate = this.isPrivate(mine.kind, mine.refId);
    // 비공개 자료를 펼치는 것은 되돌릴 수 없는 선택이라 한 번 더 확인받는다
    if (wasPrivate && !confirm) throw new GameError('비공개 자료입니다. 공개 확인이 필요합니다');
    this.st.presentation = { key, kind: mine.kind, refId: mine.refId, by: uid, charId, at: this.now(), wasPrivate };
    const name = charId ? this.personName(charId) : this.info(uid)?.nickname ?? '누군가';
    const title = this.describe(mine.kind, mine.refId).title;
    const text = `📂 ${name}이(가) 「${title}」을(를) 테이블에 펼쳤습니다${wasPrivate ? ' (비공개 자료 공개)' : ''}`;
    const audience = this.host.audienceOf(this.host.channelOf(uid));
    this.addLog('system', text, charId ?? undefined);
    this.host.systemMessage(text, audience);
    this.host.emit(audience, 'present', { byName: name, title, wasPrivate });
    this.host.pushState();
  }

  private unpresent(uid: string) {
    const pr = this.st.presentation;
    if (!pr) return;
    if (pr.by !== uid) throw new GameError('펼친 사람만 걷을 수 있습니다');
    this.st.presentation = null;
    this.host.pushState();
  }

  private isPrivate(kind: 'sheet' | 'common' | 'clue', refId: string) {
    if (kind === 'sheet') return true;               // 설정집은 본래 나만 보는 자료다
    if (kind === 'common') return false;             // 공용집은 모두가 이미 가진 자료다
    return this.sc.clues.find((c) => c.id === refId)?.scope === 'private';
  }

  /** 자료 한 건의 표시 내용 (가진 사람이 아니어도 펼쳐진 것은 볼 수 있어야 하므로 시나리오에서 바로 만든다) */
  private describe(kind: 'sheet' | 'common' | 'clue', refId: string): Pick<MMItemView, 'title' | 'sheet' | 'common' | 'clue'> {
    if (kind === 'sheet') { const p = this.sc.sheetPages.find((x) => x.id === refId); return { title: p?.title ?? '설정집', sheet: { body: p?.body ?? '' } }; }
    if (kind === 'common') { const c = this.sc.commonEntries.find((x) => x.id === refId); return { title: c?.title ?? '공용집', common: { blocks: c?.blocks ?? [] } }; }
    const c = this.sc.clues.find((x) => x.id === refId);
    return { title: c?.title ?? '단서', clue: { type: c?.type ?? 'text', text: c?.text ?? '', image: c?.image ?? null, caption: c?.caption ?? '', scope: c?.scope ?? 'public' } };
  }

  private currentVoteStep() {
    const step = this.step();
    if (this.st.stage !== 'flow' || !step || step.type !== 'phase' || step.kind !== 'vote' || !step.vote) throw new GameError('지금은 투표 단계가 아닙니다');
    return step;
  }

  private vote(uid: string, candidateId: string) {
    const step = this.currentVoteStep();
    const c = this.character(this.charOf(uid) ?? '');
    if (!c?.canVote) throw new GameError('이 캐릭터는 투표에 참여하지 않습니다');
    if (!step.vote!.candidates.includes(candidateId)) throw new GameError('후보가 아닙니다');
    const rec = (this.st.votes[step.id][c.id] ??= { choice: null, confirmed: false });
    if (rec.confirmed) throw new GameError('이미 확정했습니다. 확정을 취소한 뒤 바꿀 수 있습니다');
    rec.choice = candidateId;
    this.host.pushState();
  }

  private voteConfirm(uid: string, confirmed: boolean) {
    const step = this.currentVoteStep();
    const c = this.character(this.charOf(uid) ?? '');
    if (!c?.canVote) throw new GameError('이 캐릭터는 투표에 참여하지 않습니다');
    const rec = (this.st.votes[step.id][c.id] ??= { choice: null, confirmed: false });
    if (confirmed && !rec.choice) throw new GameError('먼저 지목할 사람을 골라 주세요');
    if (rec.confirmed === confirmed) return;
    rec.confirmed = confirmed;
    if (confirmed) {
      this.addLog('vote', `${c.name}이(가) 투표를 확정했습니다`, c.id);
      this.host.emit('all', 'voteConfirm', { charId: c.id, charName: c.name });
    }
    this.host.pushState();
  }

  private leaveEnding(uid: string) {
    this.requireStage('ending');
    const e = this.st.ending!;
    if (!e.leaving.includes(uid)) e.leaving.push(uid);
    this.host.pushState();
    this.checkEndingClose();
  }

  private checkEndingClose() {
    const infos = this.host.participants();
    const pending = infos.filter((i) => i.connected && !this.st.ending!.leaving.includes(i.userId));
    if (pending.length === 0) this.host.endGame();
  }

  // ── 진행 조건 ───────────────────────────────────────
  private allReady(step: Step): boolean {
    const infos = this.host.participants();
    return this.st.participants.every((uid) => {
      const inf = infos.find((i) => i.userId === uid);
      if (!inf || inf.absent) return true;
      const c = this.character(this.charOf(uid) ?? '');
      if (step.type === 'phase' && step.kind === 'vote' && c?.canVote) return !!this.st.votes[step.id]?.[c.id]?.confirmed;
      return this.st.ready.includes(uid);
    });
  }

  tick(now: number) {
    const infos = this.host.participants();
    const anyConnected = infos.some((i) => i.connected);
    if (this.st.stage === 'casting') {
      // 부재자는 자동 배정
      const absentUnpicked = infos.filter((i) => i.absent && !this.st.picks[i.userId]);
      if (absentUnpicked.length && anyConnected) {
        const taken = new Set(Object.values(this.st.picks));
        const free = this.sc.characters.filter((c) => !taken.has(c.id)).sort((a, b) => Number(b.required) - Number(a.required));
        absentUnpicked.forEach((i, idx) => { if (free[idx]) this.st.picks[i.userId] = free[idx].id; });
        this.evaluateCasting();
        this.host.pushState();
      }
      if (this.st.castStartsAt && now >= this.st.castStartsAt) {
        if (this.castingComplete()) this.beginFlow();
        else { this.st.castStartsAt = null; this.host.pushState(); }
      }
      return;
    }
    if (this.st.stage === 'flow') {
      const step = this.step();
      if (!step || !anyConnected) return;
      const timerDone = this.st.stepEndsAt != null && now >= this.st.stepEndsAt;
      let cond = false;
      let byTimer = false;
      switch (step.advance) {
        case 'immediate': cond = true; break;
        case 'timer': cond = timerDone; byTimer = true; break;
        case 'allReady': cond = this.allReady(step); break;
        case 'either': byTimer = timerDone; cond = timerDone || this.allReady(step); break;
      }
      if (this.st.advanceAt != null) {
        if (!cond) { this.st.advanceAt = null; this.host.pushState(); }
        else if (now >= this.st.advanceAt) this.enterStep(this.st.stepIndex + 1);
      } else if (cond) {
        this.st.advanceAt = now + (byTimer ? 1200 : ALL_READY_BEAT_MS);
        if (byTimer) this.host.systemMessage(`⌛ '${step.title}' 제한시간이 끝나 다음 단계로 넘어갑니다.`);
        this.host.pushState();
      }
      return;
    }
    if (this.st.stage === 'ending' && this.st.endingAt && now - this.st.endingAt > ENDING_AUTO_CLOSE_MS) this.host.endGame();
  }

  private finish() {
    const sc = this.sc;
    const voteSteps = sc.flow.filter((s) => s.type === 'phase' && s.kind === 'vote' && s.vote);
    const vs = (sc.ending.voteStepId ? voteSteps.find((s) => s.id === sc.ending.voteStepId) : voteSteps[voteSteps.length - 1]) as Extract<Step, { type: 'phase' }> | undefined;
    const anonymous = sc.settings.voteVisibility === 'anonymous';
    let ending: MMEndingView;
    if (vs?.vote) {
      const votes = this.st.votes[vs.id] ?? {};
      const tally = vs.vote.candidates.map((cand) => {
        const voters = Object.entries(votes).filter(([, r]) => r.choice === cand).map(([charId]) => charId);
        return { candidateId: cand, count: voters.length, voters: anonymous ? null : voters };
      });
      const max = Math.max(0, ...tally.map((t) => t.count));
      const topIds = max > 0 ? tally.filter((t) => t.count === max).map((t) => t.candidateId) : [];
      const success = topIds.length === 1 && sc.ending.culpritIds.includes(topIds[0]);
      ending = {
        hasVote: true, question: vs.vote.question, anonymous, tally, topIds, culpritIds: sc.ending.culpritIds,
        outcome: success ? 'success' : 'failure', truth: sc.ending.truth, result: success ? sc.ending.success : sc.ending.failure,
        characterEndings: this.endingTexts(success), leaving: [],
      };
    } else {
      ending = {
        hasVote: false, question: '', anonymous, tally: [], topIds: [], culpritIds: sc.ending.culpritIds, outcome: 'novote',
        truth: sc.ending.truth, result: sc.ending.success, characterEndings: this.endingTexts(true), leaving: [],
      };
    }
    this.st.stage = 'ending';
    this.st.ending = ending;
    this.st.endingAt = this.now();
    this.st.advanceAt = null;
    this.host.setZonesOpen(false);
    this.addLog('system', `엔딩 — ${ending.result.title}`);
    this.host.systemMessage(`🔔 모든 진행이 끝났습니다. 투표 결과와 사건의 진상이 공개됩니다.`);
    this.host.emit('all', 'ending', {});
    this.host.pushState();
    this.host.markDirty();
  }

  private endingTexts(success: boolean) {
    return this.sc.ending.characterEndings
      .filter((ce) => Object.values(this.st.picks).includes(ce.charId))
      .map((ce) => ({ charId: ce.charId, text: success ? ce.success : ce.failure }));
  }

  onParticipantConnection(_uid: string, _connected: boolean) { this.host.pushState(); }
  onParticipantAbsent(uid: string) {
    if (this.st.stage === 'casting') this.st.castReady = this.st.castReady.filter((x) => x !== uid);
    if (this.st.presentation?.by === uid) this.st.presentation = null;
    this.host.pushState();
    if (this.st.stage === 'ending') this.checkEndingClose();
  }

  // ── 뷰 ─────────────────────────────────────────────
  viewFor(uid: string): MMView {
    const sc = this.sc;
    const infos = this.host.participants();
    const participant = this.isParticipant(uid);
    const myChar = participant ? this.charOf(uid) : null;
    const step = this.st.stage === 'flow' ? this.step() : null;

    const people: MMPersonPublic[] = [
      ...sc.characters.map((c: Character) => {
        const owner = this.userOfChar(c.id);
        return {
          id: c.id, name: c.name, title: c.title, age: c.age, publicIntro: c.publicIntro, color: c.color, portrait: c.portrait,
          isCharacter: true, required: c.required, canVote: c.canVote, takenBy: owner, takenByName: owner ? infos.find((i) => i.userId === owner)?.nickname ?? null : null,
        };
      }),
      ...sc.suspects.map((s) => ({
        id: s.id, name: s.name, title: s.title, age: '', publicIntro: s.description, color: s.color, portrait: s.portrait,
        isCharacter: false, required: false, canVote: false, takenBy: null, takenByName: null,
      })),
    ];

    const items: MMItemView[] = (myChar ? this.st.received[myChar] ?? [] : []).map((r) => {
      const base = { key: r.key, kind: r.kind, refId: r.refId, stepIndex: r.stepIndex, at: r.at, opened: r.opened };
      if (r.kind === 'sheet') { const p = sc.sheetPages.find((x) => x.id === r.refId)!; return { ...base, title: p.title, sheet: { body: p.body } }; }
      if (r.kind === 'common') { const c = sc.commonEntries.find((x) => x.id === r.refId)!; return { ...base, title: c.title, common: { blocks: c.blocks } }; }
      const c = sc.clues.find((x) => x.id === r.refId)!;
      return { ...base, title: c.title, clue: { type: c.type, text: c.text, image: c.image, caption: c.caption, scope: c.scope } };
    });

    const myCharDef = myChar ? this.character(myChar) : null;

    // 펼쳐진 자료는 '같은 채널' 에 있는 참가자에게만 보인다 (대화 격리와 같은 규칙)
    let presentation: MMPresentationView | null = null;
    const pr = this.st.presentation;
    if (pr && participant && this.host.channelOf(uid) === this.host.channelOf(pr.by)) {
      const d = this.describe(pr.kind, pr.refId);
      presentation = {
        key: pr.key, byUserId: pr.by, byCharId: pr.charId, byName: pr.charId ? this.personName(pr.charId) : this.info(pr.by)?.nickname ?? '누군가',
        at: pr.at, mine: pr.by === uid, wasPrivate: pr.wasPrivate,
        item: { key: pr.key, kind: pr.kind, refId: pr.refId, stepIndex: this.st.stepIndex, at: pr.at, opened: true, ...d },
      };
    }

    let vote: MMView['vote'] = null;
    if (step?.type === 'phase' && step.kind === 'vote' && step.vote) {
      const recs = this.st.votes[step.id] ?? {};
      const eligibleChars = this.st.participants.map((u) => this.character(this.charOf(u) ?? '')).filter((c) => c?.canVote) as Character[];
      vote = {
        stepId: step.id, eligible: !!myCharDef?.canVote,
        myChoice: myChar ? recs[myChar]?.choice ?? null : null, confirmed: myChar ? !!recs[myChar]?.confirmed : false,
        confirmedCount: eligibleChars.filter((c) => recs[c.id]?.confirmed).length, eligibleCount: eligibleChars.length,
      };
    }

    return {
      moduleId: MM_MODULE_ID, serverNow: this.now(),
      scenario: { id: sc.id, title: sc.title, subtitle: sc.subtitle, summary: sc.summary, cover: sc.cover, minPlayers: sc.minPlayers, maxPlayers: sc.maxPlayers, playtimeMin: sc.playtimeMin, voteVisibility: sc.settings.voteVisibility },
      stage: this.st.stage,
      me: { userId: uid, charId: myChar, participant },
      participants: this.st.participants.map((u) => {
        const inf = infos.find((i) => i.userId === u);
        const c = this.character(this.charOf(u) ?? '');
        let ready = false;
        if (this.st.stage === 'casting') ready = this.st.castReady.includes(u);
        else if (step) ready = step.type === 'phase' && step.kind === 'vote' && c?.canVote ? !!this.st.votes[step.id]?.[c.id]?.confirmed : this.st.ready.includes(u);
        else if (this.st.ending) ready = this.st.ending.leaving.includes(u);
        return { userId: u, nickname: inf?.nickname ?? '?', charId: this.charOf(u), connected: !!inf?.connected, absent: !!inf?.absent, ready };
      }),
      people,
      casting: this.st.stage === 'casting' ? { startsAt: this.st.castStartsAt, ready: this.st.castReady } : null,
      outline: sc.flow.map((s, index) => ({ index, title: s.title, type: s.type, kind: s.type === 'phase' ? s.kind : null })),
      step: step ? {
        index: this.st.stepIndex, total: sc.flow.length, id: step.id, type: step.type, kind: step.type === 'phase' ? step.kind : null,
        title: step.title, note: step.note, advance: step.advance, startedAt: this.st.stepStartedAt, endsAt: this.st.stepEndsAt,
        durationSec: step.durationSec, extendSec: step.extendSec, zonesOpen: step.zonesOpen,
        myItemKeys: items.filter((i) => i.stepIndex === this.st.stepIndex).map((i) => i.key),
        advanceAt: this.st.advanceAt,
        vote: step.type === 'phase' && step.vote ? step.vote : null,
      } : null,
      items,
      cards: myCharDef ? myCharDef.cards.map((c) => ({ id: c.id, name: c.name, description: c.description, uses: c.uses, usesLeft: this.st.cards[myCharDef.id]?.[c.id] ?? c.uses })) : [],
      log: participant ? this.st.log.slice(-80) : this.st.log.filter((l) => l.kind !== 'vote').slice(-40),
      extend: { cooldownUntil: this.st.extendCooldownUntil, lastBy: this.st.extendLastBy ? this.displayName(this.st.extendLastBy) : null },
      vote,
      presentation,
      ending: this.st.ending,
    };
  }

  snapshot() { return this.st; }
}
