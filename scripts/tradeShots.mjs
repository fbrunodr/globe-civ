// Renders /trade.html for styles, in headless Chrome, to look at their
// shops and works while drawing them (styles/trade).
//   node scripts/tradeShots.mjs <out-dir> <style> [style ...] [--only=shop|works] [--views=front,game,back] [--fp=b23 --floors=2]
// Uses the dev server at $BASE (default http://localhost:5173); start one
// with `npx vite` if none is running.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const out = resolve(args[0] ?? 'trade-shots');
const styles = args.slice(1).filter((a) => !a.startsWith('--'));
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const views = (args.find((a) => a.startsWith('--views='))?.slice(8) ?? 'front,game,back').split(',');
const fp = args.find((a) => a.startsWith('--fp='))?.slice(5), floors = args.find((a) => a.startsWith('--floors='))?.slice(9);
const extra = `${only ? `&only=${only}` : ''}${fp ? `&fp=${fp}` : ''}${floors ? `&floors=${floors}` : ''}`;
const BASE = process.env.BASE ?? 'http://localhost:5173';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, args: ['--enable-gpu', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
for (const s of styles) for (const v of views) {
  await page.goto(`${BASE}/trade.html?style=${s}&view=${v}${extra}`);
  await page.waitForSelector('body[data-ready]', { timeout: 60000 });
  const file = join(out, `${s}-${v}${extra.replace(/[&=]/g, '-')}.png`);
  await page.screenshot({ path: file });
  console.log(file);
}
await browser.close();
if (errors.length) { console.error('page errors:', errors); process.exitCode = 1; }
