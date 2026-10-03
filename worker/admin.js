// /admin: Thomas's private leads list. Every saved outline, newest first, the
// counts per ad, a CSV download and a delete button. It asks for the
// ADMIN_PASSWORD secret (the browser's own sign-in box) and is off entirely
// until that password and the database exist.
import { features, settings } from './config.js';
import { addressTag, audit, count, dayIn, ensureSchema, formatIn, hasDatabase } from './db.js';
import { evalReport } from './eval.js';
import { SERVICES, healthReport } from './health.js';
import { bytesToText, clientIp, escapeHtml as esc, htmlResponse, overLimit } from './http.js';
import { page } from './pages.js';
import { notify } from './services.js';

const LIST_LIMIT = 200;
const HOUR = 60 * 60 * 1000;
// Wrong passwords from one address in an hour before the list stops checking
// them for that address. Counted in the database, so it holds even if the
// rate limit binding (ADMIN_LIMIT) doesn't.
export const ADMIN_FAILURES_PER_HOUR = 10;
// Wrong passwords from anywhere in an hour that make a phone alert.
export const ADMIN_FAILURE_ALERT = 20;

/** @param {string | undefined} text */
async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

// Compares hashes byte by byte without stopping early, so response time
// doesn't hint at how much of a guess was right.
/** @param {Request} request @param {Env} env */
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

// Logs a wrong password (never the password itself) and counts it, and alerts
// Thomas the moment wrong passwords from anywhere reach ADMIN_FAILURE_ALERT in
// an hour, so a guessing attempt is noticed while it happens.
/** @param {EnvWithDB} env @param {Request} request @param {URL} url @param {string} tag */
async function failedSignIn(env, request, url, tag) {
  const now = Date.now();
  console.warn(JSON.stringify({ level: 'warn', event: 'admin_sign_in_failed', path: url.pathname, ref: (request.headers.get('CF-Ray') || '').split('-')[0] || null }));
  const [, recent] = await env.DB.batch([
    env.DB.prepare('INSERT INTO admin_failures (tag, at) VALUES (?, ?)').bind(tag, new Date(now).toISOString()),
    env.DB.prepare('SELECT COUNT(*) AS n FROM admin_failures WHERE at > ?').bind(new Date(now - HOUR).toISOString()),
  ]);
  const n = Number(/** @type {{ n?: unknown }[]} */ (recent.results || [])[0]?.n);
  if (n === ADMIN_FAILURE_ALERT) {
    await notify(env, {
      title: 'Wrong passwords on your leads list',
      body: `${n} wrong passwords in the last hour. If that wasn't you, someone is guessing; each address is shut out after ${ADMIN_FAILURES_PER_HOUR}. Your password is safe as long as it's long and not used anywhere else.`,
      click: `${url.origin}/admin`,
    });
  }
}

// The Worker's pages send no referrer at all, which makes browsers label a
// form's POST as coming from nowhere (Origin: null). The leads list sends it
// within this site only, so its delete button's POST says where it came from.
/** @param {string} body @param {number} [status] @param {Record<string, string>} [extra] */
const adminPage = (body, status = 200, extra = {}) => htmlResponse(body, status, { 'Referrer-Policy': 'same-origin', ...extra });

const notFound = () => adminPage(page({ title: 'Page not found', body: '<h1>Page not found</h1>' }), 404);

/** @type {[CountStep, string][]} */
const STEPS = [['view', 'Visits'], ['outline', 'Outlines'], ['save', 'Saved'], ['book', 'Booked']];

/** @typedef {{ ad: string, src: string, view: number, outline: number, save: number, book: number }} CountLine */

/** @param {{ ad: string, src: string, step: CountStep, n: number }[]} rows */
function countsTable(rows) {
  /** @type {Map<string, CountLine>} */
  const byAd = new Map();
  for (const { ad, src, step, n } of rows) {
    const key = `${ad}|${src}`;
    if (!byAd.has(key)) byAd.set(key, { ad, src, view: 0, outline: 0, save: 0, book: 0 });
    const line = /** @type {CountLine} */ (byAd.get(key));
    if (line[step] !== undefined) line[step] += Number(n) || 0;
  }
  if (!byAd.size) return '<p>No visits counted yet.</p>';
  const lines = [...byAd.values()].sort((a, b) => b.view - a.view || b.save - a.save);
  const total = lines.reduce((sum, line) => {
    for (const [step] of STEPS) sum[step] += line[step];
    return sum;
  }, { ad: 'All', src: '', view: 0, outline: 0, save: 0, book: 0 });
  /** @param {CountLine} line @param {string} [tag] */
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
  ['guarded', 'Template: text aimed at the AI, not a business problem'],
  ['off', 'Template: AI not connected'],
];

