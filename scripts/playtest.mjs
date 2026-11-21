// Playwright play-test for Sunfall Harbor. Opens the game in real
// Chromium, plays it with the real keyboard and mouse, records any
// console error or failed request, and takes the four ?shot= screenshots.
// Usage: node serve.ts (in another shell) then node scripts/playtest.mjs
// Exits 0 only when the game plays clean and all screenshots are valid.
import { chromium } from '/home/hatch/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core/index.mjs';
import { writeFileSync } from 'node:fs';
import { statSync } from 'node:fs';

const BASE = 'http://localhost:8080';
const EXE = '/home/hatch/.cache/ms-playwright/chromium-1187/chrome-linux/chrome';

const errors = [];
const failedRequests = [];

async function state(page, expr) {
  return page.evaluate(expr);
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('requestfailed', (req) => failedRequests.push(`${req.url()} ${req.failure()?.errorText}`));
page.on('response', (res) => {
  if (res.status() >= 400) failedRequests.push(`${res.url()} HTTP ${res.status()}`);
});

console.log('== opening title screen ==');
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(800);
console.log('mode:', await state(page, `window.__game && window.__game.mode`));

// Start the game: Enter on title, Enter on the mission brief.
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
console.log('mode after Enter x2:', await state(page, `window.__game.mode`));

// Walk north-east toward the parked car at (1086,1080).
const start = await state(page, `({x: window.__game.player.x, y: window.__game.player.y})`);
await page.keyboard.down('w');
await page.keyboard.down('d');
await page.waitForTimeout(900);
await page.keyboard.up('w');
await page.keyboard.up('d');
const afterWalk = await state(page, `({x: window.__game.player.x, y: window.__game.player.y, foot: window.__game.player.onFoot})`);
console.log('walked:', JSON.stringify(start), '->', JSON.stringify(afterWalk));
if (Math.hypot(afterWalk.x - start.x, afterWalk.y - start.y) < 50) throw new Error('player did not move while walking');

// Enter the nearest car.
await page.keyboard.press('e');
await page.waitForTimeout(300);
const inCar = await state(page, `({foot: window.__game.player.onFoot, car: !!window.__game.player.car, wanted: window.__game.wanted})`);
console.log('after E:', JSON.stringify(inCar));
if (inCar.foot) throw new Error('E did not enter a car');

// Drive forward.
await page.keyboard.down('w');
await page.waitForTimeout(2500);
await page.keyboard.up('w');
const drive = await state(page, `({speed: Math.round(Math.abs(window.__game.player.car ? window.__game.player.car.speed : 0)), x: Math.round(window.__game.player.x), y: Math.round(window.__game.player.y)})`);
console.log('driving:', JSON.stringify(drive));
if (drive.speed < 50 && Math.hypot(drive.x - afterWalk.x, drive.y - afterWalk.y) < 100) throw new Error('car did not drive');

// Pause and resume.
await page.keyboard.press('p');
await page.waitForTimeout(200);
console.log('paused mode:', await state(page, `window.__game.mode`));
if ((await state(page, `window.__game.mode`)) !== 'paused') throw new Error('P did not pause');
await page.keyboard.press('p');
await page.waitForTimeout(200);
console.log('resumed mode:', await state(page, `window.__game.mode`));
if ((await state(page, `window.__game.mode`)) !== 'play') throw new Error('P did not resume');

// Get out and shoot: E to exit, click to fire the pistol.
await page.keyboard.press('e');
await page.waitForTimeout(300);
const ammoBefore = await state(page, `window.__game.player.ammo`);
await page.mouse.click(700, 300);
await page.waitForTimeout(200);
const ammoAfter = await state(page, `window.__game.player.ammo`);
console.log(`ammo ${ammoBefore} -> ${ammoAfter}`);
if (ammoAfter >= ammoBefore) throw new Error('click did not fire the pistol');

console.log('== screenshots ==');
const shots = [
  ['chase', 'screenshots/1-chase.jpg'],
  ['play', 'screenshots/2-play.jpg'],
  ['start', 'screenshots/3-start.jpg'],
  ['end', 'screenshots/4-end.jpg'],
];
for (const [name, file] of shots) {
  await page.goto(`${BASE}/?shot=${name}&seed=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 15000 });
  await page.screenshot({ path: file, type: 'jpeg', quality: 80 });
  const size = statSync(file).size;
  console.log(`${file}: ${size} bytes`);
  if (size > 262144) throw new Error(`${file} exceeds 256KiB (${size})`);
}

await browser.close();

console.log('== errors ==');
console.log('console/page errors:', errors.length ? errors : 'none');
console.log('failed requests:', failedRequests.length ? failedRequests : 'none');
if (errors.length || failedRequests.length) {
  console.error('PLAYTEST FAILED');
  process.exit(1);
}
console.log('PLAYTEST PASSED');
