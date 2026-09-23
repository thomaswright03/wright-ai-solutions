// Minimal static server for the browser tests. It mimics how Cloudflare Workers
// static assets serve this repo (see wrangler.jsonc): "/privacy" serves
// privacy.html, unknown paths get 404.html with a 404 status, files listed in
// .assetsignore are not served, and the rules in _headers are applied (so a
// Content-Security-Policy violation shows up as a console error in tests).
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT || 4173);

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

const ignored = readFileSync(join(root, '.assetsignore'), 'utf8')
  .split('\n').map(l => l.trim()).filter(Boolean);
const isIgnored = rel => rel === '_headers' || ignored.some(p => rel === p || rel.startsWith(p + '/'));

// _headers: blocks of "<path pattern>" followed by indented "Name: value" lines.
const headerRules = [];
for (const line of readFileSync(join(root, '_headers'), 'utf8').split('\n')) {
  if (!line.trim()) continue;
  if (!/^\s/.test(line)) {
    const pattern = new RegExp('^' + line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    headerRules.push({ pattern, headers: [] });
  } else {
    const i = line.indexOf(':');
    headerRules.at(-1).headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
}

function resolve(pathname) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '').split(sep).join('/');
  if (rel.startsWith('..') || isIgnored(rel)) return null;
  const candidates = rel === '' ? ['index.html'] : [rel, rel + '.html', rel + '/index.html'];
  for (const c of candidates) {
    const file = join(root, c);
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const file = resolve(pathname);
  const status = file ? 200 : 404;
  const target = file || join(root, '404.html');
  for (const rule of headerRules) {
    if (rule.pattern.test(pathname)) for (const [k, v] of rule.headers) res.setHeader(k, v);
  }
  res.writeHead(status, { 'Content-Type': types[extname(target)] || 'application/octet-stream' });
  res.end(readFileSync(target));
}).listen(port, () => console.log(`Serving ${root} on http://localhost:${port}`));
