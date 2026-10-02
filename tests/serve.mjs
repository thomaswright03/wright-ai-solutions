// Minimal static server for the browser tests and the local preview. It mimics
// how Cloudflare Workers serves this repo (see wrangler.jsonc): the paths in
// run_worker_first run worker/index.js, "/privacy" serves privacy.html, unknown
// paths get 404.html with a 404 status, files listed in .assetsignore are not
// served, and the rules in _headers are applied (so a Content-Security-Policy
// violation shows up as a console error in tests).
//
// The Worker gets stand-in services (tests/fakes.mjs) instead of real accounts:
// a local database, and emails, bookings and phone alerts kept in memory. Open
// http://localhost:4173/__outbox to see what would have been sent. There's no
// AI here, so outlines come from the templates.
//
// A request header "x-test-env" picks a separate set of stand-ins, for tests:
// "bare" (nothing connected), or any of "turnstile", "caldown", "callost", "emaildown",
// "nobook" (no Cal.com link) and "noreminder" (no postal address) joined with
// "+". Any other word just names a fresh set, so tests don't share saved leads
// or booked times. Without the header, everything is connected ("demo").
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/index.js';
import { FakeServices, fakeContext, withFakes } from './fakes.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT || 4173);

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

// wrangler.jsonc is JSON with comments; drop the comments (outside strings) to read it.
function readJsonc(file) {
  const text = readFileSync(file, 'utf8');
  let out = '';
  for (let i = 0, inString = false; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') out += text[++i];
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else {
      out += c;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

const toPattern = glob => new RegExp('^' + glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
const workerFirst = readJsonc(join(root, 'wrangler.jsonc')).assets.run_worker_first.map(toPattern);

const ignored = readFileSync(join(root, '.assetsignore'), 'utf8')
  .split('\n').map(l => l.trim()).filter(Boolean);
const isIgnored = rel => rel === '_headers' || ignored.some(p => rel === p || rel.startsWith(p + '/'));

// _headers: blocks of "<path pattern>" followed by indented "Name: value" lines,
// or "! Name" to drop a header an earlier rule set. "#" lines are comments.
const headerRules = [];
for (const line of readFileSync(join(root, '_headers'), 'utf8').split('\n')) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (!/^\s/.test(line)) {
    const pattern = new RegExp('^' + line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    headerRules.push({ pattern, detach: [], headers: [] });
  } else if (line.trim().startsWith('!')) {
    headerRules.at(-1).detach.push(line.trim().slice(1).trim().toLowerCase());
  } else {
    const i = line.indexOf(':');
    headerRules.at(-1).headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
}

// Like Cloudflare: rules apply in order, "! Name" removes what earlier rules set,
// and a header set by two rules gets both values joined with a comma.
function headersFor(pathname) {
  const out = new Map();
  for (const rule of headerRules) {
    if (!rule.pattern.test(pathname)) continue;
    for (const name of rule.detach) out.delete(name);
    for (const [name, value] of rule.headers) {
      const key = name.toLowerCase();
      out.set(key, out.has(key) ? [name, `${out.get(key)[1]}, ${value}`] : [name, value]);
    }
  }
  return out.values();
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

// One set of stand-in services per mode, kept for the life of the server.
const modes = new Map();
function fakesFor(mode) {
  const name = /^[a-z+]{1,60}$/.test(mode || '') ? mode : 'demo';
  if (!modes.has(name)) {
    const flags = new Set(name.split('+'));
    const fakes = new FakeServices({
      bare: flags.has('bare'),
      turnstile: flags.has('turnstile'),
      calDown: flags.has('caldown'),
      calLost: flags.has('callost'),
      emailDown: flags.has('emaildown'),
    });
    if (flags.has('nobook')) delete fakes.env.CAL_LINK;
    if (flags.has('noreminder')) delete fakes.env.POSTAL_ADDRESS;
    modes.set(name, fakes);
  }
  return modes.get(name);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Hands the run_worker_first paths to the Worker, the way Cloudflare does. Work
// the Worker hands to waitUntil finishes before the response goes out, so tests
// can check it straight away.
async function runWorker(req, res) {
  const raw = await readBody(req);
  const request = new Request(new URL(req.url, `http://${req.headers.host}`), {
    method: req.method,
    headers: Object.entries(req.headers).filter(([, v]) => typeof v === 'string'),
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : raw,
  });
  const fakes = fakesFor(req.headers['x-test-env']);
  const ctx = fakeContext();
  const response = await withFakes(fakes, async () => {
    const r = await worker.fetch(request, fakes.env, ctx);
    await ctx.settle();
    return r;
  });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Local-only pages: what the stand-in services received, for people (/__outbox)
// and for the tests (/__test/...).
async function runTestPage(req, res, url) {
  const fakes = fakesFor(url.searchParams.get('mode'));
  const send = (status, type, body) => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  if (url.pathname === '/__test/state') {
    return send(200, 'application/json', JSON.stringify({ emails: fakes.emails, alerts: fakes.alerts, bookings: fakes.bookings, botChecks: fakes.botChecks }));
  }
  if (url.pathname === '/__test/cron' && req.method === 'POST') {
    const now = Number(url.searchParams.get('now')) || Date.now();
    const ctx = fakeContext();
    await withFakes(fakes, async () => {
      await worker.scheduled({ scheduledTime: now }, fakes.env, ctx);
      await ctx.settle();
    });
    return send(200, 'application/json', '{"ok":true}');
  }
  if (url.pathname === '/__test/sql' && req.method === 'POST') {
    const { sql, params = [] } = JSON.parse((await readBody(req)).toString() || '{}');
    const stmt = fakes.env.DB.prepare(sql).bind(...params);
    return send(200, 'application/json', JSON.stringify(/^\s*select/i.test(sql) ? (await stmt.all()).results : (await stmt.run()).meta));
  }
  if (url.pathname === '/__outbox') {
    const emails = [...fakes.emails].reverse().map(e => `
<article><h2>${esc(e.subject)}</h2><p>To ${esc(e.to)} · From ${esc(e.from)} · Reply-To ${esc(e.reply_to)}</p>
<iframe sandbox title="${esc(e.subject)}" srcdoc="${esc(e.html)}"></iframe></article>`).join('');
    const alerts = [...fakes.alerts].reverse().map(a => `<li><strong>${esc(a.title)}</strong>: ${esc(a.body)}</li>`).join('');
    const bookings = [...fakes.bookings].reverse().map(b => `<li>${esc(b.start)}: ${esc(b.attendee && b.attendee.name)} (${esc(b.attendee && b.attendee.email)})</li>`).join('');
    return send(200, 'text/html; charset=utf-8', `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Local outbox</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:0 1rem;line-height:1.5}iframe{width:100%;height:520px;border:1px solid #ccc;border-radius:8px}article{margin:2rem 0}</style></head>
<body><h1>Local outbox</h1><p>What the local preview would have sent. Nothing here leaves this computer.</p>
<h2>Phone alerts</h2><ul>${alerts || '<li>None yet</li>'}</ul>
<h2>Calls booked</h2><ul>${bookings || '<li>None yet</li>'}</ul>
<h2>Emails</h2>${emails || '<p>None yet</p>'}</body></html>`);
  }
  return send(404, 'text/plain', 'Not found');
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;
  const fail = err => {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  };
  if (pathname === '/__outbox' || pathname.startsWith('/__test/')) {
    runTestPage(req, res, url).catch(fail);
    return;
  }
  if (workerFirst.some(re => re.test(pathname))) {
    runWorker(req, res).catch(fail);
    return;
  }
  const file = resolve(pathname);
  const status = file ? 200 : 404;
  const target = file || join(root, '404.html');
  for (const [k, v] of headersFor(pathname)) res.setHeader(k, v);
  res.writeHead(status, { 'Content-Type': types[extname(target)] || 'application/octet-stream' });
  res.end(readFileSync(target));
}).listen(port, () => console.log(`Serving ${root} on http://localhost:${port}`));
