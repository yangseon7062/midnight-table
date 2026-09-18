// 재접속 유예/부재 처리, 게임 중 관전자, 밀담 구역 입장 검증 (소켓 레벨)
import { io } from 'socket.io-client';
const URL = process.env.URL ?? 'http://localhost:3100';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = (s, ev, ...args) => new Promise((res) => s.emit(ev, ...args, res));
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? '  ✔' : '  ✘'} ${msg}`); if (!cond) failures++; };

async function client(name, token) {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { s, name, state: null, chats: [], fixes: [], members: new Map(), zones: [] };
  s.on('g:state', (v) => (c.state = v));
  s.on('room:zones', (z) => (c.zones = z));
  s.on('chat:msg', (m) => c.chats.push(m));
  s.on('m:fix', (f) => c.fixes.push(f));
  s.on('room:member', (m) => c.members.set(m.userId, m));
  await new Promise((r) => s.on('connect', r));
  const a = await call(s, 'auth', token ? { token } : { nickname: name });
  c.user = a.user; c.token = a.token; c.lastRoomId = a.lastRoomId;
  return c;
}
async function walk(c, from, to) {
  let { x, y } = from;
  while (Math.hypot(to.x - x, to.y - y) > 0.5) {
    const d = Math.hypot(to.x - x, to.y - y), k = Math.min(4, d) / d;
    x += (to.x - x) * k; y += (to.y - y) * k;
    c.s.emit('m', { x, y, f: 0, mv: 1 });
    await sleep(52);
  }
  c.s.emit('m', { x, y, f: 0, mv: 0 });
  return { x, y };
}
const pos = (snap, uid) => { const m = snap.members.find((mm) => mm.userId === uid); return { x: m.x, y: m.y }; };

const A = await client('에이');
const B = await client('비');
const r = await call(A.s, 'rooms:create', { title: '재접속 실험', maxMembers: 3 });
const roomId = r.roomId;
const ja = await call(A.s, 'room:join', { roomId });
const jb = await call(B.s, 'room:join', { roomId });
// 좌석까지 이동 (좌석1: x=352,y=222 / 좌석5: x=352,y=286)
let pa = pos(jb.snapshot, A.user.userId), pb = pos(jb.snapshot, B.user.userId);
await Promise.all([
  (async () => { pa = await walk(A, pa, { x: 270, y: pa.y }); pa = await walk(A, pa, { x: 270, y: 222 }); pa = await walk(A, pa, { x: 352, y: 222 }); })(),
  (async () => { pb = await walk(B, pb, { x: 352, y: 286 }); })(),
]);
check((await call(A.s, 'sit', { tableId: 'main', index: 1 })).ok && (await call(B.s, 'sit', { tableId: 'main', index: 5 })).ok, '착석');
await call(A.s, 'table:select', { moduleId: 'murder-mystery', contentId: 'haemugwan' });
// 인원 미달 대기 확인: A만 준비
await call(A.s, 'table:ready', { ready: true });
const t1 = await new Promise((res) => { A.s.once('room:table', res); B.s.emit('table:ready', { ready: false }, () => {}); });
check(t1.startsAt === null, '전원 준비 전에는 자동 시작 카운트다운 없음');
await call(B.s, 'table:ready', { ready: true });
await sleep(4600);
check(A.state?.stage === 'casting', '게임 시작');

// 관전자 입장
const C = await client('관전자씨');
const jc = await call(C.s, 'room:join', { roomId });
check(jc.ok, '게임 중인 방에 관전자로 입장 가능');
await sleep(200);
check(C.state && !C.state.me.participant && C.state.items.length === 0, '관전자는 비공개 정보 없이 관전 뷰만 받음');

await call(A.s, 'g:action', { type: 'pick', payload: { charId: 'seojin' } });
await call(B.s, 'g:action', { type: 'pick', payload: { charId: 'taeo' } });
await call(A.s, 'g:action', { type: 'castReady', payload: { ready: true } });
await call(B.s, 'g:action', { type: 'castReady', payload: { ready: true } });
await sleep(4000);
check(A.state.stage === 'flow', '진행 시작');
// B가 1단계 자료를 열고 연결 끊김
for (const key of B.state.step.myItemKeys) await call(B.s, 'g:action', { type: 'open', payload: { key } });
await call(B.s, 'g:action', { type: 'useCard', payload: { cardId: 'secretary-note' } }).catch(() => {});
await sleep(300);
const bCardsBefore = B.state.cards.map((c) => `${c.id}:${c.usesLeft}`).join(',');
const bToken = B.token;
B.s.disconnect();
await sleep(400);
const bInA = A.state.participants.find((p) => p.userId === B.user.userId);
check(bInA && !bInA.connected && !bInA.absent, 'B 연결 끊김 → 유예 중 표시 (부재 아님)');
for (const key of A.state.step.myItemKeys) await call(A.s, 'g:action', { type: 'open', payload: { key } });
await call(A.s, 'g:action', { type: 'ready', payload: { ready: true } });
await sleep(2200);
check(A.state.step.index === 0, '유예 시간 동안은 B를 기다림 (진행 멈춤)');
check(A.state.participants.every(() => true) && A.chats.some((m) => m.text.includes('재접속을 기다립니다')), '연결 끊김 알림 메시지');
await sleep(2600); // GRACE=4000ms
check(A.state.participants.find((p) => p.userId === B.user.userId).absent, '유예 만료 → B 부재 처리');
await sleep(2200);
check(A.state.step.index >= 1, `부재자는 자동 확인 처리되어 진행 계속 (현재 ${A.state.step.index + 1}단계)`);

// 부재자의 자리는 비워 두지 않는다 — 돌아올 자리를 남에게 내주면 정원을 넘게 된다 (정원 3명 방)
const D = await client('난입씨');
const jd = await call(D.s, 'room:join', { roomId });
check(!jd.ok, `부재자 자리를 다른 사람이 차지하지 못함 (${jd.error ?? '입장됨'})`);
const lounge = await call(D.s, 'rooms:list');
const rs = lounge.rooms.find((x) => x.id === roomId);
check(rs.members === 3, `라운지 목록에도 가득 찬 것으로 보임 (${rs.members}/${rs.maxMembers})`);
D.s.disconnect();

// B 복귀 (같은 토큰)
const B2 = await client(null, bToken);
check(B2.user.userId === B.user.userId && B2.lastRoomId === roomId, '같은 토큰으로 재접속 → 같은 유저, 마지막 방 기억');
const jb2 = await call(B2.s, 'room:join', { roomId });
await sleep(300);
check(jb2.ok && B2.state?.me.charId === 'taeo', '방 복귀 → 원래 캐릭터(강태오) 복원');
check(jb2.snapshot.members.length === 3, `복귀 후에도 정원을 넘지 않음 (${jb2.snapshot.members.length}/3명)`);
check(B2.state.items.filter((i) => i.stepIndex === 0).every((i) => i.opened), '열람했던 자료의 열람 상태 복원');
check(B2.state.cards.map((c) => `${c.id}:${c.usesLeft}`).join(',') === bCardsBefore, `카드 사용 횟수 복원 (${bCardsBefore})`);
const bPos = jb2.snapshot.members.find((m) => m.userId === B.user.userId);
check(Math.abs(bPos.x - 352) < 3 && Math.abs(bPos.y - 286) < 3, '위치 복원 (앉아 있던 자리)');
check(!A.state.participants.find((p) => p.userId === B.user.userId).absent, 'A 화면에서도 B 복귀 반영');
check(jb2.history.length > 5 && jb2.history.some((m) => m.text.includes('배역')), '복귀 시 채팅 기록(자기에게 전달됐던 것) 복원');

// 밀담 구역에는 인원 제한이 없다 — 들어가려는 행동을 막지 않는다
const walkGallery = async (c, start) => { let p = await walk(c, start, { x: 440, y: start.y }); p = await walk(c, p, { x: 440, y: 392 }); return walk(c, p, { x: 504, y: 392 }); };
const snap = jb2.snapshot;
const pA = pos(snap, A.user.userId), pC = pos(snap, C.user.userId), pB = pos(snap, B.user.userId);
A.s.emit('stand'); B2.s.emit('stand');
await Promise.all([walkGallery(A, pA), walkGallery(B2, pB)]);
await sleep(300);
C.fixes.length = 0;
await walkGallery(C, pC);
await sleep(400);
const blocked = C.fixes.map((f) => f.reason).filter(Boolean);
check(blocked.length === 0, `세 번째 사람도 제한 없이 구역에 입장 (${blocked[0] ?? '차단 없음'})`);
const gallery = C.zones.find((z) => z.name.includes('회랑'));
check(gallery?.occupants?.length === 3, `구역 밖에서도 인원 수가 보임 (${gallery?.occupants?.length ?? '?'}명)`);

console.log(failures ? `\n실패 ${failures}건` : '\n재접속/관전/구역 검사 모두 통과');
process.exit(failures ? 1 : 0);
