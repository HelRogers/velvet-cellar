// Visual check: renders the page at the brief's representative widths and
// captures the sealed state, frames of the opening, the opened card, the
// turned card, the enlarged view and the review sheet.
// Usage: node tools/shots.mjs [baseUrl] [outDir] [names...]
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const dir = process.argv[2] || 'dist';
const out = process.argv[3] || 'scratch/shots';
const only = process.argv.slice(4);
mkdirSync(out, { recursive: true });

// A small static server for the built site, alive only while the check runs.
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain' };
const server = createServer((req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  let file = join(dir, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(dir) || !existsSync(file)) return res.writeHead(404).end('Not found');
  res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const viewports = [
  { name: 'phone-360', width: 360, height: 740, dpr: 2, touch: true },
  { name: 'phone-390', width: 390, height: 760, dpr: 2, touch: true },
  { name: 'tablet-768', width: 768, height: 1024, dpr: 1.5, touch: true },
  { name: 'tablet-1024', width: 1024, height: 768, dpr: 1.5, touch: true },
  { name: 'phone-landscape-844', width: 844, height: 390, dpr: 2, touch: true },
  { name: 'desktop-1440', width: 1440, height: 900, dpr: 1, touch: false },
  { name: 'desktop-1920', width: 1920, height: 1080, dpr: 1, touch: false },
].filter((v) => !only.length || only.includes(v.name));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const v of viewports) {
  // A fresh context each time, so nothing is remembered from the previous size.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.setViewport({ width: v.width, height: v.height, deviceScaleFactor: v.dpr, hasTouch: v.touch, isMobile: v.touch });
  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await sleep(400);
  const shot = (label) => page.screenshot({ path: `${out}/${v.name}-${label}.png` });

  await shot('1-sealed');
  await page.click('[data-open]');
  const t0 = Date.now();
  for (const [label, at] of [['2a-seal', 420], ['2b-flap', 1250], ['2c-flap-open', 1950], ['2d-drawn', 3300], ['2e-turning', 4250], ['2f-turning', 4800]]) {
    await sleep(Math.max(0, at - (Date.now() - t0)));
    await shot(label);
  }
  await sleep(1800);
  await shot('3-opened');
  await page.click('[data-turn]');
  await sleep(450);
  await shot('4a-turning');
  await sleep(900);
  await shot('4b-back');
  await page.click('.viewer-row [data-enlarge]');
  await sleep(500);
  await shot('5-enlarged');
  await page.click('[data-zoom-in]');
  await sleep(300);
  await shot('5b-zoomed');
  await page.click('[data-lightbox-close]');
  await sleep(300);

  // The full homepage, then each overlay in turn.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${out}/${v.name}-6-page.png`, fullPage: true });
  await page.evaluate(() => (location.hash = '#dossier-kitty-adams'));
  await sleep(700);
  await shot('7-dossier');
  await page.evaluate(() => document.querySelector('[data-dossier]:not([hidden])').scrollTo(0, 99999));
  await sleep(200);
  await shot('7b-dossier-sealed');
  await page.evaluate(() => (location.hash = '#particulars'));
  await sleep(500);
  await page.evaluate(() => document.querySelector('[data-rsvp-open]').click());
  await sleep(500);
  await shot('8-rsvp');
  await page.evaluate(() => document.querySelector('[data-rsvp-dialog]').close());
  if (await page.evaluate(() => getComputedStyle(document.querySelector('[data-nav-open]')).display !== 'none')) {
    await page.evaluate(() => document.querySelector('[data-nav-open]').click());
    await sleep(450);
    await shot('9-menu');
    await page.evaluate(() => document.querySelector('[data-nav-menu]').close());
  }
  await page.evaluate(() => document.querySelector('#board-gentlemen [data-plate]').click());
  await sleep(450);
  await shot('10-gallery');
  await page.evaluate(() => document.querySelector('[data-gallery]').close());

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(v.name, 'horizontal overflow:', overflow, 'errors:', errors.length ? errors : 'none');
  await context.close();
}
await browser.close();
server.close();
