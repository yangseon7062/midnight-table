// 카드 대전 **세션 경계** 단위 테스트 — 기준서 13번의 "아직 테스트가 없는 것" 을 채운다.
//
// unit-cb.test.ts 는 engine/ 의 순수 함수를 본다. 이 파일은 그 위의 session.ts,
// 즉 플랫폼과 맞닿는 한 겹을 본다 — 타이머 보정, 끊김, 기권, 난이도.
//
// 소켓도 브라우저도 쓰지 않는다. GameHost 가 평범한 인터페이스라서 가짜를 하나 만들면
// 시계를 원하는 대로 돌릴 수 있다. 다운타임 40초를 실제로 기다리지 않고도
// "다운타임이 제한 시간보다 길면 단계를 다시 준다"를 확인할 수 있는 이유다.
import {
  AUTO_PICK_LOSS_STREAK,
  CARD_SELECT_MS,
  CB_CONTENT_PVP,
  CB_CONTENT_SOLO,
  CHAR_SELECT_MS,
} from '../shared/cb/types';
import type { GameHost, ParticipantInfo } from '../server/src/platform/gameModule';
import { CardBattleSession, type CBSnapshot } from '../server/src/modules/card-battle/session';
import { createCardBattleModule } from '../server/src/modules/card-battle';
import type { CBView } from '../shared/cb/view';

let failures = 0;
const check = (c: boolean, m: string) => { console.log(`${c ? '  ✔' : '  ✘'} ${m}`); if (!c) failures++; };
const section = (t: string) => console.log(`\n── ${t}`);

const T0 = 1_000_000;
const cbModule = createCardBattleModule();

/**
 * 가짜 호스트. 시계를 직접 쥐고, 호스트가 불린 횟수를 세어 둔다.
 *
 * `endGame()` 이 실제로 불렸는지가 기준서 7-1 ③ 의 핵심이다 — 기권 처리만 하고
 * 방으로 돌려보내지 않으면 판이 끝난 화면에 사람이 갇힌다.
 */
class FakeHost implements GameHost {
  clock = T0;
  endGameCalls = 0;
  messages: string[] = [];
  private people: ParticipantInfo[];

  constructor(userIds: readonly string[]) {
    this.people = userIds.map((userId, i) => ({
      userId,
      nickname: `사람${i + 1}`,
      connected: true,
      absent: false,
    }));
  }

  now(): number { return this.clock; }
  participants(): ParticipantInfo[] { return this.people; }
  pushState(): void {}
  emit(): void {}
  systemMessage(text: string): void { this.messages.push(text); }
  channelOf(): string { return 'public'; }
  audienceOf(): string[] { return this.people.map((p) => p.userId); }
  toast(): void {}
  setZones(): void {}
  setZonesOpen(): void {}
  setBadge(): void {}
  endGame(): void { this.endGameCalls++; }
  markDirty(): void {}

  /** 시계를 옮기고 세션에 tick 을 준다 — 실제 서버 루프가 하는 일과 같다 */
  advance(session: CardBattleSession, ms: number): void {
    this.clock += ms;
    session.tick(this.clock);
  }

  setConnected(userId: string, connected: boolean): void {
    const p = this.people.find((x) => x.userId === userId);
    if (p) p.connected = connected;
  }

  setAbsent(userId: string): void {
    const p = this.people.find((x) => x.userId === userId);
    if (p) { p.connected = false; p.absent = true; }
  }
}

/** 두 사람이 캐릭터를 고르고 카드 선택 단계까지 가 있는 판 */
function pvpAtSelecting(): { host: FakeHost; s: CardBattleSession } {
  const host = new FakeHost(['u1', 'u2']);
  const s = new CardBattleSession(host, { participants: ['u1', 'u2'], contentId: CB_CONTENT_PVP });
  s.onAction('u1', 'chooseChar', { characterId: 'c1' });
  s.onAction('u2', 'chooseChar', { characterId: 'c5' });
  // 대치 연출이 끝나야 selecting 으로 넘어간다
  host.advance(s, 3000);
  return { host, s };
}

