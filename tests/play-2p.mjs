// 2인 전체 플레이 (실제 브라우저 UI 조작): 방 → 착석 → 시나리오 → 캐스팅 → 봉투/설정집/단서 → 카드 → 투표 → 엔딩
import { launch, newPlayer, sleep, shots } from './lib.mjs';
const S = (p, n) => p.screenshot({ path: `${shots}/${n}.png` });
const log = (...a) => console.log('▶', ...a);
let fails = 0;
const check = (c, m) => { console.log(c ? '  ✔' : '  ✘', m); if (!c) fails++; };

const browser = await launch();
const A = await newPlayer(browser, '앨리스');
const B = await newPlayer(browser, '밥');

log('방 생성 (비밀번호)');
await A.page.click('text=＋ 방 만들기');
await A.page.fill('.modal input[type=password]', '0000');
await A.page.click('.modal button[type=submit]');
await A.page.waitForSelector('.room-screen');
await B.page.click('text=새로고침').catch(() => {});
await sleep(1200);
await B.page.reload(); await B.page.waitForSelector('.room-card', { timeout: 10000 });
await B.page.click('.room-card:has-text("앨리스의 테이블")');
await B.page.waitForSelector('.modal input[type=password]');
await S(B.page, '10-password');
await B.page.fill('.modal input[type=password]', '0000');
await B.page.click('.modal button[type=submit]');
await B.page.waitForSelector('.room-screen');
await sleep(800);

async function walkAndSit(pl, index) {
  for (let tries = 0; tries < 4; tries++) {
    const pos = await pl.page.evaluate((i) => { const e = window.__engine; const s = e.seats()[i]; return e.worldToClient(s.x, s.y - 8); }, index);
    await pl.page.mouse.click(pos.x, pos.y);
    for (let k = 0; k < 40; k++) {
      await sleep(200);
      if (await pl.page.$('.table-panel')) return true;
    }
  }
  return false;
}
log('걸어가서 착석');
const [sa, sb] = await Promise.all([walkAndSit(A, 1), walkAndSit(B, 5)]);
check(sa && sb, '두 사람 모두 테이블 착석 (클릭 이동 → 자동 앉기)');
await S(A.page, '11-seated');

log('시나리오 선택 & 준비');
await A.page.click('.game-box');
await A.page.waitForSelector('.shelf');
await S(A.page, '12-shelf');
await A.page.click('.shelf-item button.btn.gold');
await sleep(500);
await A.page.click('.table-status button');
await B.page.waitForSelector('.game-box.open');
await B.page.click('.table-status button');
await sleep(1500);
await S(B.page, '13-countdown');
await A.page.waitForSelector('.mm-casting', { timeout: 10000 });
await sleep(2200);
await S(A.page, '14-casting');

log('캐스팅');
await A.page.click('.cast-card:has-text("한서진")');
await sleep(300);
await B.page.click('.cast-card:has-text("강태오")');
await sleep(300);
await A.page.click('.casting-foot button.btn.lg');
await B.page.click('.casting-foot button.btn.lg');
await A.page.waitForSelector('.step-transition', { timeout: 10000 });
await sleep(700);
await S(A.page, '15-transition');
await A.page.waitForSelector('.step-transition', { state: 'detached', timeout: 6000 });
await A.page.waitForSelector('.guide', { timeout: 3000 });
await sleep(400);
await S(A.page, '15b-guide');
await dismissGuide(A); await dismissGuide(B);

async function dismissGuide(pl) { const g = await pl.page.$('.guide button'); if (g) { await g.click(); await sleep(200); } }
async function openEnvelope(pl, shotPrefix) {
  await dismissGuide(pl);
  const btn = await pl.page.$('.mailbox');
  if (!btn) return false;
  await btn.click();
  await pl.page.waitForSelector('.envelope, .spread');
  if (await pl.page.$('.envelope')) {
    await sleep(900);
    const wax = await pl.page.$('.wax');
    const box = await wax.boundingBox();
    await pl.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await pl.page.mouse.down();
    for (let i = 1; i <= 10; i++) { await pl.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - i * 12); await sleep(30); }
    if (shotPrefix) await S(pl.page, `${shotPrefix}-env-drag`);
    for (let i = 11; i <= 20; i++) { await pl.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - i * 12); await sleep(20); }
    await pl.page.mouse.up();
    await pl.page.waitForSelector('.spread');
  }
  await sleep(900);
  const cards = await pl.page.$$('.spread-card:not(.face)');
  for (const c of cards) { await c.click(); await sleep(250); }
  await sleep(700);
  if (shotPrefix) await S(pl.page, `${shotPrefix}-spread`);
  return true;
}
async function closeSpread(pl) { const b = await pl.page.$('.spread button.btn.lg'); if (b) await b.click(); await sleep(300); }
async function readyUp(pl) {
  await dismissGuide(pl);
  const b = await pl.page.$('.phase-actions button.btn');
  if (!b) return false;
  const t = await b.textContent();
  if (t.includes('확인함')) return true;
  await b.click(); await sleep(300); return true;
}
async function stepIndex(pl) { return pl.page.evaluate(() => { const t = document.querySelector('.phase-title .mono')?.textContent; return t ? Number(t.split('/')[0]) : -1; }); }
async function waitStep(pl, n) { for (let i = 0; i < 60; i++) { if ((await stepIndex(pl)) === n && !(await pl.page.$('.step-transition'))) return true; await sleep(250); } return false; }

