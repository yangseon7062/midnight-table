// 카드 대전 판 도중에 서버를 재시작해도 판이 살아 돌아오는지 (기준서 11-2)
//
// unit-cb-session 이 타이머 보정의 **규칙**을 가짜 호스트로 본다. 여기서 보는 것은
// 그 규칙이 **실제 배선 위에서** 도는지다. 둘이 다른 것을 잡는다:
//   - 방이 디스크에 저장될 때 moduleId 가 'card-battle' 로 남는가
//   - 재시작 때 로비가 그 판을 **카드 대전 모듈의** restoreSession 으로 되돌리는가
//   - 저장 → 복원을 거친 뒤에도 뷰가 손패 14장을 그대로 내려주는가
// 이게 깨지면 서버를 한 번 올릴 때마다 진행 중인 대전이 통째로 사라진다.
import { io } from 'socket.io-client';
import { execSync } from 'node:child_process';

const URL = 'http://localhost:3300';
const DATA = '/tmp/claude-0/data-cb-restart';
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

/** 서버가 좌석까지의 거리와 이동 속도를 검증하므로 실제로 걸어가야 한다 */
async function walkTo(c, fromX, fromY, toX, toY) {
  let x = fromX, y = fromY;
  while (Math.hypot(toX - x, toY - y) > 0.5) {
    const d = Math.hypot(toX - x, toY - y), k = Math.min(4, d) / d;
    x += (toX - x) * k; y += (toY - y) * k;
    c.s.emit('m', { x, y, f: 0, mv: 1 });
    await sleep(52);
  }
  c.s.emit('m', { x, y, f: 0, mv: 0 });
}

const until = async (fn, ms = 10000) => {
  for (let i = 0; i < ms / 100; i++) { if (fn()) return true; await sleep(100); }
  return false;
};

execSync(`FRESH=1 GRACE=60000 tests/server.sh 3300 ${DATA}`, { stdio: 'ignore' });

const A = await client('두리'), B = await client('이든');
const roomId = (await call(A.s, 'rooms:create', { title: '재시작 대전' })).roomId;
const jA = await call(A.s, 'room:join', { roomId });
const jB = await call(B.s, 'room:join', { roomId });
const me = (j, c) => j.snapshot.members.find((m) => m.userId === c.user.userId);
// 좌석 좌표는 smoke-server.mjs 와 같은 값을 쓴다 (맵이 고정이다)
const s0 = { x: 288 + 24, y: 222 }, s4 = { x: 288 + 104, y: 286 };

const a0 = me(jA, A), b0 = me(jB, B);
await Promise.all([
  (async () => {
    await walkTo(A, a0.x, a0.y, a0.x, 300);
    await walkTo(A, a0.x, 300, 270, 300);
    await walkTo(A, 270, 300, 270, 222);
    await walkTo(A, 270, 222, s0.x, s0.y);
  })(),
  (async () => { await walkTo(B, b0.x, b0.y, s4.x, s4.y); })(),
]);
const sitA = await call(A.s, 'sit', { tableId: 'main', index: 0 });
const sitB = await call(B.s, 'sit', { tableId: 'main', index: 4 });
check(sitA.ok && sitB.ok, `두 명 착석 (${sitA.ok ? 'ok' : sitA.error} / ${sitB.ok ? 'ok' : sitB.error})`);

await call(A.s, 'table:select', { moduleId: 'card-battle', contentId: 'card-battle' });
await call(A.s, 'table:ready', { ready: true });
await call(B.s, 'table:ready', { ready: true });
check(await until(() => A.state?.moduleId === 'card-battle'), '카드 대전 세션 시작');

// 한 턴을 실제로 진행시켜 둔다 — 복원할 상태가 있어야 의미가 있다
await call(A.s, 'g:action', { type: 'chooseChar', payload: { characterId: 'c3' } });
await call(B.s, 'g:action', { type: 'chooseChar', payload: { characterId: 'c7' } });
check(await until(() => A.state?.phase === 'selecting'), '대치 연출 뒤 카드 선택 단계로');
await call(A.s, 'g:action', { type: 'submit', payload: { cardIds: ['c3_c', 'move_up', 'move_down'] } });
await call(B.s, 'g:action', { type: 'submit', payload: { cardIds: ['move_up', 'move_down', 'move_left'] } });
check(await until(() => A.state?.turn === 2 && A.state?.phase === 'selecting', 20000), '1턴이 끝나고 2턴 카드 선택으로');

