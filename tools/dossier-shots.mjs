// Screenshots of a dossier in each redaction state, for visual review.
// Usage: npm run build && node tools/dossier-shots.mjs [slug] [outDir]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { startServer } from './serve.mjs';

const slug = process.argv[2] || 'jinx-jameson';
const out = process.argv[3] || 'shots/dossier';
mkdirSync(out, { recursive: true });
const server = await startServer('dist');
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [name, width, height] of [['phone', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 900]]) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => localStorage.setItem('velvet-cellar:invitation-opened', '1'));
  await page.goto(`${server.base}#dossier-${slug}`, { waitUntil: 'networkidle0' });
  await sleep(700);
  const dossier = `#dossier-${slug}`;
  const full = async (file) => {
    // The dossier scrolls inside a fixed layer, so stretch it for a full-length picture.
    const h = await page.evaluate((s) => document.querySelector(s).scrollHeight, dossier);
    await page.setViewport({ width, height: Math.min(h, 6000), deviceScaleFactor: 1 });
    await sleep(150);
    await page.screenshot({ path: `${out}/${name}-${file}.png` });
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await sleep(100);
  };
  await full('1-redacted');
  await page.evaluate((s) => document.querySelector(`${s} [data-private-confirm]`).click(), dossier);
  await page.evaluate((s) => document.querySelector(`${s} [data-private-gate] button`).click(), dossier);
  await sleep(1300);
  await page.screenshot({ path: `${out}/${name}-2-revealing.png` });
  await sleep(3200);
  await full('3-revealed');
  await context.close();
}
// The register, at phone and desktop widths.
for (const [name, width, height] of [['phone', 390, 844], ['desktop', 1440, 900]]) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => localStorage.setItem('velvet-cellar:invitation-opened', '1'));
  await page.goto(server.base, { waitUntil: 'networkidle0' });
  const el = await page.$('#archives');
  await el.evaluate((node) => node.scrollIntoView({ behavior: 'instant' }));
  await sleep(300);
  await el.screenshot({ path: `${out}/${name}-register.png` });
  await context.close();
}
await browser.close();
await server.close?.();
process.exit(0);
