// Renders fixed reference scenes in headless Chrome for before/after review.
//   node scripts/shots.mjs <out-dir> [--sheet]
// Starts its own Vite dev server, so nothing else needs to be running.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SCENES = [
  { name: 'coast', q: 'seed=42&size=medium&look=shallowSea&dist=1.3' },
  { name: 'forest', q: 'seed=42&size=medium&look=temperateForest&dist=1.3' },
  { name: 'jungle', q: 'seed=42&size=medium&look=jungle&dist=1.35' },
  { name: 'desert', q: 'seed=42&size=medium&look=hotDesert&dist=1.35' },
  { name: 'desertHills', q: 'seed=1&size=medium&look=coldDesert+hills&dist=1.3' },
  { name: 'steppeRange', q: 'seed=1&size=medium&look=steppe+mountains&dist=1.35' },
  { name: 'range', q: 'seed=7&size=medium&look=temperateForest+mountains&dist=1.4' },
  { name: 'mountains', q: 'seed=3&size=medium&look=glacier&dist=1.4' },
  { name: 'bog', q: 'seed=42&size=medium&look=bog&dist=1.35' },
  { name: 'pole', q: 'seed=42&size=medium&look=iceSheet&dist=1.6' },
  { name: 'river', q: 'seed=42&size=medium&look=floodplain&dist=1.35' },
  { name: 'globe', q: 'seed=42&size=medium&look=prairie&dist=3.2' },
];
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 5299;

const out = resolve(process.argv[2] ?? 'shots');
mkdirSync(out, { recursive: true });
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
try {
  for (let i = 0; i < 50; i++) {
    try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--enable-gpu', '--use-angle=metal'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  for (const s of SCENES) {
    await page.goto(`http://localhost:${PORT}/?${s.q}`);
    await page.click('#go');
    await page.waitForSelector('#topbar');
    await page.waitForTimeout(1500);
    await page.mouse.move(1090, 690); // keep hover rings away from the scene
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out, `${s.name}.png`) });
  }
  if (process.argv.includes('--sheet')) {
    const cells = SCENES.map((s) => `<figure><img src="data:image/png;base64,${readFileSync(join(out, `${s.name}.png`)).toString('base64')}"><figcaption>${s.name}</figcaption></figure>`).join('');
    const html = `<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(4,550px);gap:4px}figure{margin:0;position:relative;height:300px;overflow:hidden}img{width:550px;margin-top:-26px}figcaption{position:absolute;top:4px;left:4px;background:#000;color:#fff;font:13px sans-serif;padding:2px 6px}</style>${cells}`;
    await page.setViewportSize({ width: 2212, height: 912 });
    await page.setContent(html);
    await page.screenshot({ path: join(out, 'sheet.png') });
  }
  await browser.close();
  if (errors.length) { console.error('page errors:', errors); process.exitCode = 1; }
  console.log(`shots written to ${out}`);
} finally {
  server.kill();
}