function viewOf(s: CardBattleSession, userId: string): CBView {
  return s.viewFor(userId) as CBView;
}

/* ═══════════════════════ 타이머 보정 (기준서 11-2) ═══════════════════════ */
section('서버 재시작 — 타이머 보정 (기준서 11-2)');
{
  // 캐릭터 선택 중에 서버가 10초 죽었다 → 마감이 10초 밀린다
  {
    const host = new FakeHost(['u1', 'u2']);
    const s = new CardBattleSession(host, { participants: ['u1', 'u2'], contentId: CB_CONTENT_PVP });
    const before = s.st.deadline;
    const snap = s.snapshot() as CBSnapshot;

    const host2 = new FakeHost(['u1', 'u2']);
    host2.clock = T0 + 10_000;
    const s2 = new CardBattleSession(host2, { snapshot: snap, shift: 10_000 });
    check(s2.st.deadline === before + 10_000, '다운타임(10초) < 제한(30초) → 마감이 그만큼 뒤로 밀린다');
    check(s2.st.phase === 'charSelect', '단계는 그대로 캐릭터 선택');
  }

  // 캐릭터 선택 중에 서버가 40초 죽었다 → 남은 시간으로 고르라고 할 수 없으니 30초를 다시 준다
  {
    const host = new FakeHost(['u1', 'u2']);
    const s = new CardBattleSession(host, { participants: ['u1', 'u2'], contentId: CB_CONTENT_PVP });
    const snap = s.snapshot() as CBSnapshot;

    const host2 = new FakeHost(['u1', 'u2']);
    host2.clock = T0 + 40_000;
    const s2 = new CardBattleSession(host2, { snapshot: snap, shift: 40_000 });
    check(
      s2.st.deadline === host2.now() + CHAR_SELECT_MS,
      `다운타임(40초) > 제한(30초) → 캐릭터 선택 30초를 처음부터 다시 준다`,
    );
  }

  // 카드 선택은 제한이 20초다 — 경계가 단계마다 다르다는 것을 확인한다
  {
    const { host, s } = pvpAtSelecting();
    const before = s.st.deadline;
    const snap = s.snapshot() as CBSnapshot;

    const shortHost = new FakeHost(['u1', 'u2']);
    shortHost.clock = host.now() + 8_000;
    const short = new CardBattleSession(shortHost, { snapshot: snap, shift: 8_000 });
    check(short.st.deadline === before + 8_000, '카드 선택 중 다운타임(8초) < 제한(20초) → 마감이 밀린다');

    const longHost = new FakeHost(['u1', 'u2']);
    longHost.clock = host.now() + 25_000;
    const long = new CardBattleSession(longHost, { snapshot: snap, shift: 25_000 });
    check(
      long.st.deadline === longHost.now() + CARD_SELECT_MS,
      '카드 선택 중 다운타임(25초) > 제한(20초) → 20초를 처음부터 다시 준다',
    );
  }

  // 단계를 다시 줬다고 해서 플레이어를 벌하지 않는다 — 서버 잘못이다
  {
    const { host, s } = pvpAtSelecting();
    s.st.p1.autoPickStreak = 2;
    s.st.p2.autoPickStreak = 1;
    const snap = s.snapshot() as CBSnapshot;

    const host2 = new FakeHost(['u1', 'u2']);
    host2.clock = host.now() + 60_000;
    const s2 = new CardBattleSession(host2, { snapshot: snap, shift: 60_000 });
    check(
      s2.st.p1.autoPickStreak === 2 && s2.st.p2.autoPickStreak === 1,
      '단계를 다시 줘도 자동 선택 연속 횟수는 올라가지 않는다 (서버 잘못이지 플레이어 잘못이 아니다)',
    );
    check(s2.st.result === null, '복구 자체가 판을 끝내지 않는다');
  }

  // 마감이 없는 단계는 건드리지 않는다
  {
    const host = new FakeHost(['u1', 'u2']);
    const s = new CardBattleSession(host, { participants: ['u1', 'u2'], contentId: CB_CONTENT_PVP });
    s.onAction('u1', 'chooseChar', { characterId: 'c1' });
    s.onAction('u2', 'chooseChar', { characterId: 'c5' });
    check(s.st.phase === 'charReveal', '둘 다 확정하면 대치 연출 단계');
    check(s.st.deadline === 0, '대치 연출에는 마감이 없다');
    const snap = s.snapshot() as CBSnapshot;

    const host2 = new FakeHost(['u1', 'u2']);
    host2.clock = host.now() + 90_000;
    const s2 = new CardBattleSession(host2, { snapshot: snap, shift: 90_000 });
    check(s2.st.deadline === 0, '마감이 없는 단계는 보정하지 않는다');

    // 연출 진행 시각(stepAt)도 같이 밀린다. 다운타임이 아무리 길어도 연출은
    // **남은 만큼** 다시 돈다 — 건너뛰지도 않고, 복구하자마자 끝나 있지도 않다.
    // (마감 보정과 달리 여기엔 상한이 없다. 연출은 사람이 뭘 할 시간이 아니라 볼 시간이다.)
    host2.advance(s2, 1);
    check(s2.st.phase === 'charReveal', '복구 직후에는 아직 대치 연출 중 — 건너뛰지 않는다');
    host2.advance(s2, 2_500);
    check(s2.st.phase === 'selecting', '남은 연출 시간이 지나면 카드 선택으로 넘어간다');
  }

  // 판이 진행된 상태가 통째로 살아 돌아오는지
  {
    const { host, s } = pvpAtSelecting();
    s.onAction('u1', 'submit', { cardIds: ['c1_a', 'move_up', 'move_down'] });
    s.onAction('u2', 'submit', { cardIds: ['move_up', 'move_down', 'move_left'] });
    for (let i = 0; i < 4; i++) host.advance(s, 1600);
    const en1 = s.st.p1.en, hp2 = s.st.p2.hp, turn = s.st.turn;
    const snap = JSON.parse(JSON.stringify(s.snapshot())) as CBSnapshot;

    const host2 = new FakeHost(['u1', 'u2']);
    host2.clock = host.now() + 5_000;
    const s2 = new CardBattleSession(host2, { snapshot: snap, shift: 5_000 });
    check(
      s2.st.p1.en === en1 && s2.st.p2.hp === hp2 && s2.st.turn === turn,
      'JSON 을 거쳐도 기력·체력·턴 수가 그대로 복원된다',
    );
    check(
      s2.st.p1.characterId === 'c1' && s2.st.p2.characterId === 'c5',
      '캐릭터 선택도 복원된다',
    );
    const v = viewOf(s2, 'u1');
    check(v.me?.hand.length === 14, '복구 후에도 손패 14장이 뷰에 실린다');
  }

  // 모듈의 restoreSession 을 거쳐도 같아야 한다 — 실제 서버가 부르는 경로다
  {
    const { host, s } = pvpAtSelecting();
    const before = s.st.deadline;
    const snap = JSON.parse(JSON.stringify(s.snapshot()));

    const host2 = new FakeHost(['u1', 'u2']);
    host2.clock = host.now() + 3_000;
    const s2 = cbModule.restoreSession(host2, snap, 3_000) as CardBattleSession;
    check(s2.st.deadline === before + 3_000, '모듈의 restoreSession 경로에서도 보정이 적용된다');
  }
}

