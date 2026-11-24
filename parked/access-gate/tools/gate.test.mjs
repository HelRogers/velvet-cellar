// Access-gate tests. Runs the real edge functions (netlify/edge-functions) against
// the built site in dist/, with Netlify's runtime stood in by a small harness:
// the same Request/Response/Web Crypto APIs, and a `next()` that serves dist/.
//
// What this proves: the gate's logic. What it cannot prove: Netlify's own wiring
// (that the functions are attached to every path, the rate limit, cookies over
// HTTPS). Those are re-tested on the first Netlify preview, before any guest
// information is deployed there.
//
// Usage: npm run build && node --experimental-strip-types tools/gate.test.mjs
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';
const CODE = 'champagne-test-code';
const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
const env = { SITE_ACCESS_CODE: CODE, SITE_SESSION_SECRET: SECRET };
globalThis.Netlify = { env: { get: (name) => env[name] } };

const gate = (await import('../netlify/edge-functions/gate.ts')).default;
const door = (await import('../netlify/edge-functions/door.ts')).default;
const { issuePass, COOKIE_NAME } = await import('../netlify/lib/pass.ts');

let failed = 0;
let passed = 0;
const check = (name, ok, detail = '') => {
  ok ? passed++ : failed++;
  if (!ok || process.argv.includes('--verbose')) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
};

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
const files = walk(DIST).map((path) => '/' + relative(DIST, path).split(sep).join('/'));

/** Stand-in for Netlify: route /enter to the door, everything else through the gate, then to the static file. */
async function visit(path, { method = 'GET', cookie, accept = 'text/html,application/xhtml+xml', body, depth = 0 } = {}) {
  const headers = new Headers({ accept });
  if (cookie) headers.set('cookie', cookie);
  if (body) headers.set('content-type', 'application/x-www-form-urlencoded');
  const request = new Request(new URL(path, 'https://the-velvet-cellar.test'), { method, headers, body });
  const url = new URL(request.url);
  let served = null;
  const context = {
    next: async () => {
      let file = join(DIST, decodeURIComponent(url.pathname));
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
      served = existsSync(file) ? file : null;
      return served ? new Response(readFileSync(file)) : new Response('Not found', { status: 404 });
    },
  };
  const handler = url.pathname === '/enter' ? door : gate;
  const result = await handler(request, context);
  if (result instanceof URL) {
    if (depth > 2) throw new Error('rewrite loop');
    const inner = await visit(result.pathname + result.search, { method: 'GET', cookie, accept, depth: depth + 1 });
    return { ...inner, rewrittenTo: result.pathname };
  }
  if (result === undefined) {
    const response = await context.next();
    return { status: response.status, served, text: served ? readFileSync(served, 'latin1') : '', headers: response.headers, passedGate: true };
  }
  return { status: result.status, served: null, text: await result.text(), headers: result.headers, passedGate: false };
}

const PRIVATE_MARKERS = ['Trelawney', 'Redland', 'Carys', 'Thomas', 'Kitty', 'invitation-front', 'invitation-back'];
const hasPrivate = (text) => PRIVATE_MARKERS.filter((marker) => text.includes(marker));

// ---- 1. Without a pass: every file in the build, requested directly ----
const open = [];
for (const file of files) {
  const asAsset = await visit(file, { accept: '*/*' });
  const asPage = await visit(file);
  if (asAsset.passedGate || asPage.passedGate) open.push(file);
  if (!asAsset.passedGate) {
    check(`no pass, direct request refused: ${file}`, asAsset.status === 401 && hasPrivate(asAsset.text).length === 0, `status ${asAsset.status}`);
  }
}
const allowed = (file) => /^\/door\/index\.html$|^\/robots\.txt$|^\/_astro\/[^/]+\.woff2$|^\/_astro\/(velvet|paper-champagne|parchment|grain)\.[^/]+\.(webp|png)$/.test(file);
check('only the entrance, its fonts and textures are open', open.every(allowed), open.filter((f) => !allowed(f)).join(', '));
check('the invitation images are not open', !open.some((f) => /invitation-(front|back)/.test(f)));
check('the homepage file is not open', !open.includes('/index.html'));
check('the calendar file is not open', !open.includes('/the-velvet-cellar.ics'));
for (const file of open.filter((f) => /\.(html|txt)$/.test(f))) {
  const found = hasPrivate(readFileSync(join(DIST, file), 'utf8'));
  check(`open file holds nothing private: ${file}`, found.length === 0, found.join(', '));
}

// ---- 2. Without a pass: a visitor in a browser is shown the entrance, not the site ----
for (const path of ['/', '/index.html', '/?key=wrong', '/archives/', '/anything/else']) {
  const page = await visit(path);
  const isEntrance = page.served?.endsWith(join('door', 'index.html')) ?? false;
  const refused = page.status === 401;
  check(`no pass, ${path}: entrance or refusal, never the site`, (isEntrance || refused) && hasPrivate(page.text).length === 0, `status ${page.status}`);
}
const home = await visit('/');
check('no pass, /: the entrance page is what is shown', home.rewrittenTo === '/door/' && /name="code"/.test(home.text));
for (const method of ['POST', 'PUT', 'DELETE', 'HEAD']) {
  const response = await visit('/', { method, body: method === 'POST' ? 'form-name=rsvp&name=x' : undefined });
  check(`no pass, ${method} /: refused`, response.status === 401 && !response.passedGate);
}

