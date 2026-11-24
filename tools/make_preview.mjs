// Packages the built site (dist/) as a private review copy (preview/).
//
// The review copy is what gets published as a private Claude artifact so the
// host can open it on a phone or tablet before anything goes near Netlify.
// It differs from the Netlify build only in packaging:
//   - asset paths are made relative, because the page is not served from "/"
//   - fonts are embedded in the page and the script is inlined, so the page
//     depends on nothing but its own image files
// Usage: npm run build && node tools/make_preview.mjs
import { cpSync, rmSync, readFileSync, writeFileSync, readdirSync, unlinkSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const src = 'dist';
const out = 'preview';
rmSync(out, { recursive: true, force: true });
cpSync(src, out, { recursive: true });

let html = readFileSync(join(out, 'index.html'), 'utf8');

// Embed the fonts and drop their preload hints.
html = html.replace(/<link rel="preload" as="font"[^>]*>/g, '');
html = html.replace(/url\(\/_astro\/([^)]+\.woff2)\)/g, (_, file) => {
  const data = readFileSync(join(out, '_astro', file)).toString('base64');
  return `url(data:font/woff2;base64,${data})`;
});

// Inline the page script.
html = html.replace(/<script type="module" src="\/_astro\/([^"]+\.js)"><\/script>/g, (_, file) => {
  const code = readFileSync(join(out, '_astro', file), 'utf8').replace(/<\/script/g, '<\\/script');
  return `<script type="module">${code}</script>`;
});

// Everything else (images, textures) loads by relative path, from a folder
// without a leading underscore (artifact hosting reserves that prefix).
html = html.replaceAll('/_astro/', './assets/');
html = html.replace('<title>The Velvet Cellar</title>', '<title>The Velvet Cellar: Checkpoint 4 preview</title>');
// Mark the copy as a preview, so features that need the live site say so instead of pretending.
html = html.replace('<html lang="en-GB"', '<html lang="en-GB" data-preview');
if (!html.includes('data-preview')) throw new Error('Could not mark the page as a preview.');

if (html.includes('_astro/')) throw new Error('An absolute asset path survived packaging.');
writeFileSync(join(out, 'index.html'), html);

for (const file of readdirSync(join(out, '_astro'))) {
  if (/\.(woff2|js)$/.test(file)) unlinkSync(join(out, '_astro', file));
}
renameSync(join(out, '_astro'), join(out, 'assets'));
// The entrance and the calendar file belong to the live site only.
rmSync(join(out, 'door'), { recursive: true, force: true });
rmSync(join(out, 'the-velvet-cellar.ics'), { force: true });
rmSync(join(out, 'robots.txt'), { force: true });
const files = readdirSync(join(out, 'assets'));
console.log(`preview/index.html ${(html.length / 1024).toFixed(0)} KB, plus ${files.length} image files`);
