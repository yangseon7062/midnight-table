// 밀담 구역 격리 검증: 같은 방에 3명 — A·B는 서재(구역) 안, C는 홀(구역 밖)
// 텍스트: 구역 안 대화가 C에게 안 보이는지 / 공용 대화가 A·B에게 안 보이는지
// 음성: 실제 WebRTC 연결이 같은 채널끼리만 생기고 오디오 바이트가 흐르는지
import { launch, newPlayer, sleep, shots } from './lib.mjs';
let fails = 0;
const check = (c, m) => { console.log(c ? '  ✔' : '  ✘', m); if (!c) fails++; };
const browser = await launch();
const A = await newPlayer(browser, '에이');
const B = await newPlayer(browser, '비');
const C = await newPlayer(browser, '씨');

await A.page.click('text=＋ 방 만들기');
await A.page.fill('.modal input.input', '구역 격리 실험실');
await A.page.click('.modal button[type=submit]');
await A.page.waitForSelector('.room-screen');
for (const p of [B, C]) {
  await p.page.reload();
  await p.page.waitForSelector('.room-card:has-text("구역 격리 실험실")', { timeout: 10000 });
  await p.page.click('.room-card:has-text("구역 격리 실험실")');
  await p.page.waitForSelector('.room-screen');
}
await sleep(1000);

// 모두 마이크 켜기 (가짜 마이크 장치)
for (const p of [A, B, C]) { await p.page.click('.ctl.mic'); }
await sleep(2500);
const peersBefore = await Promise.all([A, B, C].map((p) => p.page.evaluate(() => window.__voice.peers())));
check(peersBefore.every((l) => l.length === 2), `공용 공간: 모두 서로 음성 연결 (${peersBefore.map((l) => l.length).join('/')})`);

async function walkTo(pl, wx, wy) {
  for (let t = 0; t < 3; t++) {
    await pl.page.evaluate(([x, y]) => window.__engine.goTo(x, y), [wx, wy]);
    for (let i = 0; i < 50; i++) {
      await sleep(200);
      const d = await pl.page.evaluate(([x, y]) => { const e = window.__engine; const me = [...window.__members.values()].find((m) => m.userId === window.__me()); return Math.hypot(me.x - x, me.y - y); }, [wx, wy]);
      if (d < 12) return true;
    }
  }
  return false;
}
const [wa, wb] = await Promise.all([walkTo(A, 5 * 16, 6 * 16), walkTo(B, 8 * 16, 6 * 16)]);
check(wa && wb, 'A·B 서재로 걸어 들어감');
await sleep(2500);

const zoneChannels = await Promise.all([A, B, C].map((p) => p.page.evaluate(() => document.querySelector('.chat-head')?.textContent)));
check(zoneChannels[0].includes('서재') && zoneChannels[1].includes('서재') && zoneChannels[2].includes('공용'), `채팅 채널 표시: ${zoneChannels.map((s) => s.slice(0, 12)).join(' | ')}`);

const say = async (p, text) => { await p.page.click('.chat-input input'); await p.page.keyboard.type(text); await p.page.keyboard.press('Enter'); await sleep(500); };
const saw = (p, text) => p.page.evaluate((t) => [...document.querySelectorAll('.chat-line')].some((l) => l.textContent.includes(t)), text);

await say(A, '진범은 동생이야, 조용히 해');
await sleep(600);
check(await saw(B, '진범은 동생이야'), '구역 안 B는 A의 속삭임을 받음');
check(!(await saw(C, '진범은 동생이야')), '구역 밖 C는 A의 속삭임을 받지 못함 (텍스트 격리)');
await say(C, '다들 어디 갔어요?');
await sleep(600);
check(!(await saw(A, '다들 어디 갔어요')) && !(await saw(B, '다들 어디 갔어요')), '구역 안 A·B는 바깥 C의 공용 대화를 받지 못함');

// 말풍선도 격리되는지 (C 화면에서 A의 말풍선이 없어야 함)
const bubbleOnC = await C.page.evaluate(() => [...window.__members.values()].some((m) => m.bubble && m.bubble.text.includes('진범은')));
check(!bubbleOnC, 'C 화면에 A의 말풍선이 뜨지 않음');

// 누가 구역에 있는지는 밖에서도 보임
const occOnC = await C.page.evaluate(() => [...document.querySelectorAll('.people li')].map((li) => li.textContent).join('|'));
check(occOnC.includes('서재'), `구역 밖 C도 누가 서재에 있는지 볼 수 있음`);
await C.page.screenshot({ path: `${shots}/40-zone-outside-view.png` });
await A.page.screenshot({ path: `${shots}/41-zone-inside-view.png` });

// 음성
await sleep(2000);
const peers = await Promise.all([A, B, C].map((p) => p.page.evaluate(() => window.__voice.peers())));
const ids = await Promise.all([A, B, C].map((p) => p.page.evaluate(() => window.__me())));
check(peers[0].length === 1 && peers[0][0].id === ids[1], `A의 음성 연결은 B 하나뿐 (${JSON.stringify(peers[0])})`);
check(peers[1].length === 1 && peers[1][0].id === ids[0], 'B의 음성 연결은 A 하나뿐');
check(peers[2].length === 0, `C는 아무와도 음성 연결 없음 (${peers[2].length})`);
const s1 = await A.page.evaluate(() => window.__voice.stats());
await sleep(2000);
const s2 = await A.page.evaluate(() => window.__voice.stats());
const flow = (s2[ids[1]] ?? 0) - (s1[ids[1]] ?? 0);
check(flow > 0, `A가 B의 오디오를 실제로 수신 중 (2초간 ${flow} bytes)`);
const micShown = await C.page.evaluate((idA) => window.__members.get(idA)?.mic, ids[0]);
check(micShown === 'on', 'C에게도 A의 마이크 켜짐 상태가 표시됨');

// A가 마이크를 끄면 모두에게 반영
await A.page.click('.ctl.mic');
await sleep(800);
const micOff = await C.page.evaluate((idA) => window.__members.get(idA)?.mic, ids[0]);
check(micOff === 'off', 'A 마이크 끔 → C 화면에 꺼짐 표시');

// A가 구역 밖으로 나오면 C와 다시 연결
await walkTo(A, 22 * 16, 22 * 16);
await sleep(3000);
const pa = await A.page.evaluate(() => window.__voice.peers());
check(pa.length === 1 && pa[0].id === ids[2], `A가 홀로 나오자 C와 연결, B와는 끊김 (${JSON.stringify(pa)})`);
await say(A, '다시 나왔어요');
check(await saw(C, '다시 나왔어요') && !(await saw(B, '다시 나왔어요')), '나온 뒤 A의 말은 C에게 들리고 서재의 B에게는 안 들림');

console.log(fails ? `\n실패 ${fails}건` : '\n구역 격리 검사 모두 통과');
await browser.close();
process.exit(fails ? 1 : 0);
