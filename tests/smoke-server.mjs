// 서버 로직 스모크 테스트: 소켓 클라이언트 3개로 방 생성 → 착석 → 시나리오 선택 → 준비 → 캐스팅 → 전체 진행 → 투표 → 엔딩
import { io } from 'socket.io-client';
const URL = process.env.URL ?? 'http://localhost:3100';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = (s, ev, ...args) => new Promise((res) => s.emit(ev, ...args, res));
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? '  ✔' : '  ✘'} ${msg}`); if (!cond) failures++; };

async function client(name) {
  const s = io(URL, { transports: ['websocket'] });
  const c = { s, name, state: null, chats: [], events: [], peers: null, members: new Map() };
  s.on('g:state', (v) => (c.state = v));
  s.on('chat:msg', (m) => c.chats.push(m));
  s.on('g:event', (e) => c.events.push(e));
  s.on('v:peers', (p) => (c.peers = p));
  s.on('room:member', (m) => c.members.set(m.userId, m));
  await new Promise((r) => s.on('connect', r));
  const a = await call(s, 'auth', { nickname: name });
  c.user = a.user; c.token = a.token;
  return c;
}

const A = await client('앨리스');
const B = await client('밥');
const C = await client('관전자');
const created = await call(A.s, 'rooms:create', { title: '테스트 방', password: '1234' });
check(created.ok, '방 생성');
const roomId = created.roomId;
const noPw = await call(B.s, 'room:join', { roomId });
check(!noPw.ok && noPw.error === 'PASSWORD_REQUIRED', '비밀번호 필요 응답');
const wrong = await call(B.s, 'room:join', { roomId, password: '9999' });
check(!wrong.ok, '틀린 비밀번호 거부');
const jA = await call(A.s, 'room:join', { roomId, password: '1234' });
const jB = await call(B.s, 'room:join', { roomId, password: '1234' });
const jC = await call(C.s, 'room:join', { roomId, password: '1234' });
check(jA.ok && jB.ok && jC.ok, '3명 입장');
const map = jA.snapshot;
const table = { x: 288, y: 224 };

// 이동 검증: 순간이동 거부
const fixes = [];
A.s.on('m:fix', (f) => fixes.push(f));
const me = map.members.find((m) => m.userId === A.user.userId);
A.s.emit('m', { x: me.x + 200, y: me.y, f: 0, mv: 1 });
await sleep(150);
check(fixes.length === 1, '순간이동 시도 → 서버 교정(m:fix)');

// 걸어서 좌석 근처로 이동 (서버 속도 제한 준수)
async function walkTo(c, fromX, fromY, toX, toY) {
  let x = fromX, y = fromY;
  const stepPx = 4;
  while (Math.hypot(toX - x, toY - y) > 1) {
    const d = Math.hypot(toX - x, toY - y); const k = Math.min(stepPx, d) / d;
    // 축 우선 이동 (벽 회피가 필요 없는 열린 경로)
    x += (toX - x) * k; y += (toY - y) * k;
    c.s.emit('m', { x, y, f: 0, mv: 1 });
    await sleep(55);
  }
  c.s.emit('m', { x, y, f: 0, mv: 0 });
  return { x, y };
}
const seat0 = { x: 288 + 24, y: 222 }, seat4 = { x: 288 + 104, y: 286 };
const bMe = jB.snapshot.members.find((m) => m.userId === B.user.userId);
await Promise.all([
  (async () => { await walkTo(A, me.x, me.y, me.x, 300); await walkTo(A, me.x, 300, 270, 300); await walkTo(A, 270, 300, 270, 222); await walkTo(A, 270, 222, seat0.x, seat0.y); })(),
  (async () => { await walkTo(B, bMe.x, bMe.y, seat4.x, seat4.y); })(),
]);
let r = await call(A.s, 'sit', { tableId: 'main', index: 0 });
check(r.ok, `A 착석 ${r.error ?? ''}`);
r = await call(B.s, 'sit', { tableId: 'main', index: 4 });
check(r.ok, `B 착석 ${r.error ?? ''}`);
const list = await call(A.s, 'rooms:list');
const content = list.modules[0].contents[0];
check(content?.contentId === 'haemugwan', '모듈/시나리오 목록');
r = await call(C.s, 'table:select', { moduleId: content.moduleId, contentId: content.contentId });
check(!r.ok, '앉지 않은 사람은 게임 선택 불가');
r = await call(A.s, 'table:select', { moduleId: content.moduleId, contentId: content.contentId });
check(r.ok, '시나리오 선택');
await call(A.s, 'table:ready', { ready: true });
await call(B.s, 'table:ready', { ready: true });
await sleep(4600);
check(A.state?.stage === 'casting', `게임 시작 → 캐스팅 (stage=${A.state?.stage})`);
check(C.state && C.state.me.participant === false, '관전자 뷰');

r = await call(A.s, 'g:action', { type: 'pick', payload: { charId: 'seojin' } });
check(r.ok, 'A 서진 선택');
r = await call(B.s, 'g:action', { type: 'pick', payload: { charId: 'seojin' } });
check(!r.ok, 'B 중복 선택 거부');
r = await call(B.s, 'g:action', { type: 'pick', payload: { charId: 'taeo' } });
r = await call(C.s, 'g:action', { type: 'pick', payload: { charId: 'taeo' } });
check(!r.ok, '관전자 조작 거부');
await call(A.s, 'g:action', { type: 'castReady', payload: { ready: true } });
await call(B.s, 'g:action', { type: 'castReady', payload: { ready: true } });
await sleep(3900);
check(A.state?.stage === 'flow' && A.state.step?.index === 0, '진행 시작 (1단계)');
const aKeys = A.state.items.map((i) => i.key), bKeys = B.state.items.map((i) => i.key);
check(aKeys.includes('sheet:sj-1') && !aKeys.includes('sheet:tae-1'), 'A는 자기 설정집만 받음');
check(bKeys.includes('sheet:tae-1') && !bKeys.includes('sheet:sj-1'), 'B는 자기 설정집만 받음');
check(C.state.items.length === 0, '관전자는 자료 없음');
r = await call(A.s, 'g:action', { type: 'ready', payload: { ready: true } });
check(!r.ok, '자료를 열기 전에는 확인 불가');

async function readyAll() {
  for (const c of [A, B]) {
    const st = c.state;
    for (const key of st.step.myItemKeys) await call(c.s, 'g:action', { type: 'open', payload: { key } });
    const rr = await call(c.s, 'g:action', { type: 'ready', payload: { ready: true } });
    if (!rr.ok) console.log('   ready 실패', c.name, rr.error);
  }
}
// 타이머 연장 쿨타임
let idx = 0;
while (A.state.stage === 'flow') {
  const st = A.state.step;
  if (st.kind === 'interrogation') {
    const e1 = await call(A.s, 'g:action', { type: 'extend' });
    const e2 = await call(B.s, 'g:action', { type: 'extend' });
    check(e1.ok && !e2.ok, `연장 쿨타임 (${e2.error})`);
    const card = await call(B.s, 'g:action', { type: 'useCard', payload: { cardId: 'secretary-note', note: '22시 30분' } });
    check(card.ok, '카드 사용');
    await sleep(100);
    check(B.state.cards.find((c) => c.id === 'secretary-note').usesLeft === 1, '카드 잔여 횟수 차감');
    check(A.events.some((e) => e.type === 'card'), '다른 참가자에게 카드 사용 이벤트');
    const bad = await call(A.s, 'g:action', { type: 'useCard', payload: { cardId: 'secretary-note' } });
    check(!bad.ok, '남의 카드 사용 거부');

    // ── 테이블에 펼치기 (같은 대화 채널에 있는 사람에게만 보인다) ──
    const secret = A.state.items.find((i) => i.kind === 'sheet' && i.opened);
    const noConfirm = await call(A.s, 'g:action', { type: 'present', payload: { key: secret.key } });
    check(!noConfirm.ok, `비공개 자료는 확인 없이 펼칠 수 없음 (${noConfirm.error})`);

    const pub = A.state.items.find((i) => i.opened && (i.kind === 'common' || i.clue?.scope === 'public'));
    const pres = await call(A.s, 'g:action', { type: 'present', payload: { key: pub.key } });
    check(pres.ok, '공개 자료를 테이블에 펼침');
    await sleep(150);
    check(A.state.presentation?.mine === true, '펼친 본인 화면에 표시');
    check(B.state.presentation?.key === pub.key, '같은 공간의 다른 참가자에게도 같은 자료가 보임');
    check(!C.state.presentation, '관전자에게는 보이지 않음');
    check(B.chats.some((m) => m.text.includes('테이블에 펼쳤습니다')), '펼쳤다는 알림이 채팅에 남음');

    const notOwner = await call(B.s, 'g:action', { type: 'unpresent' });
    check(!notOwner.ok, '펼친 사람만 걷을 수 있음');

    // 밀담 구역으로 들어가면 구역 밖에서는 보이지 않아야 한다
    A.s.emit('stand');
    await walkTo(A, seat0.x, seat0.y, 440, seat0.y);
    await walkTo(A, 440, seat0.y, 440, 392);
    await walkTo(A, 440, 392, 504, 392);
    await sleep(250);
    check(!B.state.presentation, '펼친 사람이 밀담 구역에 들어가면 구역 밖에는 보이지 않음');
    check(A.state.presentation?.key === pub.key, '구역 안의 본인에게는 계속 보임');
    await walkTo(A, 504, 392, 440, 392);
    await walkTo(A, 440, 392, 440, seat0.y);
    await sleep(250);
    check(B.state.presentation?.key === pub.key, '구역에서 나오면 다시 함께 보임');

    const secretOk = await call(A.s, 'g:action', { type: 'present', payload: { key: secret.key, confirm: true } });
    check(secretOk.ok, '확인하면 비공개 자료도 공개할 수 있음');
    await sleep(150);
    check(B.state.presentation?.wasPrivate === true && B.state.presentation.item.sheet, '공개된 비공개 자료의 본문이 상대에게 전달됨');

    await call(A.s, 'g:action', { type: 'unpresent' });
    await sleep(150);
    check(!A.state.presentation && !B.state.presentation, '걷으면 모두의 화면에서 사라짐');
  }
  if (st.kind === 'vote') {
    r = await call(A.s, 'g:action', { type: 'vote', payload: { candidateId: 'kihyun' } });
    check(r.ok, 'A 투표');
    await call(B.s, 'g:action', { type: 'vote', payload: { candidateId: 'kihyun' } });
    await call(A.s, 'g:action', { type: 'voteConfirm', payload: { confirmed: true } });
    await call(B.s, 'g:action', { type: 'voteConfirm', payload: { confirmed: true } });
  } else {
    await readyAll();
  }
  const before = st.index;
  for (let i = 0; i < 60 && A.state.stage === 'flow' && A.state.step.index === before; i++) await sleep(100);
  if (++idx > 20) break;
}
check(A.state.stage === 'ending', '엔딩 도달');
check(A.state.ending?.outcome === 'success', `결과: ${A.state.ending?.outcome}`);
check(B.state.items.some((i) => i.key === 'clue:c-will') && !A.state.items.some((i) => i.key === 'clue:c-will'), '개인 단서 격리 (유언장)');
check(A.chats.some((m) => m.text.includes('카드를 사용')), '카드 사용 채팅 알림');

// 채팅 격리는 로비 단계 검증 (별도 테스트에서 상세 검증)
await call(A.s, 'g:action', { type: 'leave' });
await call(B.s, 'g:action', { type: 'leave' });
await sleep(300);
const snapAfter = await call(C.s, 'rooms:list');
check(snapAfter.rooms[0].status === 'waiting', '엔딩 후 방이 대기 상태로 복귀');
// ─────────────────────────────────────────────────────────────
// 카드 대전 — 2단계: 등록 3종이 실제로 붙었는가 + 정보 차단
// A·B 가 플레이어, C 는 앉지 않은 관전자다.
// ─────────────────────────────────────────────────────────────
console.log('\n▶ 카드 대전');
// 앞 시나리오에서 A 가 테이블에서 멀어졌으므로, 새 방에 새 클라이언트로 붙는다.
const D = await client('두리');
const E = await client('이든');
const F = await client('관전자2');
const cbRoom = (await call(D.s, 'rooms:create', { title: '카드 대전 방' })).roomId;
const jD = await call(D.s, 'room:join', { roomId: cbRoom });
const jE = await call(E.s, 'room:join', { roomId: cbRoom });
await call(F.s, 'room:join', { roomId: cbRoom });

// 앞 시나리오와 같은 방식으로 걸어가 앉는다 (서버가 좌석 거리와 이동 속도를 검증한다)
const dMe = jD.snapshot.members.find((m) => m.userId === D.user.userId);
const eMe = jE.snapshot.members.find((m) => m.userId === E.user.userId);
await Promise.all([
  (async () => {
    await walkTo(D, dMe.x, dMe.y, dMe.x, 300);
    await walkTo(D, dMe.x, 300, 270, 300);
    await walkTo(D, 270, 300, 270, 222);
    await walkTo(D, 270, 222, seat0.x, seat0.y);
  })(),
  (async () => { await walkTo(E, eMe.x, eMe.y, seat4.x, seat4.y); })(),
]);

const list2 = await call(D.s, 'rooms:list');
const cbMod = list2.modules.find((m) => m.id === 'card-battle');
check(!!cbMod, '모듈 목록에 카드 대전이 뜸');
check(cbMod?.contents.length === 2, '콘텐츠 2개 (대전 / AI 연습)');
const pvp = cbMod?.contents.find((c) => c.contentId === 'card-battle');
const solo = cbMod?.contents.find((c) => c.contentId === 'card-battle-solo');
check(pvp?.minPlayers === 2 && pvp?.maxPlayers === 2, '대전 콘텐츠는 2인 고정 (3명 이상 앉는 상황이 안 생김)');
check(solo?.minPlayers === 1 && solo?.maxPlayers === 1, 'AI 연습 콘텐츠는 1인');

const sitD = await call(D.s, 'sit', { tableId: 'main', index: 0 });
const sitE = await call(E.s, 'sit', { tableId: 'main', index: 4 });
check(sitD.ok && sitE.ok, `두 명 착석 (D: ${sitD.ok ? 'ok' : sitD.error} / E: ${sitE.ok ? 'ok' : sitE.error})`);
r = await call(D.s, 'table:select', { moduleId: 'card-battle', contentId: 'card-battle' });
check(r.ok, `테이블에서 카드 대전을 고를 수 있음 ${r.ok ? '' : `(${r.error})`}`);
await call(D.s, 'table:ready', { ready: true });
await call(E.s, 'table:ready', { ready: true });
for (let i = 0; i < 100 && D.state?.moduleId !== 'card-battle'; i++) await sleep(100);
check(D.state?.moduleId === 'card-battle', '세션 시작');
check(D.state?.phase === 'charSelect', '캐릭터 선택 단계부터 시작');
check(D.state?.turnLimit === 20, '턴 상한 20이 뷰에 실림');

r = await call(D.s, 'g:action', { type: 'chooseChar', payload: { characterId: 'c1' } });
check(r.ok, 'D 캐릭터 확정');
await sleep(250);
check(D.state.p1.characterId === 'c1', '내가 고른 캐릭터는 내 뷰에 보임');
check(E.state.p1.characterId === null, '상대가 무엇을 골랐는지는 확정 전까지 안 보임');
check(F.state.spectator === true && F.state.me === null, '관전자는 spectator 이고 손패가 없음');
check(F.state.p1.characterId === null, '관전자에게도 선택 중인 캐릭터는 안 보임');

await call(E.s, 'g:action', { type: 'chooseChar', payload: { characterId: 'c5' } });
await sleep(300);
check(D.state.p2.characterId === 'c5' && E.state.p1.characterId === 'c1', '둘 다 확정되면 동시 공개');
check(F.state.p1.characterId === 'c1' && F.state.p2.characterId === 'c5', '관전자도 이때 함께 봄');
check(D.state.p1.hp === 200 && D.state.p2.hp === 190, '공개 시점에 HP = Max HP (C1 200 / C5 190)');

for (let i = 0; i < 80 && D.state.phase !== 'selecting'; i++) await sleep(100);
check(D.state.phase === 'selecting', '대치 연출 뒤 카드 선택 단계로');
check(D.state.me?.hand.length === 14, '손패 14장');
check(D.state.turn === 1, '첫 턴');

r = await call(D.s, 'g:action', { type: 'submit', payload: { cardIds: ['c1_a', 'c1_b', 'move_up'] } });
check(r.ok, 'D 제출 (c1_a → c1_b → move_up, 기력 25+55 = 80)');
r = await call(D.s, 'g:action', { type: 'submit', payload: { cardIds: ['move_up', 'move_down', 'move_left'] } });
check(!r.ok, '제출 뒤에는 다시 낼 수 없음');
r = await call(F.s, 'g:action', { type: 'submit', payload: { cardIds: ['move_up', 'move_down', 'move_left'] } });
check(!r.ok, '관전자는 행동할 수 없음');
await sleep(250);
check(E.state.p1.submitted === true, '상대에게는 "선택 완료" 여부만 보임');

const bJson = JSON.stringify(E.state);
const cJson = JSON.stringify(F.state);
check(!bJson.includes('c1_a') && !bJson.includes('c1_b'), '상대 뷰 페이로드에 미공개 카드 id 가 없음');
check(!cJson.includes('c1_a') && !cJson.includes('c1_b'), '관전자 뷰 페이로드에도 없음');

await call(E.s, 'g:action', { type: 'submit', payload: { cardIds: ['guard', 'move_up', 'move_down'] } });
for (let i = 0; i < 100 && (D.state.revealed?.length ?? 0) < 1; i++) await sleep(100);
check(D.state.revealed.length === 1, '슬롯 1만 먼저 열림 (한 번에 세 장을 다 주지 않음)');
check(D.state.revealed[0].cards.p1 === 'c1_a' && D.state.revealed[0].cards.p2 === 'guard', '열린 슬롯의 양쪽 카드는 공개됨');
const cJson2 = JSON.stringify(F.state);
check(cJson2.includes('c1_a'), '관전자도 열린 슬롯은 봄');
check(!cJson2.includes('c1_b'), '관전자가 아직 안 열린 슬롯 2의 카드는 못 봄');

console.log(failures ? `\n실패 ${failures}건` : '\n모든 검사 통과');
process.exit(failures ? 1 : 0);