/* ═══════════════════════ 끊김과 기권 (기준서 7-1 ③) ═══════════════════════ */
section('끊김과 기권 (기준서 7-1 ③)');
{
  // 끊긴 동안에도 타이머는 돈다. 20초 × 3턴이면 자동 선택 3연속으로 먼저 패배한다.
  {
    const { host, s } = pvpAtSelecting();
    host.setConnected('u2', false);
    s.onParticipantConnection('u2', false);

    let guard = 0;
    while (s.st.result === null && guard++ < 40) {
      // 접속 중인 u1 만 낸다. u2 는 끊겨 있으니 서버가 대신 고른다.
      if (s.st.p1.submission === null && s.st.phase === 'selecting') {
        s.onAction('u1', 'submit', { cardIds: ['move_up', 'move_down', 'move_left'] });
      }
      host.advance(s, CARD_SELECT_MS + 1_000);
      for (let i = 0; i < 5; i++) host.advance(s, 1_600);
    }

    check(s.st.result?.reason === 'autoPick', '끊긴 동안 타이머가 계속 돌아 자동 선택 3연속으로 끝난다');
    check(s.st.result?.winner === 'p1', '자동 선택으로 패배한 쪽은 끊긴 쪽');
    check(s.st.p2.autoPickStreak >= AUTO_PICK_LOSS_STREAK, `끊긴 쪽의 연속 자동 선택이 ${AUTO_PICK_LOSS_STREAK} 이상`);
    check(host.endGameCalls === 1, '판이 끝나면 endGame() 이 정확히 한 번 불린다');
  }

  // 직접 낸 턴이 끼면 연속 카운트가 풀린다 — 잠깐 끊겼다 돌아온 사람이 지지 않는다
  {
    const { host, s } = pvpAtSelecting();
    // 1턴: 아무도 안 냄 → 양쪽 자동 선택
    host.advance(s, CARD_SELECT_MS + 1_000);
    for (let i = 0; i < 5; i++) host.advance(s, 1_600);
    check(s.st.p2.autoPickStreak === 1, '한 턴 놓치면 연속 1');
    // 2턴: 둘 다 직접 냄
    s.onAction('u1', 'submit', { cardIds: ['move_up', 'move_down', 'move_left'] });
    s.onAction('u2', 'submit', { cardIds: ['move_up', 'move_down', 'move_left'] });
    for (let i = 0; i < 5; i++) host.advance(s, 1_600);
    check(s.st.p2.autoPickStreak === 0, '직접 제출한 턴에 연속 횟수가 0 으로 풀린다');
    check(s.st.result === null, '판은 계속된다');
  }

  // 자발 퇴장 — 유예를 기다리지 않고 바로 기권
  {
    const { host, s } = pvpAtSelecting();
    const hp2Before = s.st.p2.hp;
    host.setAbsent('u2');
    s.onParticipantAbsent('u2');

    check(s.st.result?.reason === 'forfeit', 'onParticipantAbsent 를 받으면 기권 처리');
    check(s.st.result?.winner === 'p1', '남은 쪽이 승리');
    check(s.st.phase === 'finished', '판이 끝난 상태로 간다');
    check(host.endGameCalls === 1, '기권도 endGame() 으로 방에 돌려보낸다');
    check(s.st.p2.hp === hp2Before, '기권은 체력을 깎지 않는다 — 판정만 바꾼다');
    check(host.messages.some((m) => m.includes('기권')), '기권 사실을 채팅에 알린다');
  }

  // 판이 끝난 뒤에 또 와도 결과를 뒤집지 않는다
  {
    const { host, s } = pvpAtSelecting();
    s.onParticipantAbsent('u1');
    const first = s.st.result;
    s.onParticipantAbsent('u2');
    check(s.st.result === first && s.st.result?.winner === 'p2', '이미 끝난 판에 두 번째 퇴장이 와도 결과가 안 바뀐다');
    check(host.endGameCalls === 1, 'endGame() 이 두 번 불리지 않는다');
  }

  // 관전자가 나가는 것은 판과 무관하다
  {
    const host = new FakeHost(['u1', 'u2', 'watcher']);
    const s = new CardBattleSession(host, { participants: ['u1', 'u2'], contentId: CB_CONTENT_PVP });
    s.onParticipantAbsent('watcher');
    check(s.st.result === null && host.endGameCalls === 0, '관전자가 나가도 판은 계속된다');
  }

  // 끊겨 있어도 뷰는 계속 나가야 한다 — 돌아왔을 때 화면이 이어져야 하기 때문
  {
    const { host, s } = pvpAtSelecting();
    host.setConnected('u2', false);
    s.onParticipantConnection('u2', false);
    const v = viewOf(s, 'u2');
    check(v.me?.hand.length === 14 && v.p2.connected === false, '끊긴 사람의 뷰에도 손패가 있고, 끊김 상태가 표시된다');
    const v1 = viewOf(s, 'u1');
    check(v1.p2.connected === false, '상대에게도 끊김이 보인다');
  }
}

