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

const GUESTS = JSON.parse(readFileSync('src/content/guests.json', 'utf8')).guests;
const SITE = JSON.parse(readFileSync('src/content/site.json', 'utf8'));
const HTML = readFileSync(join(dir, 'index.html'), 'utf8');

// ---------- The character records and what the built page gives away ----------
{
  const all = JSON.stringify(GUESTS);
  const by = (guest) => GUESTS.find((g) => g.guest === guest);
  check('27 records, each with every field filled', GUESTS.length === 27 && GUESTS.every((g) => g.slug && g.guest && g.character && g.occupation && g.publicStory && g.privateBackstory && g.booklet === 'sealed'));
  check('guest names and dossier addresses are unique', new Set(GUESTS.map((g) => g.guest)).size === 27 && new Set(GUESTS.map((g) => g.slug)).size === 27);
  check('host’s corrections: Freddy for Ollie (Max, Hugo), Willy for Ben (Luke), Adams with one D, Dr Wilfred spaced', by('Max').publicStory.includes('I’m Freddy Brooks') && by('Hugo').privateBackstory.includes('(maybe Freddy, maybe worse)') && by('Luke').privateBackstory.includes('Willy’s obsession with the toxicology report') && by('Carys').character === 'Cleo “Kitty” Adams' && by('Josh').character === 'Dr Wilfred “Willy” Hughes' && !/Ollie|Addams|Eleanor|Ellie|Benjamin|Dr\.Wilfred/.test(all));
  check('the flagged reference to Mina is left exactly as supplied', by('Oliver').privateBackstory.includes('Angelo, Marco, Mina, Jinx, and Dom'));
  check('both “Red” characters are kept', by('Olivia E').character === 'Rosie “Red” O’Hara' && by('Emily').character === 'Ruby “Red” O’Connell');
  const runs = (words, n = 6) => [0, Math.floor(words.length / 2) - 3, words.length - n].map((i) => words.slice(i, i + n).join(' '));
  const leaks = GUESTS.flatMap((g) => runs(g.privateBackstory.split(' ')).filter((run) => HTML.includes(run)).map((run) => `${g.guest}: ${run}`));
  check('no Private Backstory is readable in the page source', leaks.length === 0, leaks.slice(0, 3).join(' / '));
  const shortened = GUESTS.filter((g) => g.occupation !== g.publicRole);
  check('confidential role headings are not readable in the page source', shortened.length === 7 && shortened.every((g) => !HTML.includes(g.occupation)), shortened.filter((g) => HTML.includes(g.occupation)).map((g) => g.occupation).join(', '));
  check('the supplied screenshots are not part of the site', !/IMG_90|c81b0697|4f8fd6ce|e7c2869c/.test(HTML));
}

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
  const counts = await page.evaluate(() => ({ files: document.querySelectorAll('.file').length, real: document.querySelectorAll('[data-archive-item]').length, blanks: document.querySelectorAll('[data-archive-blank]').length }));
  check('register holds all 27 guests and no blank files', counts.files === 27 && counts.real === 27 && counts.blanks === 0, JSON.stringify(counts));
  const cards = await page.evaluate(() => [...document.querySelectorAll('[data-archive-item]')].map((el) => ({ guest: el.querySelector('.file-guest').textContent.trim(), character: el.querySelector('.file-character').textContent.trim(), role: el.querySelector('.file-role').textContent.trim(), href: el.querySelector('a').getAttribute('href') })));
  check('every card shows the right guest, character and public role', GUESTS.every((g, i) => cards[i]?.guest === g.guest && cards[i].character === g.character && cards[i].role === (g.publicRole || 'Occupation withheld') && cards[i].href === `#dossier-${g.slug}`));
  check('register is in alphabetical order of guest name', cards.map((c) => c.guest).join('|') === [...cards.map((c) => c.guest)].sort((a, b) => a.localeCompare(b)).join('|'));
  check('Olivia E and Olivia S, and Jos and Josh, are separate entries', ['Olivia E', 'Olivia S', 'Jos', 'Josh'].every((name) => cards.filter((c) => c.guest === name).length === 1));
  await page.evaluate(() => document.querySelector('[data-archive-search]').scrollIntoView({ block: 'center', behavior: 'instant' }));
  const search = async (query) => {
    await page.$eval('[data-archive-search]', (el, q) => { el.value = q; el.dispatchEvent(new Event('input')); }, query);
    return page.evaluate(() => [...document.querySelectorAll('.file')].filter((el) => !el.hidden).map((el) => el.querySelector('.file-guest').textContent.trim()));
  };
  await page.type('[data-archive-search]', 'kitty');
  check('search finds a guest by character name', await page.evaluate(() => [...document.querySelectorAll('.file')].filter((el) => !el.hidden).length === 1) && (await text(page, '[data-archive-count]')) === '1 file found');
  check('search finds a guest by their own name', (await search('hugo')).join() === 'Hugo');
  check('search for "olivia" finds both Olivias', (await search('Olivia')).join() === 'Olivia E,Olivia S');
  check('search finds a guest by public occupation', (await search('flower seller')).join() === 'Daisy');
  check('search cannot be used to look up a confidential role', (await search('informant')).length === 0 && (await search('undercover')).length === 0 && (await search('mob')).length === 0);
  await search('zzz');
  check('search with no match says so', await visible(page, '[data-archive-empty]'));
  await search('');
  check('clearing the search restores the register', await page.evaluate(() => [...document.querySelectorAll('.file')].filter((el) => !el.hidden).length === 27));

  // ---------- A dossier ----------
  const KITTY = GUESTS.find((g) => g.slug === 'kitty-adams');
  await page.evaluate(() => document.querySelector('a.file-card[href="#dossier-kitty-adams"]').scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.click('a.file-card[href="#dossier-kitty-adams"]');
  await sleep(700);
  check('selecting a file opens that dossier at its own address', await page.evaluate(() => location.hash === '#dossier-kitty-adams' && !document.querySelector('#dossier-kitty-adams').hidden));
  const dossier = await text(page, '#dossier-kitty-adams');
  check('dossier shows guest, character and occupation as supplied', ['Carys', 'Cleo “Kitty” Adams', 'Private Detective'].every((s) => dossier.includes(s)));
  check('the Public Story is shown in full', dossier.includes(KITTY.publicStory));
  check('booklet section is separate and sealed', /Further Correspondence Sealed/i.test(dossier) && /certain matters remain confidential/.test(dossier) && /further confidential instructions/.test(dossier));
  check('no booklet, link or download is offered', await page.evaluate(() => !document.querySelector('#dossier-kitty-adams a[href$=".pdf"], #dossier-kitty-adams [download]')));
  check('the page behind the dossier cannot be reached while it is open', await page.evaluate(() => document.querySelector('main').inert));
  check('keyboard focus moves into the dossier', await page.evaluate(() => document.querySelector('#dossier-kitty-adams').contains(document.activeElement)));

  // ---------- The redacted Private Backstory ----------
  const priv = '#dossier-kitty-adams [data-private]';
  const phrase = 'Your brother was a victim';
  const state = () => page.evaluate((s) => document.querySelector(s).dataset.state, priv);
  const bodyOf = (sel = priv) => page.evaluate((s) => document.querySelector(`${s} [data-private-body]`).textContent.replace(/\s+/g, ' ').trim(), sel);
  check('private backstory opens redacted, with the warning as worded by the host', (await state()) === 'redacted' && dossier.includes('For your eyes only') && dossier.includes('Reading another guest’s private backstory could compromise the investigation and spoil the mystery for everyone.') && dossier.includes('I confirm that I am the intended recipient of this dossier.') && /Unredact confidential information/i.test(dossier));
  const redacted = await page.evaluate((s) => {
    const body = document.querySelector(`${s} [data-private-body]`);
    return { text: body.textContent.trim(), bars: body.querySelectorAll('.rw').length, hidden: body.getAttribute('aria-hidden'), height: body.getBoundingClientRect().height };
  }, priv);
  check('redacted: bars stand in for every word and the page holds none of the text', redacted.text === '' && redacted.bars === KITTY.privateBackstory.split(/\s+/).length && redacted.hidden === 'true', JSON.stringify(redacted));
  check('redacted: text cannot be found in the page, by selecting everything, or by a screen reader', await (async () => {
    const inPage = await page.evaluate((p) => document.documentElement.outerHTML.includes(p) || document.body.innerText.includes(p), phrase);
    const selected = await page.evaluate(() => { getSelection().selectAllChildren(document.querySelector('#dossier-kitty-adams')); const t = getSelection().toString(); getSelection().removeAllRanges(); return t; });
    const tree = JSON.stringify(await page.accessibility.snapshot({ interestingOnly: false }));
    return !inPage && !selected.includes(phrase) && !tree.includes(phrase);
  })());
  check('redacted: keyboard focus never lands on the concealed text', await (async () => {
    await page.focus('#dossier-kitty-adams [data-dossier-back]');
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate((s) => document.querySelector(`${s} [data-private-body]`).contains(document.activeElement), priv)) return false;
    }
    return true;
  })());
  await page.evaluate((s) => document.querySelector(`${s} [data-private-gate] button`).scrollIntoView({ block: 'center', behavior: 'instant' }), priv);
  await page.click(`${priv} [data-private-gate] button`);
  await sleep(300);
  check('unredacting without ticking the confirmation is refused, with a reason', (await state()) === 'redacted' && (await visible(page, `${priv} [data-private-error]`)) && (await bodyOf()) === '' && (await page.evaluate((s) => document.activeElement === document.querySelector(`${s} [data-private-confirm]`), priv)));
  await page.click(`${priv} [data-private-confirm]`);
  await page.click(`${priv} [data-private-gate] button`);
  await sleep(250);
  check('confirming and pressing the button starts the unredaction', (await state()) === 'revealing');
  await page.waitForFunction((s) => document.querySelector(s).dataset.state === 'revealed', { timeout: 6000 }, priv).catch(() => {});
  const revealed = await page.evaluate((s) => {
    const body = document.querySelector(`${s} [data-private-body]`);
    return { state: document.querySelector(s).dataset.state, text: body.textContent.replace(/\s+/g, ' ').trim(), hidden: body.getAttribute('aria-hidden'), height: body.getBoundingClientRect().height, gate: document.querySelector(`${s} [data-private-gate]`).hidden, reseal: !document.querySelector(`${s} [data-private-after]`).hidden };
  }, priv);
  check('unredacted: the full Private Backstory is shown, word for word', revealed.state === 'revealed' && revealed.text === KITTY.privateBackstory);
  check('unredacted: readable by screen readers, warning replaced by the reseal option', revealed.hidden === null && revealed.gate && revealed.reseal);
  check('the bars match the text line for line (nothing jumps on reveal)', Math.abs(revealed.height - redacted.height) < 2, `${redacted.height} then ${revealed.height}`);
  check('revealing one dossier reveals no other', await page.evaluate(() => [...document.querySelectorAll('[data-private]')].filter((el) => el.dataset.state !== 'redacted').length === 1 && [...document.querySelectorAll('[data-private-body]')].filter((el) => el.textContent.trim()).length === 1));
  await page.evaluate((s) => document.querySelector(`${s} [data-private-reseal]`).scrollIntoView({ block: 'center', behavior: 'instant' }), priv);
  await page.click(`${priv} [data-private-reseal]`);
  await page.waitForFunction((s) => document.querySelector(s).dataset.state === 'redacted', { timeout: 4000 }, priv).catch(() => {});
  check('reseal: the text is removed from the page again and the confirmation is cleared', (await state()) === 'redacted' && (await bodyOf()) === '' && !(await page.evaluate((p) => document.documentElement.outerHTML.includes(p), phrase)) && (await page.evaluate((s) => !document.querySelector(`${s} [data-private-confirm]`).checked && !document.querySelector(`${s} [data-private-gate]`).hidden, priv)));
  // Reveal again, then leave: a dossier never stays open behind the guest.
  await page.click(`${priv} [data-private-confirm]`);
  await page.click(`${priv} [data-private-gate] button`);
  await page.waitForFunction((s) => document.querySelector(s).dataset.state === 'revealed', { timeout: 6000 }, priv).catch(() => {});
  await page.evaluate(() => (location.hash = '#dossier-sam-spade'));
  await sleep(600);
  check('opening another dossier: it starts redacted, and the one left behind is sealed again', (await page.evaluate(() => document.querySelector('#dossier-sam-spade [data-private]').dataset.state)) === 'redacted' && (await bodyOf('#dossier-sam-spade [data-private]')) === '' && (await bodyOf()) === '' && !(await page.evaluate((p) => document.documentElement.outerHTML.includes(p), phrase)));
  await page.evaluate(() => (location.hash = '#dossier-kitty-adams'));
  await sleep(600);
  check('coming back to a dossier: it is redacted again', (await state()) === 'redacted' && (await bodyOf()) === '');

  await page.click('#dossier-kitty-adams [data-dossier-back]');
  await sleep(500);
  check('"Return to the register" closes the dossier and returns to the archive', await page.evaluate(() => location.hash === '#archives' && document.querySelector('#dossier-kitty-adams').hidden && !document.querySelector('main').inert));
  check('focus returns to the file that was opened', await page.evaluate(() => document.activeElement?.matches('a.file-card[href="#dossier-kitty-adams"]')));
  await page.goBack();
  await sleep(400);
  check('browser back and forward reopen and close the dossier correctly', await page.evaluate(() => !document.querySelector('#dossier-kitty-adams').hidden));
  await page.keyboard.press('Escape');
  await sleep(300);
  check('Escape closes the dossier', await page.evaluate(() => document.querySelector('#dossier-kitty-adams').hidden));

  // ---------- Dress for the Decade ----------
  const boards = await page.evaluate(() => [...document.querySelectorAll('[data-board]')].map((b) => ({ id: b.id, plates: b.querySelectorAll('[data-plate]').length, marked: /Placeholder plates/.test(b.textContent), images: b.querySelectorAll('img').length, described: [...b.querySelectorAll('img')].every((img) => img.alt.length > 40) })));
  const BOARDS = JSON.parse(readFileSync('src/content/moodboards.json', 'utf8')).boards;
  check('three mood boards, each showing the host’s photographs or, until supplied, marked placeholder plates', boards.length === 3 && BOARDS.every((b, i) => (b.images.length ? boards[i].plates === b.images.length && boards[i].images === b.images.length && !boards[i].marked && boards[i].described : boards[i].plates === b.placeholders.length && boards[i].images === 0 && boards[i].marked)), JSON.stringify(boards));
  check('The Velvet Cellar board: ten photographs, the host’s chosen picture first and full width', await page.evaluate(async () => {
    const board = document.querySelector('#board-cellar');
    const first = board.querySelector('.plate-item img');
    first.scrollIntoView({ block: 'center', behavior: 'instant' });
    await first.decode().catch(() => {});
    const list = board.querySelector('.plates').getBoundingClientRect();
    return board.classList.contains('board--first') && board.querySelectorAll('.plate-item img').length === 10 && /mantelpiece/.test(first.alt) && first.naturalWidth > 0 && Math.abs(first.getBoundingClientRect().width - list.width) < 2;
  }));
  await page.click('#board-cellar [data-plate]');
  await sleep(500);
  check('a photograph opens enlarged, with its description', await page.evaluate(() => { const g = document.querySelector('[data-gallery]'); const img = g.querySelector('img'); return g.open && img && /mantelpiece/.test(img.alt); }) && (await text(page, '[data-gallery-count]')) === '1 of 10');
  await page.click('[data-gallery-close]');
  await sleep(300);
  check('boards run in the host’s order: The Velvet Cellar, the Gentlemen, the Ladies', boards.map((b) => b.id).join(' ') === 'board-cellar board-gentlemen board-ladies' && (await page.evaluate(() => [...document.querySelectorAll('[data-board] h3')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()).join('|'))).replace(/(\S+)\s+\1/g, '$1').includes('Gentlemen'));
  const total = boards[1].plates;
  await page.evaluate(() => document.querySelector('#board-gentlemen [data-plate]').scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.click('#board-gentlemen [data-plate]');
  await sleep(500);
  check('selecting a plate opens the enlarged view', (await page.evaluate(() => document.querySelector('[data-gallery]').open)) && (await text(page, '[data-gallery-count]')) === `1 of ${total}`);
  await page.click('[data-gallery-next]');
  await sleep(500);
  check('next moves to the following plate', (await text(page, '[data-gallery-count]')) === `2 of ${total}`);
  await page.keyboard.press('ArrowRight');
  await sleep(500);
  check('arrow keys move between plates', (await text(page, '[data-gallery-count]')) === `3 of ${total}`);
  await page.evaluate(() => { const t = document.querySelector('[data-gallery-track]'); t.scrollTo({ left: t.clientWidth * 5, behavior: 'instant' }); });
  await sleep(500);
  check('swiping (scrolling) the view updates the position', (await text(page, '[data-gallery-count]')) === `6 of ${total}`);
  await page.click('[data-gallery-close]');

  // ---------- Radio, noticeboard, questions, sealed sections ----------
  const radio = await page.evaluate(() => ({
    records: document.querySelectorAll('.record').length,
    buttons: [...document.querySelectorAll('.radio a.btn')].map((a) => ({ text: a.childNodes[0].textContent.trim(), href: a.href, target: a.target, rel: a.rel, record: a.closest('.record').className })),
    awaiting: document.querySelectorAll('.radio .is-awaiting').length,
    note: document.querySelector('.record--after-hours .record-note')?.textContent.trim(),
    noteBelowButton: (() => { const n = document.querySelector('.record--after-hours .record-note'); const b = document.querySelector('.record--after-hours a.btn'); return n && b && n.getBoundingClientRect().top >= b.getBoundingClientRect().bottom; })(),
    gramophoneNote: document.querySelector('.record--gramophone .record-note'),
    audio: document.querySelectorAll('audio, iframe, video, embed').length,
  }));
  check('two playlists, each with the host’s button wording and her Spotify link', radio.records === 2 && radio.awaiting === 0 && radio.buttons.length === 2 &&
    radio.buttons[0].text === 'Listen to The Gramophone' && radio.buttons[0].href === 'https://open.spotify.com/playlist/5n2F5zAvRoT4II9YKupx8s' && /gramophone/.test(radio.buttons[0].record) &&
    radio.buttons[1].text === 'Listen to After Hours' && radio.buttons[1].href === 'https://open.spotify.com/playlist/1t5P9HNkWKBWzx1d1JBhVt' && /after-hours/.test(radio.buttons[1].record), JSON.stringify(radio.buttons));
  check('playlist buttons open Spotify in a new tab, safely', radio.buttons.every((b) => b.target === '_blank' && /noopener/.test(b.rel)));
  check('After Hours carries the host’s note beneath its button; the Gramophone has none', radio.note === SITE.playlists.afterHours.note && /Spotify collaboration invitation shared in our group chat/.test(radio.note) && !/Once the mystery/.test(radio.note) && radio.noteBelowButton && !radio.gramophoneNote);
  check('nothing plays or embeds audio on the page, and there is no song request form', radio.audio === 0 && (await page.evaluate(() => document.querySelectorAll('.radio form, .radio input').length)) === 0);
  const notices = await page.evaluate(() => [...document.querySelectorAll('.notice')].map((n) => ({ title: n.querySelector('h3').textContent.trim(), date: n.querySelector('time').textContent.trim(), stamp: n.querySelector('.notice-stamp')?.textContent.trim() ?? '', closing: n.querySelector('.notice-closing')?.textContent.trim(), italic: getComputedStyle(n.querySelector('.notice-closing')).fontStyle, link: n.querySelector('.notice-link')?.getAttribute('href'), text: n.textContent })));
  check('noticeboard: the host’s two notices, in her order, with no specimens left', notices.length === 2 && notices[0].title === 'An Invitation Has Arrived' && notices[1].title === 'A Word of Caution…' && notices.every((n) => n.date === '24 November 2026' && !/Specimen/i.test(n.text)) && !(await page.evaluate(() => /Nothing has been posted yet/.test(document.querySelector('#noticeboard').textContent))));
  check('noticeboard: only the first notice carries the Important stamp', notices[0].stamp === 'Important' && notices[1].stamp === '');
  check('noticeboard: each closing sentence is in italics', notices[0].closing === 'Your presence is eagerly anticipated.' && notices[1].closing === 'After all, curiosity can be a dangerous thing.' && notices.every((n) => n.italic === 'italic'));
  await page.evaluate(() => document.querySelector('.notice-link[data-rsvp-open]').scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.click('.notice-link[data-rsvp-open]');
  await sleep(400);
  check('noticeboard: the first notice’s link opens the RSVP slip', await page.evaluate(() => document.querySelector('[data-rsvp-dialog]').open));
  await page.keyboard.press('Escape');
  await sleep(300);
  await page.evaluate(() => document.querySelector('.notice-link[href="#archives"]').scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.click('.notice-link[href="#archives"]');
  const atArchives = await page.waitForFunction(() => location.hash === '#archives' && Math.abs(document.querySelector('#archives').getBoundingClientRect().top) < 160, { timeout: 4000 }).then(() => true, () => false);
  check('noticeboard: the second notice’s link goes to the Confidential Archives', atArchives, await page.evaluate(() => `${location.hash} ${Math.round(document.querySelector('#archives').getBoundingClientRect().top)}`));
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
  check('opened directly, it is still redacted', await page.evaluate(() => document.querySelector('#dossier-kitty-adams [data-private]').dataset.state === 'redacted' && !document.querySelector('#dossier-kitty-adams [data-private-body]').textContent.trim()));
  await context.close();
}

// ---------- Every dossier against its record (with reduced motion, so the reveal is immediate) ----------
{
  const { context, page, errors } = await visitor({ width: 820, height: 1100 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const wrong = [];
  for (const g of GUESTS) {
    const id = `#dossier-${g.slug}`;
    await page.evaluate((hash) => (location.hash = hash), id);
    await page.waitForFunction((s) => !document.querySelector(s).hidden && document.querySelectorAll(`${s} .rw`).length > 0, { timeout: 4000 }, id).catch(() => {});
    const before = await page.evaluate((s) => {
      const el = document.querySelector(s);
      const fact = (label) => [...el.querySelectorAll('.dossier-facts div')].find((d) => d.querySelector('dt').textContent.trim() === label)?.querySelector('dd').textContent.trim();
      return { title: el.querySelector('h2 .sr-only').textContent.trim(), guest: fact('Guest'), role: fact('Occupation'), story: el.querySelector('.public-story')?.textContent.replace(/\s+/g, ' ').trim(), recipient: el.querySelector('.private-head .typed').textContent.trim(), body: el.querySelector('[data-private-body]').textContent.replace(/\s+/g, ' ').trim(), all: el.textContent };
    }, id);
    await page.evaluate((s) => { document.querySelector(`${s} [data-private-confirm]`).click(); document.querySelector(`${s} [data-private-gate]`).requestSubmit(); }, id);
    await page.waitForFunction((s) => document.querySelector(`${s} [data-private]`).dataset.state === 'revealed', { timeout: 4000 }, id).catch(() => {});
    const after = await page.evaluate((s) => document.querySelector(`${s} [data-private-body]`).textContent.replace(/\s+/g, ' ').trim(), id);
    const roleLine = g.occupation !== g.publicRole ? `Role on file ${g.occupation}` : '';
    const ok =
      before.title === g.character && before.guest === g.guest && before.role === (g.publicRole || 'Withheld') && before.story === `“${g.publicStory}”` &&
      before.recipient === `Classified. Recipient: ${g.guest}` && (before.body === '' || before.body === 'Role on file') &&
      (g.occupation === g.publicRole || !before.all.includes(g.occupation)) && after === roleLine + g.privateBackstory;
    if (!ok) wrong.push(g.guest);
  }
  check('all 27 dossiers: right guest, character, public role and Public Story; redacted on opening; unredacting shows that guest’s own Private Backstory word for word', wrong.length === 0, wrong.join(', '));
  check('with reduced motion, reveal and reseal still work', await (async () => {
    const s = '#dossier-muscle-deluca [data-private]';
    await page.evaluate((sel) => document.querySelector(`${sel} [data-private-reseal]`).click(), s);
    await sleep(200);
    return page.evaluate((sel) => document.querySelector(sel).dataset.state === 'redacted' && !document.querySelector(`${sel} [data-private-body]`).textContent.trim(), s);
  })());
  const pictures = await page.evaluate(async () => {
    const out = [];
    for (const el of document.querySelectorAll('[data-dossier]')) {
      const img = el.querySelector('.dossier-portrait img');
      if (!img) { out.push({ id: el.id, missing: true }); continue; }
      el.hidden = false;
      await img.decode().catch(() => {});
      out.push({ id: el.id, ok: img.naturalWidth === 640 && img.naturalHeight === 800, alt: img.alt });
      el.hidden = true;
    }
    return out;
  });
  check('every dossier has its own portrait, upright and loading, described for screen readers', pictures.length === 27 && GUESTS.every((g) => { const p = pictures.find((x) => x.id === `dossier-${g.slug}`); return p && p.ok && p.alt === `Portrait of ${g.character}`; }), JSON.stringify(pictures.filter((x) => !x.ok).slice(0, 4)));
  check('each portrait file is used by exactly one dossier', new Set(GUESTS.map((g) => g.portrait)).size === 27 && GUESTS.every((g) => g.portrait === `${g.slug}.jpg`));
  check('no script errors while opening every dossier', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------- Long backstories at phone, tablet and desktop widths ----------
for (const [label, width, height] of [['small phone', 360, 740], ['phone', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 900]]) {
  const { context, page } = await visitor({ width, height, hash: '#dossier-jinx-jameson' });
  const s = '#dossier-jinx-jameson';
  await page.waitForFunction((sel) => document.querySelectorAll(`${sel} .rw`).length > 0, { timeout: 4000 }, s).catch(() => {});
  const measure = () => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const body = el.querySelector('[data-private-body]');
    const sheet = el.querySelector('[data-private]').getBoundingClientRect();
    const inside = [...body.querySelectorAll('.rw, p')].every((n) => { const r = n.getBoundingClientRect(); return r.left >= sheet.left - 1 && r.right <= sheet.right + 1; });
    const p = body.querySelector('p:last-child');
    return { overflow: el.scrollWidth > el.clientWidth + 1, inside, height: body.getBoundingClientRect().height, font: parseFloat(getComputedStyle(p).fontSize), measure: p.getBoundingClientRect().width };
  }, s);
  const before = await measure();
  await page.evaluate((sel) => { document.querySelector(`${sel} [data-private-confirm]`).click(); document.querySelector(`${sel} [data-private-gate]`).requestSubmit(); }, s);
  await page.waitForFunction((sel) => document.querySelector(`${sel} [data-private]`).dataset.state === 'revealed', { timeout: 6000 }, s).catch(() => {});
  const after = await measure();
  check(`${label}: longest backstory fits its sheet, redacted and revealed, with no sideways scroll`, !before.overflow && !after.overflow && before.inside && after.inside);
  check(`${label}: bars and text occupy the same lines`, Math.abs(before.height - after.height) < 2, `${before.height} then ${after.height}`);
  check(`${label}: text is a comfortable size and line length`, after.font >= 18 && after.measure / after.font <= 38, `${after.font}px, ${(after.measure / after.font).toFixed(1)}em`);
  check(`${label}: checkbox and buttons are large enough to tap`, await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    el.querySelector('[data-private-reseal]').click();
    return [...el.querySelectorAll('.gate-check, .private-gate .btn, .private-after .btn')].every((n) => n.hidden || n.closest('[hidden]') || n.getBoundingClientRect().height >= 44);
  }, s));
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
