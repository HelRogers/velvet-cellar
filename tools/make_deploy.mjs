// Packages the built site (dist/) as a ZIP ready to upload to Netlify by hand.
// The ZIP holds the site's files at its top level, with index.html at the root.
// Usage: npm run build && node tools/make_deploy.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const dist = resolve('dist');
const outDir = resolve('deploy');
const zip = join(outDir, `the-velvet-cellar-site-v${version}.zip`);

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const files = walk(dist).map((path) => relative(dist, path));

// Refuse to package anything that must never be published.
const problems = [];
if (!files.includes('index.html')) problems.push('index.html is missing');
if (!files.includes('_headers')) problems.push('_headers (the no-index rules) is missing');
for (const file of files) {
  if (/\.pdf$/i.test(file) && !/^booklets\//.test(file)) problems.push(`unexpected PDF: ${file}`);
  if (/narration|clue|host.?s?.?guide|solution|reveal/i.test(file)) problems.push(`looks like kit material: ${file}`);
  if (statSync(join(dist, file)).size > 10 * 1024 * 1024) problems.push(`over 10 MB: ${file}`);
}
const html = readFileSync(join(dist, 'index.html'), 'utf8');
if (!/name="robots" content="noindex/.test(html)) problems.push('the page is missing its no-index instruction');
if (problems.length) {
  console.error('Not packaged:\n- ' + problems.join('\n- '));
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
rmSync(zip, { force: true });
execFileSync('zip', ['-q', '-r', '-X', zip, '.'], { cwd: dist });
const size = (statSync(zip).size / 1024 / 1024).toFixed(1);
console.log(`${relative(process.cwd(), zip)}  ${size} MB, ${files.length} files`);