/* ═══════════════════════ AI 연습 판 (기준서 0-1, 10번) ═══════════════════════ */
section('AI 연습 판 — 난이도와 혼자 앉기');
{
  const soloSession = () => {
    const host = new FakeHost(['u1']);
    const s = new CardBattleSession(host, { participants: ['u1'], contentId: CB_CONTENT_SOLO });
    return { host, s };
  };

  {
    const { s } = soloSession();
    check(s.st.p2.userId === null, '혼자 앉으면 2P 자리는 AI (userId 없음)');
    check(!!s.st.p2.characterId && s.st.p2.charLocked, 'AI 는 캐릭터 선택 단계에서 즉시 고른다');
    check(s.st.p2.charAuto, 'AI 의 선택은 서버 배정으로 표시된다');
    check(s.st.deadline === T0 + CHAR_SELECT_MS, '사람 쪽 30초는 그대로 돈다');

    const v = viewOf(s, 'u1');
    check(v.solo && v.difficulty === 'normal', '뷰에 연습 판임과 기본 난이도(Normal)가 실린다');
    check(v.p2.characterId === null, 'AI 가 이미 골랐어도 확정 전까지 사람에게는 안 보인다');
  }

  // 난이도 전환은 캐릭터 선택 단계에서만
  {
    const { host, s } = soloSession();
    s.onAction('u1', 'setDifficulty', { level: 'hard' });
    check(viewOf(s, 'u1').difficulty === 'hard', '캐릭터 선택 중에는 Hard 로 바꿀 수 있다');
    s.onAction('u1', 'setDifficulty', { level: 'normal' });
    check(viewOf(s, 'u1').difficulty === 'normal', 'Normal 로 되돌릴 수도 있다');

    let rejected = '';
    try { s.onAction('u1', 'setDifficulty', { level: 'insane' }); } catch (e) { rejected = (e as Error).message; }
    check(!!rejected, `알 수 없는 난이도는 거부 (${rejected})`);

    // 판이 시작되면 잠긴다
    s.onAction('u1', 'setDifficulty', { level: 'hard' });
    s.onAction('u1', 'chooseChar', { characterId: 'c1' });
    host.advance(s, 3000);
    check(s.st.phase === 'selecting', '사람이 확정하면 바로 카드 선택으로 (AI 는 이미 골라 뒀다)');
    let locked = '';
    try { s.onAction('u1', 'setDifficulty', { level: 'normal' }); } catch (e) { locked = (e as Error).message; }
    check(!!locked, `판이 시작되면 난이도를 못 바꾼다 (${locked})`);
    check(viewOf(s, 'u1').difficulty === 'hard', '고른 난이도가 유지된다');
  }

  // 사람 대 사람 판에서는 난이도라는 개념이 없다
  {
    const { s } = pvpAtSelecting();
    let err = '';
    try { s.onAction('u1', 'setDifficulty', { level: 'hard' }); } catch (e) { err = (e as Error).message; }
    check(!!err, `사람 대 사람 판에서는 난이도를 바꿀 수 없다 (${err})`);
  }

  // AI 가 매 턴 알아서 내고, 판이 끝까지 간다 — 난이도 둘 다
  for (const level of ['normal', 'hard'] as const) {
    const { host, s } = soloSession();
    s.onAction('u1', 'setDifficulty', { level });
    s.onAction('u1', 'chooseChar', { characterId: 'c1' });
    host.advance(s, 3000);

    let turns = 0;
    let aiSubmittedEveryTurn = true;
    while (s.st.result === null && turns++ < 60) {
      if (s.st.phase === 'selecting') {
        // AI 는 카드 선택 단계에 들어오는 순간 이미 내 있어야 한다
        if (s.st.p2.submission === null) aiSubmittedEveryTurn = false;
        // 기력이 있으면 때리고, 마르면 모은다. 회복이 Energy Up 뿐이라 이렇게 안 하면
        // 몇 턴 뒤 제출이 거부된다 — 사람이 실제로 겪는 제약이다.
        const en = s.st.p1.en;
        const mine = en >= 25
          ? ['move_right', 'c1_a', 'move_left']
          : ['energy_up', 'move_right', 'move_left'];
        s.onAction('u1', 'submit', { cardIds: mine });
      }
      for (let i = 0; i < 6; i++) host.advance(s, 1_600);
    }
    check(aiSubmittedEveryTurn, `${level}: AI 가 매 턴 사람을 기다리지 않고 먼저 낸다`);
    check(s.st.result !== null, `${level}: 연습 판이 끝까지 간다 (${s.st.result?.reason} / ${turns}턴)`);
    check(host.endGameCalls === 1, `${level}: 끝나면 endGame()`);
  }

  // 연습 판의 난이도는 복구 후에도 유지된다
  {
    const { host, s } = soloSession();
    s.onAction('u1', 'setDifficulty', { level: 'hard' });
    const snap = JSON.parse(JSON.stringify(s.snapshot()));
    const host2 = new FakeHost(['u1']);
    host2.clock = host.now() + 2_000;
    const s2 = cbModule.restoreSession(host2, snap, 2_000) as CardBattleSession;
    check(viewOf(s2, 'u1').difficulty === 'hard', '재시작 후에도 고른 난이도가 남아 있다');
    check(viewOf(s2, 'u1').solo, '재시작 후에도 연습 판으로 인식된다');
  }

  // 혼자 앉은 판에서 사람이 나가면 그대로 끝난다 (AI 만 남겨 두지 않는다)
  {
    const { host, s } = soloSession();
    s.onParticipantAbsent('u1');
    check(s.st.result?.winner === 'p2' && s.st.result.reason === 'forfeit', '연습 판에서 사람이 나가면 기권으로 끝난다');
    check(host.endGameCalls === 1, '방으로 돌려보낸다');
  }
}

/* ═══════════════════════ 콘텐츠 등록 ═══════════════════════ */
section('콘텐츠 등록 (기준서 0-1)');
{
  const list = cbModule.listContents();
  check(list.length === 2, '콘텐츠 2개');
  const pvp = list.find((c) => c.contentId === CB_CONTENT_PVP);
  const solo = list.find((c) => c.contentId === CB_CONTENT_SOLO);
  check(pvp?.minPlayers === 2 && pvp?.maxPlayers === 2, '사람 대 사람은 2인 고정 — 3명 이상 앉는 상황 자체가 없다');
  check(solo?.minPlayers === 1 && solo?.maxPlayers === 1, 'AI 연습은 1인 고정 — 한 명 앉으면 바로 시작');
  check(!!cbModule.getContent(CB_CONTENT_SOLO), 'getContent 로 연습 판을 찾을 수 있다');
  check(cbModule.getContent('없는것') === null, '없는 콘텐츠는 null');
}

console.log(failures ? `\n실패 ${failures}건` : '\n카드 대전 세션 테스트 모두 통과');
process.exit(failures ? 1 : 0);
