// 카드 대전 AI 연습 판 — 혼자 앉아 브라우저로 한 판 (기준서 0-1 `card-battle-solo`, 10번)
//
// play-cb.mjs 는 창 두 개로 사람 대 사람을 본다. 이 파일은 창 하나다.
// 여기서만 확인되는 것 셋:
//   1. minPlayers 1 짜리 콘텐츠가 혼자 앉았을 때 **실제로 시작되는가**
//   2. ⓪ 의 난이도 전환 버튼이 서버 상태를 바꾸는가 (뷰로 되돌아오는가)
//   3. AI 가 사람을 기다리지 않고 먼저 내서 턴이 혼자서도 도는가
//
// 세션 단위 테스트(unit-cb-session)가 같은 규칙을 가짜 호스트로 이미 본다.
// 그쪽이 규칙이고, 여기는 **배선**이다 — 선반·클릭·뷰 왕복이 실제로 이어져 있는지.
import { launch, newPlayer, sleep, shots } from './lib.mjs';
const S = (p, n) => p.screenshot({ path: `${shots}/${n}.png` });
const log = (...a) => console.log('▶', ...a);
let fails = 0;
const check = (c, m) => { console.log(c ? '  ✔' : '  ✘', m); if (!c) fails++; };

const browser = await launch();
const A = await newPlayer(browser, '혼자');

log('방 만들고 혼자 앉기');
await A.page.click('text=＋ 방 만들기');
await A.page.fill('.modal input[type=password]', '0000');
await A.page.click('.modal button[type=submit]');
await A.page.waitForSelector('.room-screen');
await sleep(1000);

async function walkAndSit(pl, index) {
  for (let tries = 0; tries < 4; tries++) {
    const pos = await pl.page.evaluate((i) => {
      const e = window.__engine; const s = e.seats()[i]; return e.worldToClient(s.x, s.y - 8);
    }, index);
    await pl.page.mouse.click(pos.x, pos.y);
    for (let k = 0; k < 40; k++) {
      await sleep(200);
      if (await pl.page.$('.table-panel')) return true;
    }
  }
  return false;
}
check(await walkAndSit(A, 1), '한 명만 착석');

log('선반에서 AI 연습 고르기');
await A.page.click('.game-box');
await A.page.waitForSelector('.shelf');
const soloItem = await A.page.$('.shelf-item:has-text("카드 대전 — AI 연습")');
check(!!soloItem, '게임 선반에 AI 연습 콘텐츠가 뜸 (listContents 의 두 번째 항목)');
await A.page.click('.shelf-item:has-text("카드 대전 — AI 연습") button.btn.gold');
await sleep(500);
await A.page.click('.table-status button');

// 혼자인데 시작돼야 한다 — minPlayers 2 로 잘못 등록하면 여기서 영원히 안 뜬다
await A.page.waitForSelector('.cb-root', { timeout: 15000 });
await A.page.waitForSelector('.cb-phase-char', { timeout: 5000 });
check(true, '혼자 앉아도 판이 시작됨 (minPlayers 1 확인)');
await sleep(400);
await S(A.page, 'cb-20-solo-character');

log('⓪ 난이도 전환');
const diffButtons = await A.page.$$eval('.cb-diff button', (n) => n.map((e) => e.textContent.trim()));
check(
  diffButtons.length === 2 && diffButtons.includes('Normal') && diffButtons.includes('Hard'),
  `연습 판에서만 난이도 전환이 뜸 (${diffButtons.join(' / ')})`,
);
const onAtFirst = await A.page.$eval('.cb-diff button.on', (n) => n.textContent.trim());
check(onAtFirst === 'Normal', `기본값은 Normal (${onAtFirst})`);

await A.page.click('.cb-diff button:has-text("Hard")');
await sleep(400);
const onAfter = await A.page.$eval('.cb-diff button.on', (n) => n.textContent.trim());
check(onAfter === 'Hard', 'Hard 를 누르면 서버를 거쳐 선택 표시가 옮겨온다');

// 상대 쪽 이름칸 — AI 는 이미 골라 뒀지만 사람에게는 확정 전까지 안 보여야 한다
const foeBefore = await A.page.$eval('.cb-player.foe .cb-name', (n) => n.textContent.trim());
check(foeBefore === '???', 'AI 가 이미 골랐어도 내가 확정하기 전까지는 안 보인다');

log('캐릭터 확정 → ①');
await A.page.click('.cb-char:has-text("C7")');
await sleep(250);
const pickedName = await A.page.$eval('.cb-detail-id', (n) => n.textContent.trim());
check(pickedName === '한서', `고른 캐릭터 이름이 상세에 뜸 (${pickedName})`);
await A.page.click('.cb-detail-foot .cb-confirm');

