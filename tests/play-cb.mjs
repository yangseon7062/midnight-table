// 카드 대전 2인 브라우저 플레이: 방 → 착석 → 게임 선택 → ⓪ 캐릭터 → ① 카드 → ② 전투
// 기준서 13번 「플랫폼 결합」의 화면 항목을 실제 창 두 개로 확인한다.
import { launch, newPlayer, sleep, shots } from './lib.mjs';
const S = (p, n) => p.screenshot({ path: `${shots}/${n}.png` });
const log = (...a) => console.log('▶', ...a);
let fails = 0;
const check = (c, m) => { console.log(c ? '  ✔' : '  ✘', m); if (!c) fails++; };

const browser = await launch();
const A = await newPlayer(browser, '두리');
const B = await newPlayer(browser, '이든');

log('방 생성 & 입장');
await A.page.click('text=＋ 방 만들기');
await A.page.fill('.modal input[type=password]', '0000');
await A.page.click('.modal button[type=submit]');
await A.page.waitForSelector('.room-screen');
await sleep(1200);
await B.page.reload();
await B.page.waitForSelector('.room-card', { timeout: 10000 });
await B.page.click('.room-card:has-text("두리의 테이블")');
await B.page.waitForSelector('.modal input[type=password]');
await B.page.fill('.modal input[type=password]', '0000');
await B.page.click('.modal button[type=submit]');
await B.page.waitForSelector('.room-screen');
await sleep(800);

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
log('걸어가서 착석');
const [sa, sb] = await Promise.all([walkAndSit(A, 1), walkAndSit(B, 5)]);
check(sa && sb, '두 사람 모두 착석');

log('테이블에서 카드 대전 고르기');
await A.page.click('.game-box');
await A.page.waitForSelector('.shelf');
const shelfHas = await A.page.$('.shelf-item:has-text("1:1 카드 대전")');
check(!!shelfHas, '게임 선반에 카드 대전이 뜸 (서버 모듈 + listContents 등록 확인)');
await A.page.click('.shelf-item:has-text("1:1 카드 대전") button.btn.gold');
await sleep(500);
await A.page.click('.table-status button');
await B.page.waitForSelector('.game-box.open');
await B.page.click('.table-status button');

// 클라이언트 레지스트리 등록이 빠지면 세션은 시작돼도 이 화면이 끝내 안 뜬다.
await A.page.waitForSelector('.cb-root', { timeout: 15000 });
check(true, '카드 대전 화면이 올라옴 (클라이언트 레지스트리 등록 확인)');
await A.page.waitForSelector('.cb-phase-char', { timeout: 5000 });
await sleep(400);
await S(A.page, 'cb-10-character');

log('⓪ 캐릭터 선택');
const rosterCount = await A.page.$$eval('.cb-char', (n) => n.length);
check(rosterCount === 8, '8명이 격자에 뜸');
await A.page.click('.cb-char:has-text("C1")');
await sleep(250);
const skillRows = await A.page.$$eval('.cb-skill', (n) => n.length);
check(skillRows === 4, '고른 캐릭터의 기술 4장이 옆에 뜸');
const foeHidden = await B.page.$$eval('.cb-player.foe .cb-name', (n) => n[0]?.textContent ?? '');
check(foeHidden === '???', '상대가 무엇을 골랐는지는 확정 전까지 안 보임');
await A.page.click('.cb-detail-foot .cb-confirm');
await B.page.click('.cb-char:has-text("C5")');
await sleep(250);
await B.page.click('.cb-detail-foot .cb-confirm');

log('① 카드 선택');
await A.page.waitForSelector('.cb-phase-select', { timeout: 15000 });
await sleep(400);
const turnText = await A.page.$eval('.cb-turn', (n) => n.textContent.replace(/\s+/g, ' ').trim());
check(/턴\s*1\s*\/\s*20/.test(turnText), `① 에 턴 수가 n / 20 으로 보임 (${turnText})`);
const handCount = await A.page.$$eval('.cb-row-tiles .cb-tile', (n) => n.length);
check(handCount === 14, '손패 14장');
const rowCount = await A.page.$$eval('.cb-row', (n) => n.length);
check(rowCount === 3, '손패가 세 줄 (이동 / 방어·보조 / 기술)');
await S(A.page, 'cb-11-select');

