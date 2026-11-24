// Interaction check for the sealed invitation. Each line printed is a tested behaviour.
// Usage: node tools/interactions.mjs [dir]
import puppeteer from 'puppeteer-core';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const dir = process.argv[2] || 'dist';
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  let file = join(dir, normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(dir) || !existsSync(file)) return res.writeHead(404).end('Not found');
  res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
};

async function fresh(opts = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.setViewport({ width: opts.width || 390, height: opts.height || 760, deviceScaleFactor: 1, hasTouch: !!opts.touch });
  if (opts.reduce) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(base, { waitUntil: 'networkidle0' });
  return { context, page, errors };
}
const state = (page) => page.evaluate(() => document.documentElement.dataset.invite);
const face = (page) => page.evaluate(() => document.querySelector('[data-threshold]').dataset.face);

// 1. First visit: sealed, rest of the page withheld, card hidden inside the envelope
{
  const { context, page, errors } = await fresh();
  check('first visit starts sealed', (await state(page)) === 'sealed');
  check('the page below the invitation is withheld while sealed', await page.evaluate(() => getComputedStyle(document.querySelector('.beyond')).display === 'none'));
  check('card sits inside the envelope bounds', await page.evaluate(() => {
    const c = document.querySelector('[data-card-rig]').getBoundingClientRect();
    const e = document.querySelector('[data-envelope]').getBoundingClientRect();
    return c.left >= e.left && c.right <= e.right && c.top >= e.top && c.bottom <= e.bottom;
  }));
  check('viewer controls cannot be reached while sealed', await page.evaluate(() => document.querySelector('[data-viewer-controls]').inert && document.querySelector('.card-hit').disabled));

  // Keyboard: Tab to the seal, press Enter
  await page.keyboard.press('Tab'); // skip link
  await page.keyboard.press('Tab');
  check('seal is the first control reached by keyboard', await page.evaluate(() => document.activeElement?.matches('[data-open]')));
  await page.keyboard.press('Enter');
  await sleep(300);
  check('pressing Enter on the seal starts the opening', (await state(page)) === 'opening');
  await sleep(2400);
  check('flap passes behind the card once folded back', await page.evaluate(() => document.querySelector('[data-flap]').style.zIndex === '1'));
  await sleep(4200);
  check('opening completes on its own', (await state(page)) === 'opened');
  check('card rests at its natural position, upright', await page.evaluate(() => {
    const rig = document.querySelector('[data-card-rig]');
    return getComputedStyle(rig).transform === 'none' && rig.getAnimations().length === 0;
  }));
  check('card keeps the invitation\'s proportions (no cropping)', await page.evaluate(() => {
    const r = document.querySelector('[data-card-rig]').getBoundingClientRect();
    return Math.abs(r.height / r.width - 4209 / 2976) < 0.01;
  }));
  check('focus moves to "Turn the card over"', await page.evaluate(() => document.activeElement?.matches('[data-turn]')));
  check('the page below is revealed', await page.evaluate(() => getComputedStyle(document.querySelector('.beyond')).display !== 'none'));
  check('opened state is remembered locally', await page.evaluate(() => localStorage.getItem('velvet-cellar:invitation-opened') === '1'));

  // Turning, repeatedly
  for (let i = 1; i <= 4; i++) {
    await page.click('[data-turn]');
    await sleep(1050);
    const expected = i % 2 ? 'back' : 'front';
    const shown = await page.evaluate(() => {
      const r = document.querySelector('[data-card-rig]').getBoundingClientRect();
      const el = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).find((n) => n.tagName === 'IMG');
      return el?.closest('[data-face-back]') ? 'back' : el?.closest('[data-face-front]') ? 'front' : 'none';
    });
    check(`turn ${i}: card shows the ${expected}`, (await face(page)) === expected && shown === expected, `visible: ${shown}`);
  }
  check('no time limit: card is still on the same face after waiting', await (async () => { await sleep(1500); return (await face(page)) === 'front'; })());

  // Enlarged view
  await page.click('.viewer-row [data-enlarge]');
  await sleep(400);
  check('enlarged view opens as a modal dialog', await page.evaluate(() => document.querySelector('[data-lightbox]').open));
  const w0 = await page.evaluate(() => document.querySelector('[data-lightbox-img]').clientWidth);
  check('on a phone the enlarged view starts zoomed in', w0 > 390 * 1.5, `${w0}px wide`);
  await page.click('[data-zoom-in]');
  const w1 = await page.evaluate(() => document.querySelector('[data-lightbox-img]').clientWidth);
  check('zoom in enlarges the image', w1 > w0, `${w0} -> ${w1}px`);
  await page.click('[data-zoom-in]');
  check('zoom in is disabled at the maximum', await page.evaluate(() => document.querySelector('[data-zoom-in]').disabled));
  await page.click('[data-zoom-out]'); await page.click('[data-zoom-out]'); await page.click('[data-zoom-out]');
  check('zoom out is disabled at the minimum', await page.evaluate(() => document.querySelector('[data-zoom-out]').disabled));
  check('enlarged image is never cropped (full proportions)', await page.evaluate(() => {
    const i = document.querySelector('[data-lightbox-img]');
    return Math.abs(i.clientHeight / i.clientWidth - i.naturalHeight / i.naturalWidth) < 0.01;
  }));
  await page.click('[data-lightbox-turn]');
  await sleep(500);
  check('turning inside the enlarged view swaps to the back', await page.evaluate(() => /invitation-back/.test(document.querySelector('[data-lightbox-img]').currentSrc) && document.querySelector('[data-threshold]').dataset.face === 'back'));
  await page.keyboard.press('Escape');
  await sleep(200);
  check('Escape closes the enlarged view', await page.evaluate(() => !document.querySelector('[data-lightbox]').open));
  await page.click('.card-hit');
  await sleep(300);
  check('selecting the card itself enlarges it', await page.evaluate(() => document.querySelector('[data-lightbox]').open));
  await page.click('[data-lightbox-close]');

  // Returning visit
  await page.reload({ waitUntil: 'networkidle0' });
  check('returning visitor goes straight to the opened invitation', (await state(page)) === 'opened');
  check('returning visitor sees the card without an animation', await page.evaluate(() => {
    const rig = document.querySelector('[data-card-rig]');
    return getComputedStyle(rig).visibility === 'visible' && rig.getAnimations().length === 0 && getComputedStyle(document.querySelector('[data-sealed-layer]')).visibility === 'hidden';
  }));

  // Replay
  await page.click('[data-replay]');
  await sleep(600);
  check('replay returns to the sealed envelope', (await state(page)) === 'sealed');
  check('replay resets the card to its front', (await face(page)) === 'front');
  await page.click('[data-open]');
  await sleep(900);
  await page.click('[data-open]');
  await sleep(200);
  check('a second press during the opening skips to the invitation', (await state(page)) === 'opened');
  check('no script errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

// 2. Skip
{
  const { context, page } = await fresh();
  await page.click('[data-skip]');
  await sleep(800);
  check('"Skip the opening" goes straight to the invitation', (await state(page)) === 'opened');
  await context.close();
}

// 3. Reduced motion
{
  const { context, page, errors } = await fresh({ reduce: true });
  check('reduced motion: the idle ring on the seal is switched off', await page.evaluate(() => getComputedStyle(document.querySelector('[data-seal-glint]')).animationName === 'none'));
  await page.click('[data-open]');
  await sleep(900);
  check('reduced motion: opening is a short fade, no flight', (await state(page)) === 'opened');
  await page.click('[data-turn]');
  await sleep(500);
  check('reduced motion: turning cross-fades instead of spinning', await page.evaluate(() => {
    const flip = getComputedStyle(document.querySelector('[data-card-flip]')).transform;
    const back = getComputedStyle(document.querySelector('[data-face-back]')).opacity;
    return (flip === 'none' || flip === 'matrix(1, 0, 0, 1, 0, 0)') && back === '1';
  }));
  check('reduced motion: no script errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

// 4. Touch: a sideways swipe turns the card
{
  const { context, page } = await fresh({ touch: true });
  await page.click('[data-skip]');
  await sleep(800);
  const box = await (await page.$('.card-hit')).boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.75, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, y, { steps: 6 });
  await page.mouse.up();
  await sleep(300);
  check('a sideways swipe turns the card without opening the enlarged view', (await face(page)) === 'back' && await page.evaluate(() => !document.querySelector('[data-lightbox]').open));
  await context.close();
}

// 5. Layout: nothing overflows or overlaps at the representative widths, sealed and opened
for (const [width, height] of [[360, 740], [390, 760], [768, 1024], [1024, 768], [1440, 900], [1920, 1080], [844, 390], [667, 375]]) {
  const { context, page } = await fresh({ width, height });
  const sealedFit = await page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const els = [...document.querySelectorAll('[data-sealed-layer] > *')].map((e) => e.getBoundingClientRect());
    const meet = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    const overlap = els.some((a, i) => els.some((b, j) => j > i && meet(a, b)));
    const env = document.querySelector('[data-envelope]').getBoundingClientRect();
    return {
      inside: els.every((r) => r.left >= 0 && r.right <= vw + 0.5 && r.top >= 0),
      fitsScreen: Math.max(...els.map((r) => r.bottom)) <= vh + 0.5,
      overlap,
      flapRoom: env.top - env.height * 0.62 >= -0.5,
      scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  check(`${width}x${height} sealed: within the screen, nothing overlapping, flap has headroom`, sealedFit.inside && !sealedFit.overlap && sealedFit.scrollX === 0 && sealedFit.flapRoom && sealedFit.fitsScreen, JSON.stringify(sealedFit));
  await page.click('[data-skip]');
  await sleep(900);
  const openedFit = await page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const card = document.querySelector('[data-card-rig]').getBoundingClientRect();
    const controls = [...document.querySelectorAll('[data-viewer-control]:not(.card-hit)')].map((e) => e.getBoundingClientRect());
    const hits = controls.some((r) => !(r.right <= card.left || r.left >= card.right || r.bottom <= card.top || r.top >= card.bottom));
    return {
      cardInside: card.left >= 0 && card.right <= vw + 0.5 && card.top >= 0 && card.bottom <= vh + 0.5,
      controlsInside: controls.every((r) => r.left >= 0 && r.right <= vw + 0.5 && r.top >= 0 && r.bottom <= vh + 0.5),
      controlsOverCard: hits,
      minTarget: Math.min(...controls.map((r) => r.height)),
      card: [Math.round(card.width), Math.round(card.height)],
    };
  });
  check(`${width}x${height} opened: card and controls on one screen, no overlap, touch targets 44px or more`, openedFit.cardInside && openedFit.controlsInside && !openedFit.controlsOverCard && openedFit.minTarget >= 44, JSON.stringify(openedFit));
  await context.close();
}

await browser.close();
server.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
