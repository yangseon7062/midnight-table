/**
 * 심야 테이블 서버
 * - Express: 정적 파일(빌드된 클라이언트), 업로드 이미지, 운영자 API
 * - Socket.IO: 실시간 로비/월드/채팅/음성 시그널링/게임 액션 (서버 권위)
 *   └ 선택 이유: WebSocket 위에 자동 재연결·ack(요청/응답)·room 브로드캐스트를 제공해
 *     서버 권위 구조와 재접속 복원을 적은 코드로 안정적으로 구현할 수 있다.
 */
import express from 'express';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { Server } from 'socket.io';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { C2S, S2C } from '../../shared/platform';
import { UserStore } from './platform/users';
import { RoomManager } from './platform/roomManager';
import type { GameModuleDefinition } from './platform/gameModule';
import { ScenarioStore } from './modules/murder-mystery/store';
import { createMurderMysteryModule } from './modules/murder-mystery';
import { createCardBattleModule } from './modules/card-battle';
import { createAdminRouter } from './admin/api';

const ROOT = resolve(import.meta.dirname, '../..');
const DATA = resolve(process.env.DATA_DIR ?? join(ROOT, 'data'));
const PORT = Number(process.env.PORT ?? 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'midnight-admin';

const app = express();
// 마이크(getUserMedia)는 https 또는 localhost 에서만 허용된다. 인터넷/LAN 공개 시 SSL_KEY_FILE/SSL_CERT_FILE 을 지정하거나 TLS 리버스 프록시를 쓴다.
const useTls = !!(process.env.SSL_KEY_FILE && process.env.SSL_CERT_FILE);
const http = useTls ? createHttpsServer({ key: readFileSync(process.env.SSL_KEY_FILE!), cert: readFileSync(process.env.SSL_CERT_FILE!) }, app) : createServer(app);
// STUN/TURN 서버 (NAT 뒤 사용자끼리 음성 연결). 예: ICE_SERVERS='[{"urls":"turn:turn.example.com:3478","username":"u","credential":"p"}]'
const ICE_SERVERS = (() => { try { return process.env.ICE_SERVERS ? JSON.parse(process.env.ICE_SERVERS) : [{ urls: 'stun:stun.l.google.com:19302' }]; } catch { console.warn('ICE_SERVERS 형식 오류, 기본값 사용'); return [{ urls: 'stun:stun.l.google.com:19302' }]; } })();
const io = new Server<C2S, S2C>(http, { cors: { origin: true }, pingInterval: 10_000, pingTimeout: 8_000, maxHttpBufferSize: 1e6 });

const scenarios = new ScenarioStore(join(DATA, 'scenarios'));
const modules = new Map<string, GameModuleDefinition>();
const mm = createMurderMysteryModule(scenarios);
modules.set(mm.id, mm);
const cb = createCardBattleModule();
modules.set(cb.id, cb);
// ↑ 새 장르 모듈은 여기서 등록한다: modules.set(other.id, other)
//   등록 순서가 로비의 모듈 목록 순서다. 머더미스터리를 앞에 두는 것을 전제로 한 테스트가 있으니 뒤에 붙인다.
//   서버만 등록하면 게임은 시작되는데 화면이 안 뜬다 — client/src/modules/registry.ts 에도 넣어야 한다.

const users = new UserStore(join(DATA, 'runtime', 'users.json'));
const manager = new RoomManager(io, users, modules, join(DATA, 'runtime', 'rooms.json'));

app.disable('x-powered-by');
app.use('/api/admin', createAdminRouter({ store: scenarios, uploadsDir: join(DATA, 'uploads'), password: ADMIN_PASSWORD, onChanged: () => io.to('lobby').emit('rooms:changed') }));
app.get('/api/config', (_req, res) => res.json({ iceServers: ICE_SERVERS }));
app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: manager.rooms.size, uptime: process.uptime() }));
app.use('/uploads', express.static(join(DATA, 'uploads'), { maxAge: '1h' }));

const clientDist = join(ROOT, 'dist', 'client');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get('/admin', (_req, res) => res.sendFile(join(clientDist, 'admin.html')));
  app.get(/^\/(?!api|uploads|socket\.io).*/, (_req, res) => res.sendFile(join(clientDist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.send('클라이언트가 빌드되지 않았습니다. `npm run build` 후 다시 실행하거나 개발 모드(`npm run dev`)로 http://localhost:5173 에 접속하세요.'));
}

io.on('connection', (socket) => manager.bind(socket));

http.listen(PORT, () => {
  console.log(`\n🕯️  심야 테이블 서버 실행 중: ${useTls ? 'https' : 'http'}://localhost:${PORT}`);
  console.log(`   운영자 에디터: http://localhost:${PORT}/admin  (비밀번호: ${process.env.ADMIN_PASSWORD ? '환경변수 ADMIN_PASSWORD' : ADMIN_PASSWORD})`);
  console.log(`   데이터 폴더: ${DATA}\n`);
});

const shutdown = () => { console.log('\n[server] 종료 중… 상태 저장'); manager.shutdown(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