/** @param {{ outcome: string, n: number }[]} rows */
function outcomesTable(rows) {
  const byOutcome = new Map(rows.map(({ outcome, n }) => [outcome, Number(n) || 0]));
  const total = [...byOutcome.values()].reduce((sum, n) => sum + n, 0);
  if (!total) return '<p>No outlines written yet.</p>';
  /** @param {number} n */
  const share = n => `${Math.round((n / total) * 100)}%`;
  const lines = OUTCOMES.filter(([key]) => byOutcome.get(key));
  return `<div class="admin-scroll"><table class="admin-table">
<caption>Last 30 days, how each outline was written</caption>
<thead><tr><th scope="col">Outline</th><th scope="col">Count</th><th scope="col">Share</th></tr></thead>
<tbody>${lines.map(([key, label]) => `<tr><th scope="row">${esc(label)}</th><td>${byOutcome.get(key)}</td><td>${share(/** @type {number} */ (byOutcome.get(key)))}</td></tr>`).join('')}</tbody>
<tfoot><tr><th scope="row">All</th><td>${total}</td><td>100%</td></tr></tfoot>
</table></div>`;
}

// Where a lead's call stands: 'booked', 'unconfirmed' (Cal.com never clearly
// answered, so the lead is held until Thomas checks) or 'none'; and the time
// booked or asked for.
/**
 * @param {Pick<LeadRow, 'booked_at' | 'booking_start'>} lead
 * @returns {{ status: 'unconfirmed', at: string | null } | { status: 'booked', at: string } | { status: 'none', at: null }}
 */
function callOf(lead) {
  if (lead.booked_at === 'pending') return { status: 'unconfirmed', at: lead.booking_start || null };
  return lead.booked_at ? { status: 'booked', at: lead.booked_at } : { status: 'none', at: null };
}

// For a call Cal.com didn't confirm: what was asked for, and two buttons to
// say what the calendar shows. "Booked" keeps the time; "not booked" lets the
// visitor pick a time again from the page.
/** @param {LeadRow} lead @param {(iso: string) => string} when */
function unconfirmedForm(lead, when) {
  const { at } = callOf(lead);
  const ask = at
    ? `Cal.com didn't confirm the call ${lead.name ? `${esc(lead.name)} asked for` : 'asked for'} on ${esc(when(at))}. Check your calendar, then:`
    : 'Cal.com didn\'t confirm this call, and the time asked for wasn\'t recorded. If your calendar has no call with this email:';
  return `<form method="post" action="/admin/booking" class="admin-booking">
    <input type="hidden" name="id" value="${esc(lead.id)}">
    <p>${ask}</p>
    ${at ? '<button type="submit" name="booked" value="yes" class="btn btn-primary">It\'s booked</button>' : ''}
    <button type="submit" name="booked" value="no" class="btn btn-ghost">Not booked: let them pick again</button>
  </form>`;
}