// ---- 3. Forged, expired and mis-signed passes ----
const now = Date.now();
const good = await issuePass(SECRET, now);
const expired = await issuePass(SECRET, now - 200 * 24 * 60 * 60 * 1000);
const otherSecret = await issuePass('a-different-secret-0123456789abcdef0123456789', now);
const [v, exp, sig] = good.split('.');
const forgeries = {
  'no signature': `${v}.${exp}.`,
  'made-up signature': `${v}.${exp}.${'0'.repeat(64)}`,
  'later expiry, old signature': `${v}.${Number(exp) + 999999}.${sig}`,
  'expired pass': expired,
  'signed with another secret': otherSecret,
  'wrong version': `v0.${exp}.${sig}`,
  'the password itself': CODE,
  'garbage': 'true',
  'oversized': 'x'.repeat(5000),
};
for (const [name, value] of Object.entries(forgeries)) {
  const page = await visit('/', { cookie: `${COOKIE_NAME}=${value}` });
  const asset = await visit(files.find((f) => /invitation-front/.test(f)), { cookie: `${COOKIE_NAME}=${value}`, accept: 'image/webp' });
  check(`forged pass rejected (${name})`, !asset.passedGate && asset.status === 401 && page.rewrittenTo === '/door/');
}

// ---- 4. With a genuine pass ----
const cookie = `${COOKIE_NAME}=${good}`;
const site = await visit('/', { cookie });
check('with a pass: the homepage is served', site.passedGate && site.served?.endsWith('index.html') && site.text.includes('Trelawney'));
const image = await visit(files.find((f) => /invitation-back/.test(f)), { cookie, accept: 'image/webp' });
check('with a pass: invitation images are served', image.passedGate && image.status === 200);
const post = await visit('/', { cookie, method: 'POST', body: 'form-name=rsvp&name=Test' });
check('with a pass: the RSVP form post is let through to Netlify', post.passedGate);
const withOthers = await visit('/', { cookie: `theme=dark; ${cookie}; other=1` });
check('with a pass among other cookies: still recognised', withOthers.passedGate);

// ---- 5. The door ----
const enter = (init) => visit('/enter' + (init.query ?? ''), init);
const wrong = await enter({ method: 'POST', body: 'code=let-me-in' });
check('wrong password: sent back to the entrance, no pass issued', wrong.status === 303 && /\/door\/\?refused=1$/.test(wrong.headers.get('location')) && !wrong.headers.get('set-cookie'));
const empty = await enter({ method: 'POST', body: 'code=' });
check('empty password: no pass issued', empty.status === 303 && !empty.headers.get('set-cookie'));
const nearly = await enter({ method: 'POST', body: `code=${CODE.slice(0, -1)}` });
check('nearly right password: no pass issued', !nearly.headers.get('set-cookie'));
const right = await enter({ method: 'POST', body: `code=${encodeURIComponent(CODE)}` });
const setCookie = right.headers.get('set-cookie') ?? '';
check('right password: pass issued and guest sent to the invitation', right.status === 303 && new URL(right.headers.get('location')).pathname === '/' && setCookie.startsWith(`${COOKIE_NAME}=`));
check('the pass cookie is HttpOnly, Secure and SameSite=Lax', /HttpOnly/.test(setCookie) && /Secure/.test(setCookie) && /SameSite=Lax/.test(setCookie));
check('the pass does not contain the password', !setCookie.includes(CODE));
const issued = setCookie.split(';')[0];
check('the issued pass opens the site', (await visit('/', { cookie: issued })).passedGate);
const relaxed = await enter({ method: 'POST', body: `code=${encodeURIComponent('  ' + CODE.toUpperCase() + ' ')}` });
check('password is forgiving of capitals and stray spaces', Boolean(relaxed.headers.get('set-cookie')));
const link = await enter({ query: `?key=${encodeURIComponent(CODE)}` });
check('private invitation link (/enter?key=…) issues a pass', link.status === 303 && Boolean(link.headers.get('set-cookie')));
const badLink = await enter({ query: '?key=guess' });
check('invitation link with a wrong key: no pass', !badLink.headers.get('set-cookie'));
const put = await enter({ method: 'PUT' });
check('the door accepts only GET and POST', put.status === 405);
check('gate and door responses are never cached or indexed', /no-store/.test(wrong.headers.get('cache-control')) && /noindex/.test(wrong.headers.get('x-robots-tag')));

// ---- 6. Fail closed when the secrets are missing or too weak ----
for (const [name, broken] of Object.entries({
  'no secrets at all': {},
  'no session secret': { SITE_ACCESS_CODE: CODE },
  'a short password': { SITE_ACCESS_CODE: 'abc', SITE_SESSION_SECRET: SECRET },
  'a short session secret': { SITE_ACCESS_CODE: CODE, SITE_SESSION_SECRET: 'short' },
})) {
  const saved = { ...env };
  for (const key of Object.keys(env)) delete env[key];
  Object.assign(env, broken);
  const page = await visit('/', { cookie });
  const asset = await visit(files.find((f) => /invitation-front/.test(f)), { cookie, accept: 'image/webp' });
  const attempt = await enter({ method: 'POST', body: `code=${CODE}` });
  check(`misconfigured (${name}): everything is closed`, page.status === 503 && asset.status === 503 && attempt.status === 503 && !attempt.headers.get('set-cookie'));
  for (const key of Object.keys(env)) delete env[key];
  Object.assign(env, saved);
}

// ---- 7. Nothing from the murder mystery kit is in the build ----
const kit = files.filter((f) => /narration|clue|host|booklet|solution|\.pdf$/i.test(f));
check('no kit, booklet or PDF files in the build', kit.length === 0, kit.join(', '));

console.log(`\nAccess gate: ${passed} checks passed, ${failed} failed (${files.length} built files examined)`);
process.exit(failed ? 1 : 0);
