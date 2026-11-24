// Tests for everything beyond the invitation: sections, navigation, countdown,
// RSVP, archive, dossier, mood boards, questions and layout.
// Usage: npm run build && node tools/site.test.mjs [dir]
import puppeteer from 'puppeteer-core';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './serve.mjs';

const dir = process.argv[2] || 'dist';
let postStatus = 404; // what "Netlify" answers to a form post; tests change it
const server = await startServer(dir, { onPost: () => postStatus });
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ADDRESS = '49 Trelawney Road, Redland, Bristol';

let failed = 0;
let passed = 0;
const check = (name, ok, detail = '') => {
  ok ? passed++ : failed++;
  if (!ok || process.argv.includes('--verbose')) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
};

/** A fresh visitor who has already opened the invitation. */
async function visitor({ width = 390, height = 760, hash = '', before } = {}) {
  const context = await browser.createBrowserContext();
  await context.overridePermissions(server.base, ['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  const errors = [];
  const outside = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  page.on('request', (r) => !r.url().startsWith(server.base) && !r.url().startsWith('data:') && outside.push(r.url()));
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('velvet-cellar:invitation-opened', '1');
    } catch {}
  });
  if (before) await page.evaluateOnNewDocument(before);
  await page.goto(server.base + hash, { waitUntil: 'networkidle0' });
  return { context, page, errors, outside };
}
/** Wait for a smooth scroll to finish: true once the section's top is near the top of the screen. */
const arrivesAt = (page, selector) =>
  page
    .waitForFunction((s) => Math.abs(document.querySelector(s).getBoundingClientRect().top) < 140, { timeout: 6000 }, selector)
    .then(() => true, () => false);
const text = (page, selector) => page.evaluate((s) => document.querySelector(s)?.textContent.replace(/\s+/g, ' ').trim() ?? '', selector);
const visible = (page, selector) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }, selector);