// The AI outline eval the site runs on itself (eval.js): the latest result,
// what it got wrong, any run under way, and the last few runs, so a slow slide
// shows before it reaches the bar.
/** @param {EvalReport} report @param {string} timeZone */
function evalPanel(report, timeZone) {
  /** @param {string} iso */
  const day = iso => formatIn(timeZone, { month: 'short', day: 'numeric' }).format(new Date(iso));
  const bar = `${Math.round(report.bar * 100)}%`;
  const lines = [];
  const { latest, running } = report;
  if (latest) {
    const missed = latest.results.filter(r => !r.pass);
    lines.push(`<p>On ${esc(day(latest.finishedAt))}, ${latest.passed} of ${latest.total} sample problems came back right (${Math.round(latest.rate * 100)}%; the bar is ${bar})${latest.kindTotal ? `, with the right kind of work for ${latest.kindRight} of ${latest.kindTotal}` : ''}.${latest.rate < report.bar ? ' <strong>Below the bar.</strong>' : ''}</p>`);
    if (missed.length) lines.push(`<p>Missed: ${missed.map(r => `${esc(r.id)} (expected ${esc(r.expect || '?')}, got ${esc(r.outcome)})`).join(', ')}.</p>`);
    if (!latest.current && !running) lines.push('<p>The model, prompt or cases have changed since; a new run starts within the hour.</p>');
  }
  if (running) lines.push(`<p>Run under way: ${running.done} of ${running.total} done.</p>`);
  if (!latest && !running) lines.push(`<p>${report.on ? 'Not run yet. It runs a few sample problems each hour' : 'Off until Workers AI and the database are connected'}.</p>`);
  if (report.history.length > 1) {
    /** @param {number} n @param {number} of */
    const share = (n, of) => (of ? `${n} of ${of} (${Math.round((n / of) * 100)}%)` : '–');
    lines.push(`<div class="admin-scroll"><table class="admin-table">
<caption>Recent runs, newest first</caption>
<thead><tr><th scope="col">Finished</th><th scope="col">Right</th><th scope="col">Right kind of work</th><th scope="col">Prompt and cases</th></tr></thead>
<tbody>${report.history.map(run => `<tr><th scope="row">${esc(day(run.finishedAt))}</th><td>${share(run.passed, run.total)}</td><td>${share(run.kindRight, run.kindTotal)}</td><td>${run.current ? 'Current' : 'Earlier'}</td></tr>`).join('')}</tbody>
</table></div>`);
  }
  return `<section class="admin-eval" aria-labelledby="eval-title">
<h2 id="eval-title">AI outline eval</h2>
${lines.join('\n')}
<p class="admin-muted">${report.cases} sample problems (worker/eval-cases.js), rerun weekly and whenever the prompt changes. Public result: <a href="/api/eval">/api/eval</a></p>
</section>`;
}