log('기력 빗금 = 실제 차감');
const enBefore = await A.page.$eval('.cb-player.me .cb-bar-n.en', (n) => n.textContent.trim());
// 기술 한 장 + 이동 두 장 — 이동은 기력 0 이라 차감은 기술 값 그대로다
await A.page.click('.cb-row:nth-child(3) .cb-row-tiles .cb-tile:nth-child(1)');
await sleep(150);
await A.page.click('.cb-row:nth-child(1) .cb-row-tiles .cb-tile:nth-child(1)');
await sleep(150);
await A.page.click('.cb-row:nth-child(1) .cb-row-tiles .cb-tile:nth-child(2)');
await sleep(250);
const spendText = await A.page.$eval('.cb-orderpanel .cb-order-foot .cb-dim', (n) => n.textContent.trim());
const predicted = Number(/남을 기력 (\d+)/.exec(spendText)?.[1] ?? NaN);
check(Number.isFinite(predicted), `확정 전에 남을 기력이 보임 (${spendText})`);
const hatch = await A.page.$$eval('.cb-bar-spend', (n) => n.length);
check(hatch === 1, '기력 바에 금색 빗금이 떠 있음');
await S(A.page, 'cb-12-spend');
await A.page.click('.cb-orderpanel .cb-order-foot .cb-confirm');

// B 는 이동 세 장 (기력 0)
await B.page.click('.cb-row:nth-child(1) .cb-row-tiles .cb-tile:nth-child(1)');
await B.page.click('.cb-row:nth-child(1) .cb-row-tiles .cb-tile:nth-child(2)');
await B.page.click('.cb-row:nth-child(1) .cb-row-tiles .cb-tile:nth-child(3)');
await sleep(200);
await B.page.click('.cb-orderpanel .cb-order-foot .cb-confirm');

log('② 전투');
await A.page.waitForSelector('.cb-phase-battle', { timeout: 15000 });
await sleep(600);
const handGone = await A.page.$('.cb-hand');
check(!handGone, '전투 화면에서 손패가 보이지 않음');
const battleTurn = await A.page.$eval('.cb-turn', (n) => n.textContent.replace(/\s+/g, ' ').trim());
check(/턴\s*1\s*\/\s*20/.test(battleTurn), `② 에도 턴 수가 같은 자리에 보임 (${battleTurn})`);
const picked = await A.page.$$eval('.cb-picked', (n) => n.length);
check(picked === 2, '고른 3장이 양쪽 모두 아래에 남음');
await S(A.page, 'cb-13-battle');

const openedFirst = await A.page.$$eval('.cb-picked.me .cb-picked-one b', (n) => n.map((e) => e.textContent.trim()));
check(openedFirst[1] === '뒷면' || openedFirst[2] === '뒷면', '아직 안 열린 슬롯은 뒷면으로 남아 있음');

log('다음 턴 — 실제 차감 확인');
await A.page.waitForSelector('.cb-phase-select', { timeout: 20000 });
await sleep(400);
const enAfter = await A.page.$eval('.cb-player.me .cb-bar-n.en', (n) => n.textContent.trim());
const actual = Number(enAfter.split('/')[0]);
check(actual === predicted, `빗금의 예상(${predicted})과 실제 차감(${enAfter})이 일치 — 시작 ${enBefore}`);
const turn2 = await A.page.$eval('.cb-turn', (n) => n.textContent.replace(/\s+/g, ' ').trim());
check(/턴\s*2\s*\/\s*20/.test(turn2), `세 장을 다 열면 다음 턴으로 (${turn2})`);
await S(A.page, 'cb-14-turn2');

await browser.close();
console.log(fails ? `\n실패 ${fails}건` : '\n카드 대전 UI 검사 모두 통과');
process.exit(fails ? 1 : 0);
