/**
 * The door: checks the password and hands out the pass.
 *
 *   POST /enter           the form on the entrance page (field: code)
 *   GET  /enter?key=CODE  the private invitation link sent to guests
 *
 * Both are rate limited per visitor, so the password cannot be guessed at speed.
 * A correct code sets the signed pass cookie and sends the guest to the invitation.
 */
import type { Config, Context } from '@netlify/edge-functions';
import { PRIVATE_HEADERS, issuePass, passCookie, readSecrets, safeEqual } from '../lib/pass.ts';

declare const Netlify: { env: { get(name: string): string | undefined } };

const redirect = (request: Request, path: string, cookie?: string) => {
  const headers = new Headers({ ...PRIVATE_HEADERS, location: new URL(path, request.url).toString() });
  if (cookie) headers.set('set-cookie', cookie);
  return new Response(null, { status: 303, headers });
};

export default async function door(request: Request, _context: Context) {
  const { code, secret, configured } = readSecrets(Netlify.env);
  if (!configured) {
    return new Response('The Velvet Cellar is closed for the moment.', {
      status: 503,
      headers: { ...PRIVATE_HEADERS, 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  let offered = '';
  if (request.method === 'POST') {
    try {
      const form = await request.formData();
      offered = String(form.get('code') ?? '');
    } catch {
      offered = '';
    }
  } else if (request.method === 'GET') {
    offered = new URL(request.url).searchParams.get('key') ?? '';
  } else {
    return new Response('Method not allowed.', { status: 405, headers: { ...PRIVATE_HEADERS, allow: 'GET, POST' } });
  }

  offered = offered.trim().slice(0, 100);
  // The password is not case sensitive: guests will be typing it on phones.
  const matches = offered.length > 0 && (await safeEqual(offered.toLowerCase(), code.toLowerCase(), secret));
  if (!matches) return redirect(request, '/door/?refused=1');

  return redirect(request, '/', passCookie(await issuePass(secret)));
}

export const config: Config = {
  path: '/enter',
  onError: 'fail',
  rateLimit: {
    windowLimit: 10, // attempts
    windowSize: 60, // per minute
    aggregateBy: ['ip', 'domain'],
  },
};