log('1단계: 프롤로그 봉투');
await openEnvelope(A, '16');
// 설정집 읽기 → 페이지 넘기기
await A.page.click('.spread-card.sheet');
await A.page.waitForSelector('.book');
await sleep(600);
await S(A.page, '17-dossier-sheet');
const corner = await A.page.$('.corner.right');
check(!!corner || (await A.page.$$('.tab')).length >= 1, '사건 파일 열림');
if (corner) {
  const bb = await corner.boundingBox();
  await A.page.mouse.move(bb.x + bb.width - 5, bb.y + bb.height - 5);
  await A.page.mouse.down();
  for (let i = 1; i <= 8; i++) { await A.page.mouse.move(bb.x + bb.width - 5 - i * 40, bb.y + bb.height - 5 - i * 4); await sleep(30); }
  await S(A.page, '18-page-turning');
  await A.page.mouse.up();
  await sleep(600);
  await S(A.page, '19-dossier-common');
}
await A.page.keyboard.press('Escape');
await sleep(300);
await closeSpread(A);
const aItems = await A.page.evaluate(() => document.querySelectorAll('.spread-card').length);
check(aItems === 0, '봉투 정리 후 닫힘');
await readyUp(A);
await openEnvelope(B);
await closeSpread(B);
await readyUp(B);
check(await waitStep(A, 2), '전원 확인 → 2단계 진행');
await S(A.page, '20-phase-discussion');

log('채팅');
await A.page.click('.chat-input input');
await A.page.keyboard.type('서진입니다. 저는 10시부터 응접실에 있었어요.');
await A.page.keyboard.press('Enter');
await sleep(600);
const bSaw = await B.page.evaluate(() => [...document.querySelectorAll('.chat-line')].some((l) => l.textContent.includes('응접실에 있었어요')));
check(bSaw, '공용 채팅 전달');
await S(B.page, '21-chat-bubble');

log('B 새로고침 → 복원');
const bBefore = await B.page.evaluate(() => document.querySelector('.my-role b')?.textContent);
await B.page.reload();
await B.page.waitForSelector('.phase-bar', { timeout: 15000 });
await sleep(800);
const bAfter = await B.page.evaluate(() => document.querySelector('.my-role b')?.textContent);
check(bBefore === bAfter && bAfter === '강태오', `새로고침 후 같은 캐릭터 복귀 (${bAfter})`);
const bMail = await B.page.$('.mailbox');
check(!bMail, '열람 상태 복원 (열었던 봉투가 다시 봉인되지 않음)');

