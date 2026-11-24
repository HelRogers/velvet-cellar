/**
 * The gate: runs in front of every request to the site, on previews and production alike.
 *
 * Nothing is served without a valid door pass, apart from the entrance page and
 * the few files it needs to look right (fonts and material textures, which hold
 * nothing private). That includes direct requests for image files, documents and
 * any future API route.
 *
 * The code check itself lives in door.ts (path /enter), which is rate limited.
 */
import type { Config, Context } from '@netlify/edge-functions';
import { COOKIE_NAME, PRIVATE_HEADERS, passIsValid, readCookie, readSecrets } from '../lib/pass.ts';

declare const Netlify: { env: { get(name: string): string | undefined } };

/** Files anyone may fetch: the entrance and its fonts and textures. Nothing else. */
const OPEN_PATHS: RegExp[] = [
  /^\/door\/?$/,
  /^\/door\/index\.html$/,
  /^\/robots\.txt$/,
  /^\/_astro\/[A-Za-z0-9._-]+\.woff2$/,
  /^\/_astro\/(?:velvet|paper-champagne|parchment|grain)\.[A-Za-z0-9_-]+\.(?:webp|png)$/,
];

const isOpenPath = (pathname: string) => OPEN_PATHS.some((pattern) => pattern.test(pathname));

const refuse = (status: number, message: string) =>
  new Response(message, { status, headers: { ...PRIVATE_HEADERS, 'content-type': 'text/plain; charset=utf-8' } });

export default async function gate(request: Request, context: Context) {
  const url = new URL(request.url);
  const { secret, configured } = readSecrets(Netlify.env);

  if (isOpenPath(url.pathname)) return; // continue to the static file

  if (!configured) return refuse(503, 'The Velvet Cellar is closed for the moment.');

  if (await passIsValid(readCookie(request, COOKIE_NAME), secret)) return; // a guest: continue

  // No pass. A person arriving in a browser is shown the entrance, at the address
  // they asked for; anything else (images, files, scripts, form posts) is refused.
  const wantsPage =
    request.method === 'GET' &&
    (request.headers.get('accept') ?? '').includes('text/html') &&
    !/\.[a-z0-9]{2,5}$/i.test(url.pathname);
  if (wantsPage) return new URL('/door/', request.url);
  return refuse(401, 'Private correspondence. Strictly for invited guests.');
}

export const config: Config = {
  path: '/*',
  excludedPath: ['/enter'],
  onError: 'fail', // if the gate itself breaks, serve nothing
};
