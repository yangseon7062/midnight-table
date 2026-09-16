// 전체 검증: 빌드 → 규칙 단위 테스트 → 서버 로직 → 재접속/관전/정원 → 서버 재시작 복원 → 2인 UI 플레이 → 3인 구역 격리 → 에디터
import { execSync } from 'node:child_process';
const run = (label, cmd, env = {}) => {
  console.log(`\n━━ ${label} ━━`);
  execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });
};
run('클라이언트 빌드', 'npx vite build --config client/vite.config.ts --logLevel warn');
run('타입 검사', 'npx tsc -p tsconfig.json --noEmit');
run('규칙 단위 테스트', 'npx tsx tests/unit-mm.test.ts');
run('서버 시작 (3100, 유예 4초)', 'tests/server.sh 3100 /tmp/claude-0/data-t3100', { FRESH: '1', GRACE: '4000' });
run('서버 로직 스모크', 'node tests/smoke-server.mjs', { URL: 'http://localhost:3100' });
run('서버 재시작 (3100, 유예 4초)', 'tests/server.sh 3100 /tmp/claude-0/data-t3100', { FRESH: '1', GRACE: '4000' });
run('재접속·관전·정원', 'node tests/smoke-reconnect.mjs', { URL: 'http://localhost:3100' });
run('서버 재시작 복원', 'node tests/smoke-restart.mjs');
run('서버 시작 (3000)', 'tests/server.sh 3000 /tmp/claude-0/data-e2e', { FRESH: '1' });
run('2인 전체 플레이 (브라우저 UI)', 'node tests/play-2p.mjs');
run('3인 밀담 구역 격리 (텍스트+음성)', 'node tests/zones-3p.mjs');
run('운영자 시나리오 에디터', 'node tests/editor.mjs');
console.log('\n✅ 모든 검증 통과');
