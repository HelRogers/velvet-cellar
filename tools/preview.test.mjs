// Checks the private review copy (preview/): that it stands alone, and that it is honest
// about what is not connected. Usage: npm run preview:pack && node tools/preview.test.mjs
import puppeteer from 'puppeteer-core';
import { startServer } from './serve.mjs';

const server = await startServer('.'); // served from a sub-folder, as an artifact is
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
const errors = [];
const stray = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('request', (r) => { const u = r.url(); if (!u.startsWith('data:') && !u.startsWith(server.base + 'preview/')) stray.push(u); });
await page.setViewport({ width: 390, height: 760 });
await page.goto(server.base + 'preview/index.html', { waitUntil: 'networkidle0' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };

check('fonts are embedded and load', await page.evaluate(async () => { await document.fonts.ready; return ['Smythe', 'Elsie Swash Caps', 'EB Garamond', 'Special Elite'].every((f) => document.fonts.check(`20px "${f}"`)); }));
check('first visit starts with the sealed envelope', await page.evaluate(() => document.documentElement.dataset.invite === 'sealed'));
await page.click('[data-skip]');
await sleep(900);
check('invitation images load from the copy\'s own files', await page.evaluate(() => [...document.querySelectorAll('.card-face img')].every((i) => i.naturalWidth > 0)));
check('the copy requests nothing outside its own folder', stray.length === 0, stray.join(', '));
check('the calendar file is marked as live-site only', await page.evaluate(() => !document.querySelector('a[href$=".ics"]') && /live site/.test(document.querySelector('.live-only-note')?.textContent ?? '')));
await page.evaluate(() => document.querySelector('[data-rsvp-open]').click());
await page.type('#rsvp-name', 'Preview Guest');
await page.click('input[name=attending][value="Attending"]');
await page.click('[data-rsvp-submit]');
await sleep(400);
check('RSVP in the preview says plainly that nothing was sent', await page.evaluate(() => /Nothing has been sent/.test(document.querySelector('[data-rsvp-error]').textContent) && document.querySelector('[data-rsvp-result]').hidden) && server.posts.length === 0);
await page.evaluate(() => { document.querySelector('[data-rsvp-dialog]').close(); location.hash = '#dossier-kitty-adams'; });
await sleep(500);
check('the example dossier opens', await page.evaluate(() => !document.querySelector('#dossier-kitty-adams').hidden));
check('no script errors', errors.length === 0, errors.join(' | '));
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
