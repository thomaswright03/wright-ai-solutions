// /admin: Thomas's private leads list. Every saved outline, newest first, the
// counts per ad, a CSV download and a delete button. It asks for the
// ADMIN_PASSWORD secret (the browser's own sign-in box) and is off entirely
// until that password and the database exist.
import { features, settings } from './config.js';
import { dayIn, ensureSchema, formatIn } from './db.js';
import { bytesToText, escapeHtml as esc, htmlResponse, overLimit } from './http.js';
import { page } from './pages.js';

const LIST_LIMIT = 200;

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

// Compares hashes byte by byte without stopping early, so response time
// doesn't hint at how much of a guess was right.
async function signedIn(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  let password;
  try {
    const decoded = bytesToText(Uint8Array.from(atob(header.slice(6).trim()), c => c.charCodeAt(0)));
    password = decoded.slice(decoded.indexOf(':') + 1);
  } catch {
    return false;
  }
  const [given, expected] = await Promise.all([sha256(password), sha256(env.ADMIN_PASSWORD)]);
  let difference = 0;
  for (let i = 0; i < given.length; i++) difference |= given[i] ^ expected[i];
  return difference === 0;
}

// The Worker's pages send no referrer at all, which makes browsers label a
// form's POST as coming from nowhere (Origin: null). The leads list sends it
// within this site only, so its delete button's POST says where it came from.
const adminPage = (body, status = 200, extra = {}) => htmlResponse(body, status, { 'Referrer-Policy': 'same-origin', ...extra });

const notFound = () => adminPage(page({ title: 'Page not found', body: '<h1>Page not found</h1>' }), 404);

const STEPS = [['view', 'Visits'], ['outline', 'Outlines'], ['save', 'Saved'], ['book', 'Booked']];

function countsTable(rows) {
  const byAd = new Map();
  for (const { ad, src, step, n } of rows) {
    const key = `${ad}|${src}`;
    if (!byAd.has(key)) byAd.set(key, { ad, src, view: 0, outline: 0, save: 0, book: 0 });
    if (byAd.get(key)[step] !== undefined) byAd.get(key)[step] += Number(n) || 0;
  }
  if (!byAd.size) return '<p>No visits counted yet.</p>';
  const lines = [...byAd.values()].sort((a, b) => b.view - a.view || b.save - a.save);
  const total = lines.reduce((sum, line) => {
    for (const [step] of STEPS) sum[step] += line[step];
    return sum;
  }, { ad: 'All', src: '', view: 0, outline: 0, save: 0, book: 0 });
  const row = (line, tag = 'td') => `<tr><${tag} scope="row">${esc(line.ad === 'none' ? 'No ad' : line.ad)}${line.src && line.src !== 'direct' ? ` <span class="admin-muted">(${esc(line.src)})</span>` : ''}</${tag}>${STEPS.map(([step]) => `<td>${line[step]}</td>`).join('')}</tr>`;
  return `<div class="admin-scroll"><table class="admin-table">
<caption>Last 30 days, by ad</caption>
<thead><tr><th scope="col">Ad</th>${STEPS.map(([, label]) => `<th scope="col">${label}</th>`).join('')}</tr></thead>
<tbody>${lines.map(line => row(line)).join('')}</tbody>
<tfoot>${row(total, 'th')}</tfoot>
</table></div>`;
}

// How each outline was written, so a prompt or model change that quietly
// sends everyone the templates shows up here.
const OUTCOMES = [
  ['ai', 'Written by AI'],
  ['cap', 'Template: daily AI limit reached'],
  ['error', 'Template: the AI timed out or was down'],
  ['rejected', 'Template: the AI\'s reply broke a rule'],
  ['unusable', 'Template: not a business problem'],
  ['off', 'Template: AI not connected'],
];

function outcomesTable(rows) {
  const byOutcome = new Map(rows.map(({ outcome, n }) => [outcome, Number(n) || 0]));
  const total = [...byOutcome.values()].reduce((sum, n) => sum + n, 0);
  if (!total) return '<p>No outlines written yet.</p>';
  const share = n => `${Math.round((n / total) * 100)}%`;
  const lines = OUTCOMES.filter(([key]) => byOutcome.get(key));
  return `<div class="admin-scroll"><table class="admin-table">
<caption>Last 30 days, how each outline was written</caption>
<thead><tr><th scope="col">Outline</th><th scope="col">Count</th><th scope="col">Share</th></tr></thead>
<tbody>${lines.map(([key, label]) => `<tr><th scope="row">${esc(label)}</th><td>${byOutcome.get(key)}</td><td>${share(byOutcome.get(key))}</td></tr>`).join('')}</tbody>
<tfoot><tr><th scope="row">All</th><td>${total}</td><td>100%</td></tr></tfoot>
</table></div>`;
}