// 사람이 확정하면 AI 는 이미 골라 뒀으니 바로 대치 → 카드 선택
await A.page.waitForSelector('.cb-phase-select', { timeout: 15000 });
await sleep(400);
const names = await A.page.$$eval('.cb-player .cb-name', (n) => n.map((e) => e.textContent.trim()));
check(names[0] === '한서' && names[1] !== '???', `AI 캐릭터도 공개됨 (${names.join(' vs ')})`);
const diffGone = await A.page.$('.cb-diff');
check(!diffGone, '판이 시작되면 난이도 전환이 사라진다');
await S(A.page, 'cb-21-solo-select');

log('① 제출 → ② 전투 → 다음 턴 (AI 가 혼자 냈는지)');
// 기술 한 장 + 이동 두 장
await A.page.click('.cb-row:nth-child(3) .cb-row-tiles .cb-tile:nth-child(1)');
await sleep(120);
await A.page.click('.cb-row:nth-child(1) .cb-row-tiles .cb-tile:nth-child(1)');
await sleep(120);
await A.page.click('.cb-row:nth-child(1) .cb-row-tiles .cb-tile:nth-child(2)');
await sleep(200);
await A.page.click('.cb-orderpanel .cb-order-foot .cb-confirm');

// AI 가 안 냈으면 여기서 20초 타임아웃까지 멈춘다. 8초 안에 넘어가야 한다.
const wentToBattle = await A.page
  .waitForSelector('.cb-phase-battle', { timeout: 8000 })
  .then(() => true)
  .catch(() => false);
check(wentToBattle, 'AI 가 사람을 기다리지 않고 먼저 내서 바로 전투로 넘어간다');
await sleep(600);
await S(A.page, 'cb-22-solo-battle');

const foePicked = await A.page.$$eval('.cb-picked.foe .cb-picked-one b', (n) => n.map((e) => e.textContent.trim()));
check(foePicked.length === 3, 'AI 가 고른 3장 자리가 아래에 뜬다');
check(foePicked[0] !== '뒷면', `AI 의 첫 장은 열려 있다 (${foePicked[0]})`);
check(foePicked[2] === '뒷면', '아직 안 열린 AI 카드는 뒷면');

await A.page.waitForSelector('.cb-phase-select', { timeout: 20000 });
const turn2 = await A.page.$eval('.cb-turn', (n) => n.textContent.replace(/\s+/g, ' ').trim());
check(/턴\s*2\s*\/\s*20/.test(turn2), `세 장을 다 열면 2턴으로 넘어간다 (${turn2})`);
await S(A.page, 'cb-23-solo-turn2');

log('판이 끝나면 방으로 돌아오는지');
// 이후는 제출하지 않는다. 20초 마감마다 서버가 대신 고르고, 3연속이면 패배로 끝난다.
// 그래서 이 블록은 20초 × 3턴 + 연출 ≈ 90초가 걸린다. 그 값을 내는 이유는 하나다:
// **끝난 뒤 게임 화면이 걷히고 방이 돌아오는지** 는 브라우저 말고는 아무도 확인하지 못한다.
// 여기가 깨지면 사람이 끝난 화면에 갇힌다. 규칙(자동 선택 3연속, endGame 호출)은
// unit-cb-session 이 훨씬 빠르게 보고 있으니 여기서는 화면만 본다.
//
// 결과 오버레이(.cb-result)를 기다리지 않는 것도 의도다 — endGame() 이 곧바로 불려
// 한 프레임만 보일 수 있어서, 잡히면 좋고 놓쳐도 실패가 아니어야 한다.
const sawResult = await A.page
  .waitForSelector('.cb-result', { timeout: 150000 })
  .then(async () => { await S(A.page, 'cb-24-solo-result'); return true; })
  .catch(() => false);

const back = await A.page
  .waitForSelector('.table-panel, .table-hint', { timeout: 30000 })
  .then(() => true)
  .catch(() => false);
check(back, '제출을 멈추면 판이 끝나고 방으로 돌아온다 (연습 판이 영원히 안 끝나지 않는다)');
check(!(await A.page.$('.cb-root')), '게임 화면이 걷혔다 — 끝난 화면에 갇히지 않는다');
if (sawResult) console.log('     (결과 오버레이도 잡혔다)');
await S(A.page, 'cb-25-solo-back');

// 방으로 돌아왔으면 다시 걸어다닐 수 있어야 한다
const before = await A.page.evaluate(() => { const m = window.__members.get(window.__me()); return { x: m.x, y: m.y }; });
await A.page.keyboard.down('ArrowUp'); await sleep(700); await A.page.keyboard.up('ArrowUp');
const after = await A.page.evaluate(() => { const m = window.__members.get(window.__me()); return { x: m.x, y: m.y }; });
check(Math.hypot(after.x - before.x, after.y - before.y) > 5, '판이 끝난 뒤 다시 캐릭터를 움직일 수 있다');

await browser.close();
console.log(fails ? `\n실패 ${fails}건` : '\nAI 연습 판 검사 모두 통과');
process.exit(fails ? 1 : 0);
