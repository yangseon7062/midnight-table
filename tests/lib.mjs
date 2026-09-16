import { chromium } from 'playwright';
export const URL = process.env.URL ?? 'http://localhost:3000';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const shots = 'tests/artifacts';

export async function launch() {
  return chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
  });
}

/** 새 브라우저 컨텍스트 = 독립된 유저 (localStorage 분리) */
export async function newPlayer(browser, name, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 1440, height: 900 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] pageerror:`, e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[${name}] console:`, m.text()); });
  await page.goto(URL);
  await page.waitForSelector('#nick', { timeout: 15000 });
  await page.fill('#nick', name);
  await page.click('button[type=submit]');
  await page.waitForSelector('.lobby-screen', { timeout: 10000 });
  return { ctx, page, name };
}