// Today's check of each outside service (health.js).
/** @param {HealthReport | null} report @param {string} timeZone */
function healthPanel(report, timeZone) {
  /** @param {string} iso */
  const when = iso => formatIn(timeZone, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  const rows = report ? Object.entries(report.services) : [];
  const body = !report
    ? '<p>Not checked yet. It runs once a day, in the hourly job.</p>'
    : rows.length
      ? `<ul class="admin-health">${rows.map(([name, r]) => `<li>${r.ok ? 'OK' : r.limited ? '<strong>Allowance used up</strong>' : '<strong>Failing</strong>'}: ${esc(SERVICES[name] || name)}, ${esc(r.note)}</li>`).join('')}</ul>`
      : '<p>No outside services are switched on yet.</p>';
  return `<section class="admin-eval" aria-labelledby="health-title">
<h2 id="health-title">Outside services</h2>
${report ? `<p>Checked ${esc(when(report.checkedAt))}.</p>` : ''}
${body}
<p class="admin-muted">Checked once a day, and again every hour while one is failing; a phone alert goes out when one fails (by email, to ntfy and your inbox, when ntfy doesn't take it directly). Public summary: <a href="/api/health">/api/health</a></p>
<form method="post" action="/admin/test-alert"><button type="submit" class="btn btn-ghost">Send a test alert</button></form>
</section>`;
}

// The latest changes to the list (admin_log): who did what isn't recorded
// beyond "you" (the list has one password) or "the visitor" (their delete link).
const CHANGES_SHOWN = 30;

/** @param {AuditRow[]} rows @param {string} timeZone */
function changesPanel(rows, timeZone) {
  /** @param {string} iso */
  const when = iso => formatIn(timeZone, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  const body = rows.length
    ? `<ul class="admin-health">${rows.map(r => `<li>${esc(when(r.at))}: ${esc(r.action)}${r.lead ? ` <span class="admin-muted">(lead ${esc(r.lead.slice(0, 8))})</span>` : ''}</li>`).join('')}</ul>`
    : '<p>No changes yet.</p>';
  return `<section class="admin-eval" aria-labelledby="changes-title">
<h2 id="changes-title">Changes</h2>
${body}
<p class="admin-muted">Every delete, booking you settled and download, newest first (the latest ${CHANGES_SHOWN}). Kept about 13 months.</p>
</section>`;
}

/** @param {LeadRow} lead @param {string} timeZone */
function leadCard(lead, timeZone) {
  /** @param {string} iso */
  const when = iso => formatIn(timeZone, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(iso));
  /** @type {Outline | null} */
  let outline = null;
  try { outline = JSON.parse(lead.outline); } catch { /* shown without it */ }
  const call = callOf(lead);
  const booked = call.status === 'unconfirmed'
    ? `Unconfirmed${call.at ? ` for ${when(call.at)}` : ''}; check Cal.com`
    : call.status === 'booked' ? `Call booked for ${when(call.at)}` : 'No call booked';
  const facts = [
    ['From', `${lead.ad === 'none' ? 'No ad' : `${lead.ad} ad`}${lead.src !== 'direct' ? ` (${lead.src})` : ''}`],
    ['Outline', lead.source === 'ai' ? 'Written by AI' : 'Template'],
    ['Call', booked],
    ['Reminder', lead.follow_up ? (lead.follow_up_sent_at ? `Sent ${when(lead.follow_up_sent_at)}` : 'Asked for one') : 'None'],
  ];
  return `<article class="admin-lead" id="lead-${esc(lead.id)}">
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
  ${call.status === 'unconfirmed' ? unconfirmedForm(lead, when) : ''}
  <form method="post" action="/admin/delete" class="admin-delete">
    <input type="hidden" name="id" value="${esc(lead.id)}">
    <button type="submit" class="btn btn-ghost">Delete this lead</button>
  </form>
</article>`;
}

// A spreadsheet cell: quoted, and never starting with a character a
// spreadsheet would run as a formula.
/** @param {unknown} value */
function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** @param {EnvWithDB} env */
async function csv(env) {
  /** @type {D1Result<LeadRow>} */
  const { results } = await env.DB.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT 5000').all();
  // call: booked, unconfirmed (check Cal.com) or none; call_at: the time
  // booked, or asked for while unconfirmed.
  const columns = ['created_at', 'email', 'name', 'ad', 'src', 'kind', 'source', 'follow_up', 'follow_up_sent_at', 'call', 'call_at', 'title', 'problem'];
  const lines = [columns.join(',')];
  for (const lead of results || []) {
    let title = '';
    try { title = JSON.parse(lead.outline).title; } catch { /* left blank */ }
    const { status, at } = callOf(lead);
    /** @type {Record<string, unknown>} */
    const row = { ...lead, title, call: status, call_at: at };
    lines.push(columns.map(c => csvCell(row[c])).join(','));
  }
  return new Response(`${lines.join('\r\n')}\r\n`, {
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

// Thomas's answer for a call Cal.com didn't confirm. 'yes' records the call at
// the time asked for (and counts it as booked); 'no' frees the lead, so the
// visitor can pick a time again from the page. Only an unconfirmed lead changes.
/** @param {EnvWithDB} env @param {string} timeZone @param {string} id @param {unknown} booked */
async function settleBooking(env, timeZone, id, booked) {
  if (booked === 'yes') {
    /** @type {CameFrom | null} */
    const lead = await env.DB.prepare(
      "UPDATE leads SET booked_at = booking_start WHERE id = ? AND booked_at = 'pending' AND booking_start IS NOT NULL RETURNING ad, src",
    ).bind(id).first();
    if (lead) await Promise.all([count(env, timeZone, lead, 'book'), audit(env.DB, 'marked booked', id)]);
  } else if (booked === 'no') {
    const freed = await env.DB.prepare("UPDATE leads SET booked_at = NULL, booking_start = NULL WHERE id = ? AND booked_at = 'pending'").bind(id).run();
    if (freed.meta && freed.meta.changes) await audit(env.DB, 'marked not booked', id);
  }
}

/** @param {Request} request @param {Env} env @param {URL} url */
export async function adminRoute(request, env, url) {
  if (!features(env).admin || !hasDatabase(env)) return notFound();
  if (await overLimit(env.ADMIN_LIMIT, request, env)) return adminPage('Too many requests. Wait a minute.', 429, { 'Retry-After': '60' });
  await ensureSchema(env.DB);
  const tag = await addressTag(env, clientIp(request));
  const failures = await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_failures WHERE tag = ? AND at > ?')
    .bind(tag, new Date(Date.now() - HOUR).toISOString()).first('n');
  if (Number(failures) >= ADMIN_FAILURES_PER_HOUR) return adminPage('Too many wrong passwords. Try again in an hour.', 429, { 'Retry-After': '3600' });
  if (!(await signedIn(request, env))) {
    // A browser asks without a password first; only a wrong one counts.
    if (request.headers.has('Authorization')) await failedSignIn(env, request, url, tag);
    return adminPage(page({ title: 'Sign in', body: '<h1>Sign in to see your leads</h1><p>Use the ADMIN_PASSWORD you set in Cloudflare. Any username works.</p>' }), 401, {
      'WWW-Authenticate': 'Basic realm="Leads", charset="UTF-8"',
    });
  }
  const timeZone = settings(env).ownerTz;

  if (url.pathname === '/admin/delete' || url.pathname === '/admin/booking' || url.pathname === '/admin/test-alert') {
    if (request.method !== 'POST') return adminPage('Method not allowed', 405, { Allow: 'POST' });
    // The browser re-sends the password on any request to this site, so only a
    // form on this site's own page may change anything. Browsers mark where a
    // request came from in headers no page can set: Origin, and Sec-Fetch-Site.
    const fromThisSite = request.headers.get('Origin') === url.origin || request.headers.get('Sec-Fetch-Site') === 'same-origin';
    if (!fromThisSite) return adminPage('Forbidden', 403);
    /** @param {string} location */
    const back = location => new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } });
    if (url.pathname === '/admin/test-alert') {
      const how = await notify(env, { title: 'Test alert', body: 'You asked for this from your leads list. Alerts are reaching you.', click: `${url.origin}/admin#health-title` });
      const last = how === 'email' ? JSON.parse(String(await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('last_alert').first('value'))) : null;
      await audit(env.DB, how === 'phone' ? 'sent a test alert (by phone)' : how ? `sent a test alert (by email to ntfy and your inbox; ntfy directly: ${last ? last.reason : 'failed'})` : 'sent a test alert, which failed (no phone alert and no email)');
      return back('/admin#changes-title');
    }
    const form = await request.formData().catch(() => null);
    const id = form ? form.get('id') : null;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{10,40}$/.test(id)) return back('/admin');
    if (url.pathname === '/admin/delete') {
      const deleted = await env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(id).run();
      if (deleted.meta && deleted.meta.changes) await audit(env.DB, 'deleted', id);
      return back('/admin');
    }
    await settleBooking(env, timeZone, id, /** @type {FormData} */ (form).get('booked'));
    return back(`/admin#lead-${id}`);
  }
  if (request.method !== 'GET') return adminPage('Method not allowed', 405, { Allow: 'GET' });
  if (url.pathname === '/admin/leads.csv') {
    await audit(env.DB, 'downloaded the list');
    return csv(env);
  }
  if (url.pathname !== '/admin') return notFound();

  const since = dayIn(timeZone, new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));
  const [counts, outcomes, leads, total, evaluation, health, changes] = await Promise.all([
    /** @type {Promise<D1Result<{ ad: string, src: string, step: CountStep, n: number }>>} */ (env.DB.prepare('SELECT ad, src, step, SUM(n) AS n FROM counts WHERE day >= ? GROUP BY ad, src, step').bind(since).all()),
    /** @type {Promise<D1Result<{ outcome: string, n: number }>>} */ (env.DB.prepare('SELECT outcome, SUM(n) AS n FROM outline_outcomes WHERE day >= ? GROUP BY outcome').bind(since).all()),
    /** @type {Promise<D1Result<LeadRow>>} */ (env.DB.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT ?').bind(LIST_LIMIT).all()),
    env.DB.prepare('SELECT COUNT(*) AS n FROM leads').first('n'),
    evalReport(env),
    healthReport(env),
    /** @type {Promise<D1Result<AuditRow>>} */ (env.DB.prepare('SELECT at, action, lead FROM admin_log ORDER BY id DESC LIMIT ?').bind(CHANGES_SHOWN).all()),
  ]);
  const list = leads.results || [];
  const body = `<p class="eyebrow">Private</p>
<h1>Leads</h1>
<p>${Number(total) || 0} saved outline${Number(total) === 1 ? '' : 's'}, newest first${Number(total) > LIST_LIMIT ? ` (showing the latest ${LIST_LIMIT})` : ''}. Each is deleted automatically a year after it was saved. <a href="/admin/leads.csv">Download all as a spreadsheet (CSV)</a></p>
${countsTable(counts.results || [])}
${outcomesTable(outcomes.results || [])}
${evalPanel(evaluation, timeZone)}
${healthPanel(health, timeZone)}
${changesPanel(changes.results || [], timeZone)}
${list.length ? list.map(lead => leadCard(lead, timeZone)).join('\n') : '<p>No leads yet.</p>'}`;
  return adminPage(page({ title: 'Leads', body, wide: true, extraCss: '/admin.css' }));
}
