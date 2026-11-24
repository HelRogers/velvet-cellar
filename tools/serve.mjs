// A small static server for tests: serves a built folder for as long as a test runs.
// `onPost` lets a test decide how a form post is answered (the real answer comes from Netlify).
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ics': 'text/calendar; charset=utf-8',
  '.txt': 'text/plain',
};

export async function startServer(folder, { onPost } = {}) {
  const dir = resolve(folder);
  const posts = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        posts.push({ path: url.pathname, body });
        const status = onPost ? onPost({ path: url.pathname, body }) : 404;
        res.writeHead(status).end(status === 200 ? 'ok' : 'refused');
      });
      return;
    }
    let file = join(dir, normalize(decodeURIComponent(url.pathname)));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file.startsWith(dir) || !existsSync(file)) return res.writeHead(404).end('Not found');
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { base: `http://127.0.0.1:${server.address().port}/`, posts, close: () => server.close() };
}
