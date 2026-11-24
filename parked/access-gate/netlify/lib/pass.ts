/**
 * The door pass: a signed, expiring token kept in an HTTP-only cookie.
 *
 * Shared by the two edge functions (gate.ts checks it, door.ts issues it).
 * Uses only Web Crypto, so it runs unchanged on Netlify's edge and in the
 * local test harness (tools/gate.test.mjs).
 *
 * Secrets come from two Netlify environment variables (Functions scope):
 *   SITE_ACCESS_CODE     the shared password guests are given
 *   SITE_SESSION_SECRET  a long random string that signs the pass
 * Changing SITE_SESSION_SECRET and redeploying revokes every pass already issued.
 */

export const COOKIE_NAME = 'vc_pass';
const PASS_DAYS = 120;
const VERSION = 'v1';

const encoder = new TextEncoder();

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

/** Compare two strings without leaking, through timing, how much of them matched. */
export async function safeEqual(a: string, b: string, secret: string): Promise<boolean> {
  const [x, y] = await Promise.all([hmac(secret, a), hmac(secret, b)]);
  let difference = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) difference |= x.charCodeAt(i) ^ y.charCodeAt(i % y.length);
  return difference === 0;
}

export function readSecrets(env: { get(name: string): string | undefined }) {
  const code = (env.get('SITE_ACCESS_CODE') ?? '').trim();
  const secret = (env.get('SITE_SESSION_SECRET') ?? '').trim();
  // Fail closed: without both secrets, properly set, nobody is let in.
  const configured = code.length >= 8 && secret.length >= 32;
  return { code, secret, configured };
}

export async function issuePass(secret: string, now = Date.now()): Promise<string> {
  const expires = Math.floor(now / 1000) + PASS_DAYS * 24 * 60 * 60;
  const body = `${VERSION}.${expires}`;
  return `${body}.${await hmac(secret, body)}`;
}

export async function passIsValid(pass: string | undefined, secret: string, now = Date.now()): Promise<boolean> {
  if (!pass || pass.length > 200) return false;
  const parts = pass.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return false;
  const expires = Number(parts[1]);
  if (!Number.isInteger(expires) || expires * 1000 <= now) return false;
  return safeEqual(parts[2], await hmac(secret, `${parts[0]}.${parts[1]}`), secret);
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > -1 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

export function passCookie(pass: string): string {
  return `${COOKIE_NAME}=${pass}; Path=/; Max-Age=${PASS_DAYS * 24 * 60 * 60}; HttpOnly; Secure; SameSite=Lax`;
}

/** Headers for every response the gate writes itself. */
export const PRIVATE_HEADERS: Record<string, string> = {
  'cache-control': 'private, no-store',
  'x-robots-tag': 'noindex, nofollow, noarchive, noimageindex',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};
