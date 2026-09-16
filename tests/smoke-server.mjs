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
console.log(failures ? `\n실패 ${failures}건` : '\n모든 검사 통과');
process.exit(failures ? 1 : 0);