await readyUp(A); await readyUp(B);
check(await waitStep(A, 3), '3단계 (현장 조사)');
await openEnvelope(A, '22');
// 단서 뷰어
const clueCard = await A.page.$('.spread-card.clue img');
if (clueCard) {
  await clueCard.click();
  await A.page.waitForSelector('.viewer');
  await sleep(500);
  await A.page.mouse.move(700, 450);
  for (let i = 0; i < 4; i++) { await A.page.mouse.wheel(0, -200); await sleep(60); }
  await sleep(300);
  await S(A.page, '23-viewer-zoom');
  await A.page.click('text=🔍 돋보기');
  await A.page.mouse.move(760, 420);
  await sleep(200);
  await S(A.page, '24-viewer-loupe');
  await A.page.keyboard.press('Escape');
  await sleep(300);
  await A.page.keyboard.press('Escape').catch(() => {});
}
await A.page.evaluate(() => document.querySelector('.dossier-back')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
await sleep(300);
if (await A.page.$('.cork')) { await A.page.click('.cork .btn.ghost'); }
await closeSpread(A);
await readyUp(A);
await openEnvelope(B); await closeSpread(B); await readyUp(B);
check(await waitStep(A, 4), '4단계 (1차 토론, 밀담 구역 열림)');
await S(A.page, '25-zones-open');
await readyUp(A); await readyUp(B);
check(await waitStep(A, 5), '5단계 (떠오른 기억 — 개인 자료)');
await openEnvelope(B, '26'); await closeSpread(B); await readyUp(B);
await openEnvelope(A); await closeSpread(A); await readyUp(A);
const aHasWill = await A.page.evaluate(() => JSON.stringify(window.__mmItems?.() ?? ''));
void aHasWill;
check(await waitStep(A, 6), '6단계 (추가 조사)');
await openEnvelope(A); await closeSpread(A); await readyUp(A);
await openEnvelope(B); await closeSpread(B); await readyUp(B);
check(await waitStep(A, 7), '7단계 (심문과 밀담)');

log('타이머 연장 & 카드 사용');
await A.page.click('.extend');
await sleep(400);
const ext2 = await B.page.$eval('.extend', (e) => e.disabled);
check(ext2, '연장 후 다른 사람 버튼 쿨타임');
await S(B.page, '27-extend-cooldown');
const card = await B.page.$('.game-card');
const cb = await card.boundingBox();
await B.page.mouse.move(cb.x + cb.width / 2, cb.y + 30);
await B.page.mouse.down();
for (let i = 1; i <= 12; i++) { await B.page.mouse.move(cb.x + cb.width / 2 + i * 3, cb.y + 30 - i * 22); await sleep(25); }
await S(B.page, '28-card-drag');
await B.page.mouse.up();
await B.page.waitForSelector('.card-confirm');
await B.page.fill('.confirm-side input', '한서진에게 — 22시 40분');
await S(B.page, '29-card-confirm');
await B.page.click('text=테이블에 내려놓기');
await A.page.waitForSelector('.spotlight', { timeout: 5000 });
await sleep(900);
await S(A.page, '30-card-spotlight');
await sleep(3000);
await readyUp(A); await readyUp(B);
check(await waitStep(A, 8), '8단계 (결정적 증거)');
await openEnvelope(A); await closeSpread(A); await readyUp(A);
await openEnvelope(B); await closeSpread(B); await readyUp(B);
check(await waitStep(A, 9), '9단계 (최종 토론)');
await readyUp(A); await readyUp(B);
check(await waitStep(A, 10), '10단계 (투표)');
await A.page.waitForSelector('.vote-board');
await sleep(600);

async function stampVote(pl, name, shot) {
  const tool = await pl.page.$('.stamp-tool');
  const tb = await tool.boundingBox();
  const target = await pl.page.$(`.suspect:has-text("${name}")`);
  const gb = await target.boundingBox();
  await pl.page.mouse.move(tb.x + 40, tb.y + 60);
  await pl.page.mouse.down();
  const steps = 15;
  for (let i = 1; i <= steps; i++) { await pl.page.mouse.move(tb.x + 40 + ((gb.x + gb.width / 2) - (tb.x + 40)) * i / steps, tb.y + 60 + ((gb.y + gb.height / 2) - (tb.y + 60)) * i / steps); await sleep(25); }
  if (shot) await S(pl.page, shot);
  await pl.page.mouse.up();
  await sleep(700);
  const hold = await pl.page.$('.hold-confirm');
  const hb = await hold.boundingBox();
  await pl.page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await pl.page.mouse.down();
  await sleep(1300);
  await pl.page.mouse.up();
  await sleep(400);
}
log('투표');
await stampVote(A, '한기현', '31-vote-drag');
await S(A.page, '32-vote-confirmed');
await stampVote(B, '한기현');
await A.page.waitForSelector('.ending-back', { timeout: 8000 });
await sleep(1500);
await S(A.page, '33-ending-tally');
await A.page.waitForSelector('.culprit-card', { timeout: 10000 });
await sleep(2400);
await S(A.page, '34-ending-reveal');
await A.page.waitForSelector('.outcome', { timeout: 10000 });
await sleep(800);
await S(A.page, '35-ending-result');
const outcome = await A.page.$eval('.outcome-stamp', (e) => e.textContent);
check(outcome.includes('검거 성공'), `엔딩 결과: ${outcome}`);
await A.page.click('text=사건의 진상과 결말 펼쳐보기');
await sleep(600);
await S(A.page, '36-ending-truth');
await A.page.click('text=🎭 인물별 결말');
await sleep(400);
await S(A.page, '37-ending-chars');
await A.page.click('text=테이블 정리하고 방으로 돌아가기');
await B.page.click('text=사건의 진상과 결말 펼쳐보기').catch(() => {});
await sleep(500);
await B.page.click('text=테이블 정리하고 방으로 돌아가기').catch(async () => { await sleep(4000); await B.page.click('text=사건의 진상과 결말 펼쳐보기'); await B.page.click('text=테이블 정리하고 방으로 돌아가기'); });
await sleep(1500);
const back = await A.page.$('.table-panel, .table-hint');
check(!!back, '엔딩 후 방(대기 상태)으로 복귀');
const before = await A.page.evaluate(() => { const m = window.__members.get(window.__me()); return { x: m.x, y: m.y }; });
await A.page.keyboard.down('ArrowUp'); await sleep(700); await A.page.keyboard.up('ArrowUp');
const after = await A.page.evaluate(() => { const m = window.__members.get(window.__me()); return { x: m.x, y: m.y }; });
check(Math.hypot(after.x - before.x, after.y - before.y) > 5, '게임 종료 후 다시 캐릭터를 움직일 수 있음');
await S(A.page, '38-back-to-room');
console.log(fails ? `\n실패 ${fails}건` : '\n모든 UI 검사 통과');
await browser.close();
process.exit(fails ? 1 : 0);