const before = {
  hpA: A.state.p1.hp, hpB: A.state.p2.hp,
  enA: A.state.p1.en, enB: A.state.p2.en,
  posA: A.state.p1.pos, turn: A.state.turn,
  nameA: A.state.p1.charName, nameB: A.state.p2.charName,
  deadline: A.state.deadline,
};
check(before.enA < A.state.p1.maxEn, `기력이 실제로 줄어 있다 (${before.enA}/${A.state.p1.maxEn}) — 복원할 상태가 있음`);

await sleep(3500); // 영속화 주기(3초)를 넘긴다
A.s.disconnect(); B.s.disconnect();

const downMs = 9000;
await sleep(downMs);
execSync(`GRACE=60000 tests/server.sh 3300 ${DATA}`, { stdio: 'ignore' });
console.log(`  … 서버 재시작 (다운타임 약 ${Math.round(downMs / 1000)}초)`);

const A2 = await client(null, A.token);
check(A2.user.userId === A.user.userId && A2.lastRoomId === roomId, '재시작 후에도 토큰으로 같은 유저·마지막 방 식별');
const j2 = await call(A2.s, 'room:join', { roomId });
check(j2.ok && j2.snapshot.status === 'playing', '방이 대전 진행 중 상태로 복원');
check(await until(() => !!A2.state), '복원된 판의 뷰가 내려온다');

check(A2.state.moduleId === 'card-battle', '카드 대전 모듈로 복원됐다 (moduleId 가 디스크에 남아 있었다)');
check(
  A2.state.p1.charName === before.nameA && A2.state.p2.charName === before.nameB,
  `양쪽 캐릭터 복원 (${A2.state.p1.charName} / ${A2.state.p2.charName})`,
);
check(
  A2.state.p1.hp === before.hpA && A2.state.p2.hp === before.hpB,
  `체력 복원 (${A2.state.p1.hp} / ${A2.state.p2.hp})`,
);
check(
  A2.state.p1.en === before.enA && A2.state.p2.en === before.enB,
  `기력 복원 (${A2.state.p1.en} / ${A2.state.p2.en})`,
);
check(
  A2.state.p1.pos.row === before.posA.row && A2.state.p1.pos.col === before.posA.col,
  '보드 위치 복원',
);
check(A2.state.turn === before.turn, `턴 수 복원 (${A2.state.turn}턴)`);
check(A2.state.me?.hand.length === 14, '복원 후에도 손패 14장이 뷰에 실린다');
check(A2.state.phase === 'selecting', '카드 선택 단계 그대로');

// 다운타임(9초) < 카드 선택 제한(20초) → 마감이 밀렸을 뿐, 초기화되지도 과거에 남지도 않았다
const left = A2.state.deadline - A2.state.serverNow;
check(left > 0, `마감이 미래에 있다 — 남은 시간 ${Math.round(left / 1000)}초 (과거에 남아 즉시 자동 선택되지 않는다)`);
check(left <= 20_000, `남은 시간이 제한(20초)을 넘지 않는다 (${Math.round(left / 1000)}초)`);

// 그리고 복원된 판에서 실제로 계속 놀 수 있어야 한다
const B2 = await client(null, B.token);
await call(B2.s, 'room:join', { roomId });
await until(() => !!B2.state);
const r1 = await call(A2.s, 'g:action', { type: 'submit', payload: { cardIds: ['c3_c', 'move_up', 'move_down'] } });
const r2 = await call(B2.s, 'g:action', { type: 'submit', payload: { cardIds: ['move_up', 'move_down', 'move_left'] } });
check(r1.ok && r2.ok, '복원된 판에 양쪽이 다시 제출할 수 있다');
check(await until(() => A2.state?.turn === before.turn + 1, 20000), '복원된 판이 다음 턴으로 계속 굴러간다');

console.log(failures ? `\n실패 ${failures}건` : '\n카드 대전 재시작 복원 검사 모두 통과');
A2.s.disconnect(); B2.s.disconnect();
process.exit(failures ? 1 : 0);
