// 서버를 게임 도중 재시작해도 방/게임/열람 상태가 복원되는지
import { io } from 'socket.io-client';
import { execSync } from 'node:child_process';
const URL = 'http://localhost:3200';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = (s, ev, ...args) => new Promise((res) => s.emit(ev, ...args, res));
let failures = 0;
const check = (c, m) => { console.log(`${c ? '  ✔' : '  ✘'} ${m}`); if (!c) failures++; };
async function client(name, token) {
  const s = io(URL, { transports: ['websocket'], forceNew: true, reconnection: false });
  const c = { s, state: null };
  s.on('g:state', (v) => (c.state = v));
  await new Promise((r) => s.on('connect', r));
  const a = await call(s, 'auth', token ? { token } : { nickname: name });
  c.user = a.user; c.token = a.token; c.lastRoomId = a.lastRoomId;
  return c;
}
async function walk(c, from, to) { let { x, y } = from; while (Math.hypot(to.x - x, to.y - y) > 0.5) { const d = Math.hypot(to.x - x, to.y - y), k = Math.min(4, d) / d; x += (to.x - x) * k; y += (to.y - y) * k; c.s.emit('m', { x, y, f: 0, mv: 1 }); await sleep(52); } c.s.emit('m', { x, y, f: 0, mv: 0 }); return { x, y }; }
execSync('FRESH=1 GRACE=60000 tests/server.sh 3200 /tmp/claude-0/data-restart', { stdio: 'ignore' });
const A = await client('에이'), B = await client('비');
const { roomId } = await call(A.s, 'rooms:create', { title: '재시작 실험', password: 'pw' });
await call(A.s, 'room:join', { roomId, password: 'pw' });
const jb = await call(B.s, 'room:join', { roomId, password: 'pw' });
const pos = (uid) => { const m = jb.snapshot.members.find((mm) => mm.userId === uid); return { x: m.x, y: m.y }; };
await Promise.all([
  (async () => { let p = pos(A.user.userId); p = await walk(A, p, { x: 270, y: p.y }); p = await walk(A, p, { x: 270, y: 222 }); await walk(A, p, { x: 352, y: 222 }); })(),
  (async () => { await walk(B, pos(B.user.userId), { x: 352, y: 286 }); })(),
]);
await call(A.s, 'sit', { tableId: 'main', index: 1 }); await call(B.s, 'sit', { tableId: 'main', index: 5 });
await call(A.s, 'table:select', { moduleId: 'murder-mystery', contentId: 'haemugwan' });
await call(A.s, 'table:ready', { ready: true }); await call(B.s, 'table:ready', { ready: true });
await sleep(4600);
await call(A.s, 'g:action', { type: 'pick', payload: { charId: 'seojin' } }); await call(B.s, 'g:action', { type: 'pick', payload: { charId: 'taeo' } });
await call(A.s, 'g:action', { type: 'castReady', payload: { ready: true } }); await call(B.s, 'g:action', { type: 'castReady', payload: { ready: true } });
await sleep(4000);
for (const key of A.state.step.myItemKeys) await call(A.s, 'g:action', { type: 'open', payload: { key } });
await call(A.s, 'g:action', { type: 'useCard', payload: { cardId: 'restorer-eye' } });
const endsAt = A.state.step.endsAt;
await sleep(3500); // 영속화 주기(3초) 대기
A.s.disconnect(); B.s.disconnect();
execSync('GRACE=60000 tests/server.sh 3200 /tmp/claude-0/data-restart', { stdio: 'ignore' });
console.log('  … 서버 재시작 완료');
const A2 = await client(null, A.token);
check(A2.user.userId === A.user.userId && A2.lastRoomId === roomId, '재시작 후에도 토큰으로 같은 유저·마지막 방 식별');
const j = await call(A2.s, 'room:join', { roomId });
await sleep(300);
check(j.ok && j.snapshot.status === 'playing', '방과 게임 진행 상태 복원 (비밀번호 재입력 없이 복귀)');
check(A2.state?.me.charId === 'seojin' && A2.state.stage === 'flow', '캐릭터·단계 복원');
check(A2.state.items.filter((i) => i.stepIndex === 0).every((i) => i.opened), '열람 상태 복원');
check(A2.state.cards.find((c) => c.id === 'restorer-eye').usesLeft === 0, '카드 사용 횟수 복원');
check(Math.abs(A2.state.step.endsAt - endsAt) < 15000, '타이머 마감 시각이 다운타임만큼 보정됨');
console.log(failures ? `\n실패 ${failures}건` : '\n서버 재시작 복원 검사 모두 통과');
A2.s.disconnect();
process.exit(failures ? 1 : 0);
