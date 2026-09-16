/**
 * 심야 테이블 서버
 * - Express: 정적 파일(빌드된 클라이언트), 업로드 이미지, 운영자 API
 * - Socket.IO: 실시간 로비/월드/채팅/음성 시그널링/게임 액션 (서버 권위)
 *   └ 선택 이유: WebSocket 위에 자동 재연결·ack(요청/응답)·room 브로드캐스트를 제공해
 *     서버 권위 구조와 재접속 복원을 적은 코드로 안정적으로 구현할 수 있다.
 */
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { C2S, S2C } from '../../shared/platform';
import { UserStore } from './platform/users';
import { RoomManager } from './platform/roomManager';
import type { GameModuleDefinition } from './platform/gameModule';
import { ScenarioStore } from './modules/murder-mystery/store';
import { createMurderMysteryModule } from './modules/murder-mystery';
import { createAdminRouter } from './admin/api';

const ROOT = resolve(import.meta.dirname, '../..');
const DATA = resolve(process.env.DATA_DIR ?? join(ROOT, 'data'));
const PORT = Number(process.env.PORT ?? 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'midnight-admin';

const app = express();
const http = createServer(app);
const io = new Server<C2S, S2C>(http, { cors: { origin: true }, pingInterval: 10_000, pingTimeout: 8_000, maxHttpBufferSize: 1e6 });

const scenarios = new ScenarioStore(join(DATA, 'scenarios'));
const modules = new Map<string, GameModuleDefinition>();
const mm = createMurderMysteryModule(scenarios);
modules.set(mm.id, mm);
// ↑ 새 장르 모듈은 여기서 등록한다: modules.set(other.id, other)

const users = new UserStore(join(DATA, 'runtime', 'users.json'));
const manager = new RoomManager(io, users, modules, join(DATA, 'runtime', 'rooms.json'));

app.disable('x-powered-by');
app.use('/api/admin', createAdminRouter({ store: scenarios, uploadsDir: join(DATA, 'uploads'), password: ADMIN_PASSWORD, onChanged: () => io.to('lobby').emit('rooms:changed') }));
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
  console.log(`\n🕯️  심야 테이블 서버 실행 중: http://localhost:${PORT}`);
  console.log(`   운영자 에디터: http://localhost:${PORT}/admin  (비밀번호: ${process.env.ADMIN_PASSWORD ? '환경변수 ADMIN_PASSWORD' : ADMIN_PASSWORD})`);
  console.log(`   데이터 폴더: ${DATA}\n`);
});

const shutdown = () => { console.log('\n[server] 종료 중… 상태 저장'); manager.shutdown(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
