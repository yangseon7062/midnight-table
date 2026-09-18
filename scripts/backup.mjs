// 데이터 백업: 시나리오 · 업로드 이미지 · 진행 중 방/유저 스냅샷을 통째로 복사한다.
// 유실되면 곤란한 것은 전부 data/ 안에 있으므로 이 폴더만 지키면 된다.
//   npm run backup              → backups/2026-09-18_1430/
//   npm run backup -- --keep 5  → 최근 5개만 남기고 정리 (기본 10)
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const DATA = resolve(process.env.DATA_DIR ?? join(ROOT, 'data'));
const OUT = resolve(process.env.BACKUP_DIR ?? join(ROOT, 'backups'));
const keepArg = process.argv.indexOf('--keep');
const KEEP = keepArg > -1 ? Math.max(1, Number(process.argv[keepArg + 1]) || 10) : 10;

const d = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}`;
const dest = join(OUT, stamp);

if (!existsSync(DATA)) { console.error(`✖ 데이터 폴더가 없습니다: ${DATA}`); process.exit(1); }
mkdirSync(dest, { recursive: true });

const bytes = (dir) => !existsSync(dir) ? 0 : readdirSync(dir, { withFileTypes: true })
  .reduce((n, e) => n + (e.isDirectory() ? bytes(join(dir, e.name)) : statSync(join(dir, e.name)).size), 0);
const mb = (n) => `${(n / 1048576).toFixed(2)}MB`;

const parts = [];
for (const name of ['scenarios', 'uploads', 'runtime']) {
  const src = join(DATA, name);
  if (!existsSync(src)) { parts.push(`${name}: 없음`); continue; }
  cpSync(src, join(dest, name), { recursive: true });
  parts.push(`${name}: ${mb(bytes(src))}`);
}

// 어느 코드 시점의 데이터인지 같이 남긴다 (복원할 때 짝을 맞추기 위해)
let commit = '(git 정보 없음)';
try { commit = execSync('git log -1 --format="%h %s"', { cwd: ROOT }).toString().trim(); } catch {}
writeFileSync(join(dest, 'BACKUP_INFO.txt'), [
  `백업 시각: ${d.toLocaleString('ko-KR')}`,
  `데이터 폴더: ${DATA}`,
  `코드 커밋: ${commit}`,
  ...parts.map((s) => `  ${s}`),
  '',
  '복원: 이 폴더 안의 scenarios/uploads/runtime 을 data/ 아래로 덮어쓰면 됩니다.',
  '(서버를 멈춘 뒤 복원하세요. 켜져 있으면 3초마다 runtime 이 다시 덮어써집니다)',
].join('\n'));

const olds = readdirSync(OUT).filter((n) => /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(n)).sort();
const drop = olds.slice(0, Math.max(0, olds.length - KEEP));
for (const n of drop) rmSync(join(OUT, n), { recursive: true, force: true });

console.log(`✅ 백업 완료 → backups/${stamp}  (${parts.join(', ')})`);
if (drop.length) console.log(`   오래된 백업 ${drop.length}개 정리 (최근 ${KEEP}개 유지)`);