// ---------- Structure ----------
{
  const { context, page, errors, outside } = await visitor();
  const order = await page.evaluate(() =>
    [...document.querySelectorAll('main [id]')].map((el) => el.id).filter((id) => ['invitation', 'welcome', 'particulars', 'countdown', 'intrigue', 'archives', 'dress', 'radio', 'noticeboard', 'faqs', 'verdict', 'remember'].includes(id))
  );
  check('all sections present, in the approved order', order.join(' ') === 'invitation welcome particulars countdown intrigue archives dress radio noticeboard faqs verdict remember', order.join(' '));
  check('one main heading, sections headed in order', await page.evaluate(() => document.querySelectorAll('h1').length === 1 && document.querySelectorAll('main h2').length >= 11));
  check('footer carries the closing lines', /Est\. 1925/.test(await text(page, '.site-footer')) && /Strictly for invited guests/.test(await text(page, '.site-footer')));
  check('the build carries Netlify\'s no-index header rules', /X-Robots-Tag: noindex/.test(readFileSync(join(dir, '_headers'), 'utf8')));
  check('the parked entrance page is not in the build', !existsSync(join(dir, 'door')));
  check('search engines are told not to index the page', await page.evaluate(() => /noindex/.test(document.querySelector('meta[name=robots]').content)));
  check('page title and description reveal nothing private', await page.evaluate(() => !/Carys|Thomas|Trelawney|birthday/i.test(document.title + document.querySelector('meta[name=description]').content)));
  check('nothing is loaded from other websites (no trackers, no font services)', outside.length === 0, outside.join(', '));
  check('no script errors on load', errors.length === 0, errors.join(' | '));

  // ---------- Navigation (phone) ----------
  check('navigation stays out of the way on the invitation', !(await visible(page, '.site-nav')));
  await page.evaluate(() => document.querySelector('#particulars').scrollIntoView({ behavior: 'instant' }));
  await sleep(500);
  check('navigation appears once past the invitation', await visible(page, '.site-nav'));
  await page.click('[data-nav-open]');
  await sleep(300);
  const labels = await page.evaluate(() => [...document.querySelectorAll('[data-nav-menu] a')].map((a) => a.textContent.trim()));
  check('menu lists the seven approved items', labels.join('|') === 'Invitation|The Evening|Your Character|Dress Code|The Radio|Noticeboard|FAQs', labels.join('|'));
  check('voting and gallery are absent from the menu until switched on', !labels.some((l) => /Verdict|Gallery/.test(l)));
  check('every menu link points at a section that exists', await page.evaluate(() => [...document.querySelectorAll('[data-nav-menu] a')].every((a) => document.querySelector(a.getAttribute('href')))));
  await page.click('[data-nav-menu] a[href="#faqs"]');
  const arrived = await arrivesAt(page, '#faqs');
  await sleep(300);
  check('choosing a menu item closes the menu and goes to the section', arrived && (await page.evaluate(() => !document.querySelector('[data-nav-menu]').open && location.hash === '#faqs')));
  check('section headings are not hidden under the navigation bar', await page.evaluate(() => document.querySelector('#faqs h2').getBoundingClientRect().top >= document.querySelector('.site-nav').getBoundingClientRect().bottom - 1));

  // ---------- Countdown ----------
  const clock = await page.evaluate(() => {
    const target = Date.parse(document.querySelector('[data-countdown]').dataset.target);
    const shown = Object.fromEntries([...document.querySelectorAll('[data-unit]')].map((el) => [el.dataset.unit, Number(el.textContent)]));
    const shownSeconds = shown.days * 86400 + shown.hours * 3600 + shown.minutes * 60 + shown.seconds;
    return { target: new Date(target).toISOString(), drift: Math.abs(shownSeconds - Math.floor((target - Date.now()) / 1000)) };
  });
  check('countdown targets 7 pm London time on 18 December 2026', clock.target === '2026-12-18T19:00:00.000Z', clock.target);
  check('countdown shows the true time remaining', clock.drift <= 2, `${clock.drift}s out`);
  const before = await text(page, '[data-unit="seconds"]');
  await sleep(1200);
  check('countdown ticks', before !== (await text(page, '[data-unit="seconds"]')));

  // ---------- The Evening's Particulars ----------
  const particulars = await text(page, '.particulars');
  check('particulars are real text with every confirmed detail', ['Friday 18th December 2026', '7 o’clock in the evening', ADDRESS, 'Roaring Twenties eveningwear', '28th November 2026'].every((s) => particulars.includes(s)));
  check('the RSVP button sits directly beneath the particulars', await page.evaluate(() => {
    const doc = document.querySelector('.particulars-card .document').getBoundingClientRect();
    const btn = document.querySelector('.reserve').getBoundingClientRect();
    return btn.top >= doc.bottom - 40 && btn.top <= doc.bottom + 10;
  }));
  const prominence = await page.evaluate(() => {
    const area = (el) => { const r = el.getBoundingClientRect(); return r.width * r.height; };
    const reserve = document.querySelector('.reserve');
    const others = [...document.querySelectorAll('main .beyond .btn')].filter((el) => el.getBoundingClientRect().width > 0);
    const r = reserve.getBoundingClientRect();
    return { width: Math.round(r.width), height: Math.round(r.height), largest: others.every((el) => area(el) < area(reserve) * 0.75), text: reserve.textContent.replace(/\s+/g, ' ').trim() };
  });
  check('the RSVP button is the largest control on the page and states the reply date', prominence.height >= 80 && prominence.width >= 300 && prominence.largest && /Reserve your place/.test(prominence.text) && /28th November 2026/.test(prominence.text), JSON.stringify(prominence));
  await page.evaluate(() => document.querySelector('[data-copy-address]').scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.click('[data-copy-address]');
  await sleep(300);
  check('Copy the address puts the address on the clipboard', (await page.evaluate(() => navigator.clipboard.readText())) === ADDRESS);
  check('copying is confirmed in words', (await text(page, '[data-copy-status]')).includes(ADDRESS) && /copied/i.test(await text(page, '[data-copy-label]')));
  const ics = readFileSync(join(dir, 'the-velvet-cellar.ics'), 'utf8');
  check('calendar file: correct start, place and no invented end time', /DTSTART:20261218T190000Z/.test(ics) && ics.includes('LOCATION:49 Trelawney Road\\, Redland\\, Bristol') && !/DTEND/.test(ics));
  const google = await page.evaluate(() => [...document.querySelectorAll('.desk-tools a')].find((a) => /google/.test(a.href))?.href ?? '');
  check('Google Calendar link carries the same date and place', /dates=20261218T190000Z/.test(google) && decodeURIComponent(google).includes(ADDRESS));

  // ---------- RSVP ----------
  // The shortcuts: in the bar, and at the top of the menu.
  check('an RSVP shortcut stays in the navigation bar', await visible(page, '.nav-rsvp'));
  await page.click('.nav-rsvp');
  await sleep(300);
  check('the RSVP shortcut in the bar opens the reservation slip', await page.evaluate(() => document.querySelector('[data-rsvp-dialog]').open));
  await page.keyboard.press('Escape');
  await page.click('[data-nav-open]');
  await sleep(300);
  await page.click('.nav-menu-rsvp');
  await sleep(300);
  check('the RSVP button in the menu closes the menu and opens the slip', await page.evaluate(() => document.querySelector('[data-rsvp-dialog]').open && !document.querySelector('[data-nav-menu]').open));
  await page.keyboard.press('Escape');

  await page.evaluate(() => document.querySelector('.reserve').scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.click('.reserve');
  await sleep(350);
  check('RSVP opens as a reservation slip', await page.evaluate(() => document.querySelector('[data-rsvp-dialog]').open));
  check('the slip asks only for name, attendance and an optional message', await page.evaluate(() => [...document.querySelectorAll('[data-rsvp-form] [name]')].map((el) => el.name).filter((n, i, a) => a.indexOf(n) === i).join(',') === 'form-name,bot-field,name,attending,message'));
  await page.click('[data-rsvp-submit]');
  check('empty slip: asks for a name and sends nothing', (await visible(page, '#rsvp-name-error')) && server.posts.length === 0);
  await page.type('#rsvp-name', 'Test Guest');
  await page.click('[data-rsvp-submit]');
  check('no attendance chosen: asks for one and sends nothing', (await visible(page, '#rsvp-attending-error')) && server.posts.length === 0);
  await page.click('input[name=attending][value="Attending"]');
  postStatus = 404;
  await page.click('[data-rsvp-submit]');
  await sleep(500);
  check('if the reservations book does not accept it, the guest is told and no success is shown', (await visible(page, '[data-rsvp-error]')) && !(await visible(page, '[data-rsvp-result]')) && /could not be sent/.test(await text(page, '[data-rsvp-error]')));
  postStatus = 200;
  await page.click('[data-rsvp-submit]');
  await sleep(500);
  const sent = server.posts.at(-1);
  check('accepted: the slip is posted with the form name Netlify expects', Boolean(sent) && sent.path === '/' && /form-name=rsvp/.test(sent.body) && /name=Test\+Guest/.test(sent.body) && /attending=Attending/.test(sent.body));
  check('accepted (attending): the approved confirmation is shown', /Your place at The Velvet Cellar has been reserved/.test(await text(page, '[data-rsvp-result-text]')));
  await page.click('[data-rsvp-result] [data-rsvp-close]');
  await page.click('.reserve');
  await sleep(300);
  await page.type('#rsvp-name', 'Second Guest');
  await page.click('input[name=attending][value="Unable to attend"]');
  await page.click('[data-rsvp-submit]');
  await sleep(500);
  check('accepted (unable to attend): the approved message is shown', /You will be missed at The Velvet Cellar/.test(await text(page, '[data-rsvp-result-text]')));
  await page.keyboard.press('Escape');
  check('other guests’ responses appear nowhere on the page', !(await page.evaluate(() => document.body.innerText.includes('Test Guest'))));

  // ---------- The Confidential Archives ----------
  const counts = await page.evaluate(() => ({ files: document.querySelectorAll('.file').length, real: document.querySelectorAll('[data-archive-item]').length }));
  check('register holds 24 places: one approved example, 23 marked blanks', counts.files === 24 && counts.real === 1);
  check('blank files are plainly marked and invent no names', await page.evaluate(() => [...document.querySelectorAll('[data-archive-blank]')].every((el) => /Name to be supplied/.test(el.textContent) && !el.querySelector('a'))));
  await page.evaluate(() => document.querySelector('[data-archive-search]').scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.type('[data-archive-search]', 'kitty');
  check('search finds a guest by character name', await page.evaluate(() => [...document.querySelectorAll('.file')].filter((el) => !el.hidden).length === 1) && (await text(page, '[data-archive-count]')) === '1 file found');
  await page.$eval('[data-archive-search]', (el) => { el.value = 'zzz'; el.dispatchEvent(new Event('input')); });
  check('search with no match says so', await visible(page, '[data-archive-empty]'));
  await page.$eval('[data-archive-search]', (el) => { el.value = ''; el.dispatchEvent(new Event('input')); });
  check('clearing the search restores the register', await page.evaluate(() => [...document.querySelectorAll('.file')].filter((el) => !el.hidden).length === 24));

  // ---------- The example dossier ----------
  await page.evaluate(() => document.querySelector('a.file-card').scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.click('a.file-card');
  await sleep(600);
  check('selecting a file opens that dossier at its own address', await page.evaluate(() => location.hash === '#dossier-kitty-adams' && !document.querySelector('#dossier-kitty-adams').hidden));
  const dossier = await text(page, '#dossier-kitty-adams');
  check('dossier shows guest, character and occupation as approved', ['Carys', 'Cleo “Kitty” Adams', 'Private Investigator'].every((s) => dossier.includes(s)));
  check('dossier introduction is a marked placeholder, not invented text', /introduction for this character will appear here/.test(dossier));
  check('booklet section is sealed with the approved wording', /Further Correspondence Sealed/i.test(dossier) && /certain matters remain confidential/.test(dossier));
  check('no booklet, link or download is offered', await page.evaluate(() => !document.querySelector('#dossier-kitty-adams a[href$=".pdf"], #dossier-kitty-adams [download]')));
  check('the page behind the dossier cannot be reached while it is open', await page.evaluate(() => document.querySelector('main').inert));
  check('keyboard focus moves into the dossier', await page.evaluate(() => document.querySelector('#dossier-kitty-adams').contains(document.activeElement)));
  await page.click('[data-dossier-back]');
  await sleep(500);
  check('"Return to the register" closes the dossier and returns to the archive', await page.evaluate(() => location.hash === '#archives' && document.querySelector('#dossier-kitty-adams').hidden && !document.querySelector('main').inert));
  check('focus returns to the file that was opened', await page.evaluate(() => document.activeElement?.matches('a.file-card')));
  await page.goBack();
  await sleep(400);
  check('browser back and forward reopen and close the dossier correctly', await page.evaluate(() => !document.querySelector('#dossier-kitty-adams').hidden));
  await page.keyboard.press('Escape');
  await sleep(300);
  check('Escape closes the dossier', await page.evaluate(() => document.querySelector('#dossier-kitty-adams').hidden));

  // ---------- Dress for the Decade ----------
  const boards = await page.evaluate(() => [...document.querySelectorAll('[data-board]')].map((b) => ({ title: b.querySelector('h3').textContent.replace(/\s+/g, ' ').trim(), plates: b.querySelectorAll('[data-plate]').length, marked: /Placeholder plates/.test(b.textContent), images: b.querySelectorAll('img').length })));
  check('three mood boards, each with its own number of plates', boards.length === 3 && boards.map((b) => b.plates).join(',') === '7,8,6', JSON.stringify(boards.map((b) => b.plates)));
  check('every board is marked as awaiting the host’s photographs; none has an image', boards.every((b) => b.marked && b.images === 0));
  await page.evaluate(() => document.querySelector('#board-ladies [data-plate]').scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.click('#board-ladies [data-plate]');
  await sleep(400);
  check('selecting a plate opens the enlarged view', (await page.evaluate(() => document.querySelector('[data-gallery]').open)) && (await text(page, '[data-gallery-count]')) === '1 of 8');
  await page.click('[data-gallery-next]');
  await sleep(700);
  check('next moves to the following plate', (await text(page, '[data-gallery-count]')) === '2 of 8');
  await page.keyboard.press('ArrowRight');
  await sleep(700);
  check('arrow keys move between plates', (await text(page, '[data-gallery-count]')) === '3 of 8');
  await page.evaluate(() => { const t = document.querySelector('[data-gallery-track]'); t.scrollTo({ left: t.clientWidth * 5, behavior: 'instant' }); });
  await sleep(400);
  check('swiping (scrolling) the view updates the position', (await text(page, '[data-gallery-count]')) === '6 of 8');
  await page.click('[data-gallery-close]');

  // ---------- Radio, noticeboard, questions, sealed sections ----------
  const radio = await page.evaluate(() => ({ records: document.querySelectorAll('.record').length, links: document.querySelectorAll('.radio a[href]').length, awaiting: document.querySelectorAll('.radio .is-awaiting[aria-disabled=true]').length, audio: document.querySelectorAll('audio, video, iframe').length }));
  check('two playlists, each awaiting its Spotify link; no invented links', radio.records === 2 && radio.links === 0 && radio.awaiting === 2);
  check('nothing plays or embeds audio on the page', radio.audio === 0);
  const notices = await page.evaluate(() => ({ all: document.querySelectorAll('.notice').length, specimens: [...document.querySelectorAll('.notice')].filter((n) => /Specimen/i.test(n.textContent)).length, empty: /Nothing has been posted yet/.test(document.querySelector('.baize').textContent) }));
  check('noticeboard: no real notices, and every sample is stamped Specimen', notices.empty && notices.all === notices.specimens && notices.all === 2);
  const faqs = await page.evaluate(() => document.querySelectorAll('.ledger-entry').length);
  check('ten approved questions', faqs === 10);
  await page.evaluate(() => document.querySelector('.ledger-entry summary').scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.click('.ledger-entry summary');
  check('a question opens to show its answer', await page.evaluate(() => document.querySelector('.ledger-entry').open && /No\. The murder mystery is designed/.test(document.querySelector('.ledger-answer').textContent)));
  await page.focus('.ledger-entry:nth-of-type(2) summary');
  await page.keyboard.press('Enter');
  check('questions open from the keyboard', await page.evaluate(() => document.querySelector('.ledger-entry:nth-of-type(2)').open));
  const sealed = await page.evaluate(() => ({ verdict: document.querySelector('#verdict').textContent, remember: document.querySelector('#remember').textContent, links: document.querySelectorAll('#verdict a, #remember a').length, html: document.documentElement.innerHTML }));
  check('The Final Verdict is sealed: no voting link exists in the page', /Verdict Remains Sealed/i.test(sealed.verdict) && sealed.links === 0 && !/forms\.gle|docs\.google\.com\/forms/.test(sealed.html));
  check('A Night to Remember is sealed until after the party', /album opens after the party/.test(sealed.remember));
  check('no script errors during use', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------- The countdown at the hour ----------
{
  const { context, page } = await visitor({ before: () => { const real = Date.now; Date.now = () => Date.parse('2026-12-18T19:00:05Z') + (real() % 1000); } });
  check('at 7 pm on the night the countdown gives way to "The doors are open"', (await visible(page, '[data-countdown-open]')) && !(await visible(page, '[data-countdown-running]')) && /Doors Are Open/i.test(await text(page, '[data-countdown-open]')));
  await context.close();
}

// ---------- A dossier address opened directly ----------
{
  const { context, page } = await visitor({ hash: '#dossier-kitty-adams' });
  await sleep(400);
  check('a dossier address opens that dossier directly', await page.evaluate(() => !document.querySelector('#dossier-kitty-adams').hidden));
  await context.close();
}

// ---------- Desktop navigation ----------
{
  const { context, page } = await visitor({ width: 1440, height: 900 });
  await page.evaluate(() => document.querySelector('#welcome').scrollIntoView({ behavior: 'instant' }));
  await sleep(500);
  check('desktop: section links are shown inline, without a menu button', (await visible(page, '.nav-inline')) && !(await visible(page, '[data-nav-open]')));
  check('desktop: the RSVP shortcut sits in the bar beside the links', await visible(page, '.nav-rsvp'));
  await page.click('.nav-inline a[href="#radio"]');
  check('desktop: a navigation link goes to its section', await arrivesAt(page, '#radio'));
  await context.close();
}

// ---------- Layout at the representative sizes ----------
for (const [width, height] of [[360, 740], [390, 760], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]]) {
  const { context, page } = await visitor({ width, height });
  await page.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach((img) => (img.loading = 'eager')));
  const layout = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const wide = [];
    const small = [];
    const clipped = [];
    for (const el of document.querySelectorAll('main *, .site-footer *')) {
      if (el.closest('dialog, [hidden], svg, .sr-only, .threshold')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.right > vw + 1 || r.left < -1) wide.push(`${el.tagName}.${el.className}`.slice(0, 60));
      if (el.matches('a, button, summary, input:not([type=hidden]):not([type=radio])') && (r.height < 44 || r.width < 44)) small.push(`${el.tagName}.${String(el.className).slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (el.matches('h2, h3, .display') && el.scrollWidth > el.clientWidth + 1) clipped.push(el.textContent.trim().slice(0, 30));
    }
    return { scrollX: document.documentElement.scrollWidth - vw, wide: [...new Set(wide)].slice(0, 5), small: small.slice(0, 5), clipped };
  });
  check(`${width}x${height}: no sideways scrolling, nothing outside the page`, layout.scrollX === 0 && layout.wide.length === 0, JSON.stringify(layout.wide));
  check(`${width}x${height}: no clipped headings`, layout.clipped.length === 0, layout.clipped.join(' | '));
  check(`${width}x${height}: every control is at least 44px to touch`, layout.small.length === 0, layout.small.join(' | '));
  await context.close();
}

await browser.close();
server.close();
console.log(`\nSite: ${passed} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