function leadCard(lead, timeZone) {
  const when = iso => formatIn(timeZone, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(iso));
  let outline = null;
  try { outline = JSON.parse(lead.outline); } catch { /* shown without it */ }
  const booked = lead.booked_at === 'pending'
    ? 'Booking didn\'t finish; check Cal.com'
    : lead.booked_at ? `Call booked for ${when(lead.booked_at)}` : 'No call booked';
  const facts = [
    ['From', `${lead.ad === 'none' ? 'No ad' : `${lead.ad} ad`}${lead.src !== 'direct' ? ` (${lead.src})` : ''}`],
    ['Outline', lead.source === 'ai' ? 'Written by AI' : 'Template'],
    ['Call', booked],
    ['Reminder', lead.follow_up ? (lead.follow_up_sent_at ? `Sent ${when(lead.follow_up_sent_at)}` : 'Asked for one') : 'None'],
  ];
  return `<article class="admin-lead">
  <h2><a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a>${lead.name ? ` <span class="admin-muted">${esc(lead.name)}</span>` : ''}</h2>
  <p class="admin-muted">Saved ${esc(when(lead.created_at))}${outline ? ` · ${esc(outline.title)}` : ''}</p>
  <dl class="admin-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
  <details>
    <summary>Their words${outline ? ' and the outline' : ''}</summary>
    <blockquote>${esc(lead.problem)}</blockquote>
    ${outline ? `<p><strong>What I'd build:</strong> ${esc(outline.build)}</p>
    <p><strong>First milestone:</strong> ${esc(outline.milestone)}</p>
    <p><strong>Questions:</strong></p><ul>${(outline.questions || []).map(q => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
  </details>
  <form method="post" action="/admin/delete" class="admin-delete">
    <input type="hidden" name="id" value="${esc(lead.id)}">
    <button type="submit" class="btn btn-ghost">Delete this lead</button>
  </form>
</article>`;
}

// A spreadsheet cell: quoted, and never starting with a character a
// spreadsheet would run as a formula.
function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

async function csv(env) {
  const { results } = await env.DB.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT 5000').all();
  const columns = ['created_at', 'email', 'name', 'ad', 'src', 'kind', 'source', 'follow_up', 'follow_up_sent_at', 'booked_at', 'title', 'problem'];
  const lines = [columns.join(',')];
  for (const lead of results || []) {
    let title = '';
    try { title = JSON.parse(lead.outline).title; } catch { /* left blank */ }
    lines.push(columns.map(c => csvCell(c === 'title' ? title : lead[c])).join(','));
  }
  return new Response(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    },
  });
}

export async function adminRoute(request, env, url) {
  if (!features(env).admin) return notFound();
  if (await overLimit(env.ADMIN_LIMIT, request)) return adminPage('Too many requests. Wait a minute.', 429, { 'Retry-After': '60' });
  if (!(await signedIn(request, env))) {
    return adminPage(page({ title: 'Sign in', body: '<h1>Sign in to see your leads</h1><p>Use the ADMIN_PASSWORD you set in Cloudflare. Any username works.</p>' }), 401, {
      'WWW-Authenticate': 'Basic realm="Leads", charset="UTF-8"',
    });
  }
  await ensureSchema(env.DB);
  const timeZone = settings(env).ownerTz;

  if (url.pathname === '/admin/delete') {
    if (request.method !== 'POST') return adminPage('Method not allowed', 405, { Allow: 'POST' });
    // The browser re-sends the password on any request to this site, so only a
    // form on this site's own page may delete. Browsers mark where a request
    // came from in headers no page can set: Origin, and Sec-Fetch-Site.
    const fromThisSite = request.headers.get('Origin') === url.origin || request.headers.get('Sec-Fetch-Site') === 'same-origin';
    if (!fromThisSite) return adminPage('Forbidden', 403);
    const form = await request.formData().catch(() => null);
    const id = form ? form.get('id') : null;
    if (typeof id === 'string' && /^[A-Za-z0-9_-]{10,40}$/.test(id)) {
      await env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(id).run();
    }
    return new Response(null, { status: 303, headers: { Location: '/admin', 'Cache-Control': 'no-store' } });
  }
  if (request.method !== 'GET') return adminPage('Method not allowed', 405, { Allow: 'GET' });
  if (url.pathname === '/admin/leads.csv') return csv(env);
  if (url.pathname !== '/admin') return notFound();

  const since = dayIn(timeZone, new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));
  const [counts, outcomes, leads, total] = await Promise.all([
    env.DB.prepare('SELECT ad, src, step, SUM(n) AS n FROM counts WHERE day >= ? GROUP BY ad, src, step').bind(since).all(),
    env.DB.prepare('SELECT outcome, SUM(n) AS n FROM outline_outcomes WHERE day >= ? GROUP BY outcome').bind(since).all(),
    env.DB.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT ?').bind(LIST_LIMIT).all(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM leads').first('n'),
  ]);
  const list = leads.results || [];
  const body = `<p class="eyebrow">Private</p>
<h1>Leads</h1>
<p>${Number(total) || 0} saved outline${Number(total) === 1 ? '' : 's'}, newest first${Number(total) > LIST_LIMIT ? ` (showing the latest ${LIST_LIMIT})` : ''}. Each is deleted automatically a year after it was saved. <a href="/admin/leads.csv">Download all as a spreadsheet (CSV)</a></p>
${countsTable(counts.results || [])}
${outcomesTable(outcomes.results || [])}
${list.length ? list.map(lead => leadCard(lead, timeZone)).join('\n') : '<p>No leads yet.</p>'}`;
  return adminPage(page({ title: 'Leads', body, wide: true, extraCss: '/admin.css' }));
}
