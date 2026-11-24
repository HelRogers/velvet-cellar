// Screenshot of one section at phone and desktop widths. Usage: node tools/section-shots.mjs <section id> [outDir]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { startServer } from './serve.mjs';
const id = process.argv[2] || 'noticeboard';
const out = process.argv[3] || 'shots/sections';
mkdirSync(out, { recursive: true });
const server = await startServer('dist');
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] });
for (const [name, width, height] of [['phone', 390, 844], ['desktop', 1440, 900]]) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => localStorage.setItem('velvet-cellar:invitation-opened', '1'));
  await page.goto(server.base, { waitUntil: 'networkidle0' });
  const el = await page.$(`#${id}`);
  await el.evaluate((node) => node.scrollIntoView({ behavior: 'instant' }));
  await new Promise((r) => setTimeout(r, 400));
  await el.screenshot({ path: `${out}/${id}-${name}.png` });
  await context.close();
}
await browser.close();
process.exit(0);
