// Everything after the outline: saving it (email to the visitor, a copy to
// Thomas, a row in the leads list), booking the call through Cal.com, the
// "delete my details" link, page-view counting, and the hourly job that sends
// the one next-day reminder and deletes old leads.
import { adFor } from '../outlines.js';
import { calEvent, features, settings } from './config.js';
import { count, dayIn, ensureSchema, hourIn, newId, sign, verify } from './db.js';
import { followUpEmail, leadEmail, outlineEmail } from './emails.js';
import { clean, escapeHtml as esc, htmlResponse, json, overLimit, readJson, timeZoneOrNull, tooMany } from './http.js';
import { page } from './pages.js';
import { bookCall, notify, openTimes, sendEmail } from './services.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// How long each step's token lasts: an outline can be saved for 3 hours, and
// the call booked from the page for 12 hours after saving.
const OUTLINE_TOKEN_AGE = 3 * 60 * 60;
const BOOK_TOKEN_AGE = 12 * 60 * 60;
const RETENTION_DAYS = 365;

// Where the visitor came from, as the page reports it: the ad (?for=) and the
// ad platform (?utm_source=). Only known values are kept, so the counts can't
// fill up with junk.
const PLATFORMS = ['google', 'bing', 'meta', 'facebook', 'instagram', 'linkedin', 'tiktok', 'x', 'reddit', 'youtube', 'nextdoor', 'yelp', 'email', 'qr'];

export function cameFrom(body) {
  const ad = adFor(body?.ad) ? body.ad : 'none';
  const raw = typeof body?.src === 'string' ? body.src.trim().toLowerCase() : '';
  const src = !raw ? 'direct' : PLATFORMS.includes(raw) ? raw : 'other';
  return { ad, src };
}

const KIND_WORDS = {
  leads: 'answering leads',
  data: 'moving data',
  support: 'customer questions',
  app: 'an app',
  website: 'a website',
  general: 'something custom',
};

const fromWords = ({ ad, src }) => `${ad === 'none' ? 'no ad' : `the ${ad} ad`}${src === 'direct' ? '' : ` on ${src}`}`;

export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim();
  if (email.length > 254 || /[\s<>()[\]\\,;:"]/.test(email)) return null;
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (at < 1 || local.length > 64 || !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(domain)) return null;
  return `${local}@${domain}`;
}

export function configRoute(request, env) {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
  const on = features(env);
  return json({ save: on.save, book: on.book, followUp: on.followUp, turnstile: on.turnstile, bookLink: on.cal ? on.cal.link : null });
}

// POST /api/event: one page view, counted by ad. No cookies, IP or anything
// else that could tell one visitor from another.
export async function eventRoute(request, env, ctx, url) {
  const { body, error } = await readJson(request, url, 1000);
  if (error) return error;
  if (await overLimit(env.API_LIMIT, request)) return tooMany();
  ctx.waitUntil(count(env, settings(env).ownerTz, cameFrom(body), 'view').catch(() => {}));
  return json({ ok: true });
}

// POST /api/save: { token, email, followUp, timeZone }. The token is the one
// /api/outline signed, so the outline emailed out is exactly the one this
// site wrote, never text someone posted.
export async function saveRoute(request, env, ctx, url) {
  const { body, error } = await readJson(request, url, 24000);
  if (error) return error;
  if (await overLimit(env.SAVE_LIMIT, request)) return tooMany();
  const on = features(env);
  if (!on.save) return json({ error: 'not_configured' }, 503);
  const email = normalizeEmail(body.email);
  if (!email) return json({ error: 'bad_email' }, 400);
  const data = await verify(env, 'outline', body.token, OUTLINE_TOKEN_AGE);
  if (!data) return json({ error: 'expired' }, 400);

  const cfg = settings(env);
  const outline = data.outline;
  const followUp = on.followUp && body.followUp === true ? 1 : 0;
  const from = cameFrom(data);
  await ensureSchema(env.DB);
  const find = () => env.DB.prepare('SELECT * FROM leads WHERE sig = ?').bind(data.sig).first();

  let lead = await find();
  let send = false;
  let isNew = false;
  if (!lead) {
    lead = {
      id: newId(), sig: data.sig, created_at: new Date().toISOString(), email, tz: timeZoneOrNull(body.timeZone),
      problem: String(data.problem), kind: outline.kind, ad: from.ad, src: from.src, source: data.source === 'ai' ? 'ai' : 'template',
      outline: JSON.stringify(outline), follow_up: followUp, sends: 1,
    };
    try {
      await env.DB.prepare(
        'INSERT INTO leads (id, sig, created_at, email, tz, problem, kind, ad, src, source, outline, follow_up, sends) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(lead.id, lead.sig, lead.created_at, lead.email, lead.tz, lead.problem, lead.kind, lead.ad, lead.src, lead.source, lead.outline, lead.follow_up, lead.sends).run();
      send = isNew = true;
    } catch (err) {
      // A double click: the other request saved it first.
      lead = await find();
      if (!lead) throw err;
    }
  }
  if (!isNew && lead.email !== email) {
    // Fixing a typo in the address: resend to the new one, a few times at most.
    if (lead.sends >= 3) return json({ error: 'too_many_sends' }, 429);
    await env.DB.prepare('UPDATE leads SET email = ?, follow_up = ?, sends = sends + 1 WHERE id = ?').bind(email, followUp, lead.id).run();
    lead = { ...lead, email, follow_up: followUp, sends: lead.sends + 1 };
    send = true;
  }

  let emailed = true;
  if (send) {
    const forgetLink = `${url.origin}/forget?t=${encodeURIComponent(await sign(env, 'lead', { id: lead.id }))}`;
    const message = outlineEmail({ outline, source: lead.source, bookLink: on.cal ? on.cal.link : null, forgetLink, followUp: Boolean(lead.follow_up), postalAddress: cfg.postalAddress });
    emailed = await sendEmail(env, { from: cfg.from, to: [lead.email], reply_to: cfg.replyTo, ...message }, `outline-${lead.id}-${lead.sends}`);
  }
  if (isNew) {
    const copy = leadEmail({ lead, outline, adminLink: `${url.origin}/admin` });
    ctx.waitUntil(Promise.allSettled([
      sendEmail(env, { from: cfg.from, to: [cfg.leadsTo], reply_to: lead.email, ...copy }, `lead-${lead.id}`),
      notify(env, { title: 'New lead', body: `Someone saved an outline about ${KIND_WORDS[lead.kind] || 'a project'}, from ${fromWords(from)}. Details are in your email.`, click: `${url.origin}/admin` }),
      count(env, cfg.ownerTz, from, 'save'),
    ]));
  }

  const reply = { ok: true, emailed };
  if (on.book) reply.lead = await sign(env, 'book', { id: lead.id });
  return json(reply);
}

// GET /api/slots: Thomas's open times for the next three weeks, from Cal.com.
export async function slotsRoute(request, env, ctx, url) {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
  if (await overLimit(env.API_LIMIT, request)) return tooMany();
  const on = features(env);
  if (!on.book) return json({ error: 'not_configured' }, 503);

  const now = Date.now();
  // Asking from the top of the hour lets a minute's worth of visitors share one answer.
  const from = new Date(Math.floor(now / HOUR) * HOUR);
  const to = new Date(from.getTime() + 21 * DAY);
  const cache = globalThis.caches ? globalThis.caches.default : null;
  const key = new Request(`${url.origin}/api/slots/cache/${on.cal.username}/${on.cal.slug}/${from.getTime()}`);
  let times = null;
  const hit = cache ? await cache.match(key) : null;
  if (hit) times = await hit.json();
  if (!Array.isArray(times)) {
    times = await openTimes(env, on.cal, from, to);
    if (!times) return json({ error: 'calendar_unavailable' }, 502);
    if (cache) ctx.waitUntil(cache.put(key, new Response(JSON.stringify(times), { headers: { 'Cache-Control': 'max-age=60' } })).catch(() => {}));
  }
  const soonest = now + 30 * 60 * 1000;
  return json({ times: times.filter(t => Date.parse(t) >= soonest).slice(0, 400) });
}

const ownerTime = (timeZone, iso) => new Intl.DateTimeFormat('en-US', {
  timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
}).format(new Date(iso));

// POST /api/book: { lead, start, name, timeZone }.
export async function bookRoute(request, env, ctx, url) {
  const { body, error } = await readJson(request, url, 4000);
  if (error) return error;
  if (await overLimit(env.SAVE_LIMIT, request)) return tooMany();
  const on = features(env);
  if (!on.book) return json({ error: 'not_configured' }, 503);
  const data = await verify(env, 'book', body.lead, BOOK_TOKEN_AGE);
  if (!data) return json({ error: 'expired' }, 400);
  const name = typeof body.name === 'string' ? clean(body.name).slice(0, 100) : '';
  if (!name) return json({ error: 'bad_name' }, 400);
  const start = Date.parse(body.start);
  if (!Number.isFinite(start) || start < Date.now() || start > Date.now() + 60 * DAY) return json({ error: 'bad_time' }, 400);
  const timeZone = timeZoneOrNull(body.timeZone) || 'UTC';

  await ensureSchema(env.DB);
  const lead = await env.DB.prepare('SELECT id, email, ad, src, kind, outline, booked_at FROM leads WHERE id = ?').bind(data.id).first();
  if (!lead) return json({ error: 'gone' }, 410);
  // Claim the lead first, so two tabs can't book two calls for it.
  const claim = await env.DB.prepare("UPDATE leads SET booked_at = 'pending' WHERE id = ? AND booked_at IS NULL").bind(lead.id).run();
  if (!claim.meta || !claim.meta.changes) return json({ error: 'already_booked' }, 409);

  let booking = null;
  try {
    booking = await bookCall(env, on.cal, {
      start: new Date(start).toISOString(),
      name,
      email: lead.email,
      timeZone,
      notes: `Outline from wright-ai-solutions.com/start: ${JSON.parse(lead.outline).title}`,
      metadata: { source: 'start-page', ad: lead.ad },
    });
  } finally {
    if (!booking || booking.taken) {
      await env.DB.prepare("UPDATE leads SET booked_at = NULL WHERE id = ? AND booked_at = 'pending'").bind(lead.id).run();
    }
  }
  if (!booking) return json({ error: 'booking_failed' }, 502);
  if (booking.taken) return json({ error: 'taken' }, 409);

  const bookedAt = new Date(Number.isFinite(Date.parse(booking.start)) ? Date.parse(booking.start) : start).toISOString();
  await env.DB.prepare('UPDATE leads SET name = ?, booked_at = ?, booking_uid = ? WHERE id = ?').bind(name, bookedAt, booking.uid, lead.id).run();
  const cfg = settings(env);
  ctx.waitUntil(Promise.allSettled([
    notify(env, { title: 'Call booked', body: `${ownerTime(cfg.ownerTz, bookedAt)}, about ${KIND_WORDS[lead.kind] || 'a project'}, from ${fromWords(lead)}. It's on your calendar.`, click: `${url.origin}/admin` }),
    count(env, cfg.ownerTz, lead, 'book'),
  ]));
  return json({ ok: true, start: bookedAt });
}

function forgetPage(title, text, extra = '') {
  return page({ title, body: `<p class="eyebrow">Your details</p>\n<h1>${esc(title)}</h1>\n<p>${text}</p>${extra}` });
}

// /forget?t=<token>: the "delete my details" link in every email. GET only
// asks (so a mail scanner opening the link deletes nothing); POST deletes,
// including a mail app's one-click unsubscribe.
export async function forgetRoute(request, env, url) {
  if (!['GET', 'POST'].includes(request.method)) return htmlResponse('Method not allowed', 405, { Allow: 'GET, POST' });
  if (await overLimit(env.SAVE_LIMIT, request)) {
    return htmlResponse(forgetPage('Too many tries', 'Wait a minute, then try the link again.'), 429, { 'Retry-After': '60' });
  }
  const contact = 'Email <a href="mailto:t@thomasewright.com">t@thomasewright.com</a> and your details will be deleted by hand.';
  if (!env.DB) return htmlResponse(forgetPage('This link doesn\'t work', contact), 404);

  let token = url.searchParams.get('t');
  if (request.method === 'POST') {
    if (Number(request.headers.get('Content-Length') || 0) > 4000) return htmlResponse(forgetPage('This link doesn\'t work', contact), 413);
    const form = await request.formData().catch(() => null);
    const posted = form ? form.get('t') : null;
    if (typeof posted === 'string' && posted) token = posted;
  }
  const data = await verify(env, 'lead', token);
  if (!data) return htmlResponse(forgetPage('This link doesn\'t work', `It may have been cut short. ${contact}`), 400);

  if (request.method === 'POST') {
    await env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(data.id).run();
    return htmlResponse(forgetPage('Your details are deleted', 'Nothing more will be sent to you from this site. If you booked a call, it stays on the calendar until you cancel it with the link in your invite.'));
  }
  const lead = await env.DB.prepare('SELECT id FROM leads WHERE id = ?').bind(data.id).first();
  if (!lead) return htmlResponse(forgetPage('Already deleted', 'There\'s nothing left to delete.'));
  const form = `
<form method="post" action="/forget" class="forget-form">
  <input type="hidden" name="t" value="${esc(token)}">
  <button type="submit" class="btn btn-primary">Delete my details</button>
</form>
<p>Thomas also got one copy by email when you saved your outline. Ask at <a href="mailto:t@thomasewright.com">t@thomasewright.com</a> to have that deleted too.</p>`;
  return htmlResponse(forgetPage('Delete your details?', 'This removes your email address, what you wrote and your outline from Thomas\'s list, and cancels the reminder email if you asked for one. If you booked a call, cancel it with the link in your calendar invite.', form));
}

// Hourly (see wrangler.jsonc): delete old leads and counts, then send any
// next-day reminders that are due.
export async function runSchedule(env, now = Date.now()) {
  if (!env.DB) return;
  await ensureSchema(env.DB);
  const cfg = settings(env);
  const iso = ms => new Date(ms).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM leads WHERE created_at < ?').bind(iso(now - RETENTION_DAYS * DAY)),
    env.DB.prepare('DELETE FROM counts WHERE day < ?').bind(dayIn(cfg.ownerTz, new Date(now - 400 * DAY))),
  ]);

  const on = features(env);
  if (!on.followUp) return;
  const cal = calEvent(env);
  // Saved 12 to 72 hours ago, asked for a reminder, didn't book, not reminded yet.
  // With the mid-morning window below, anything saved before about 10pm goes
  // out the next morning, matching the "tomorrow" on the page.
  const { results } = await env.DB.prepare(
    'SELECT id, email, tz, outline FROM leads WHERE follow_up = 1 AND booked_at IS NULL AND follow_up_sent_at IS NULL AND created_at <= ? AND created_at >= ? ORDER BY created_at LIMIT 50',
  ).bind(iso(now - 12 * HOUR), iso(now - 72 * HOUR)).all();

  for (const lead of results || []) {
    // Mid-morning where they are, not at 3am.
    const hour = hourIn(timeZoneOrNull(lead.tz) || cfg.ownerTz, new Date(now));
    if (hour < 9 || hour >= 11) continue;
    const claim = await env.DB.prepare('UPDATE leads SET follow_up_sent_at = ? WHERE id = ? AND follow_up_sent_at IS NULL').bind(iso(now), lead.id).run();
    if (!claim.meta || !claim.meta.changes) continue;
    const forgetLink = `${cfg.siteUrl}/forget?t=${encodeURIComponent(await sign(env, 'lead', { id: lead.id }))}`;
    const message = followUpEmail({ outline: JSON.parse(lead.outline), bookLink: cal ? cal.link : null, forgetLink, postalAddress: cfg.postalAddress });
    const sent = await sendEmail(env, {
      from: cfg.from,
      to: [lead.email],
      reply_to: cfg.replyTo,
      ...message,
      headers: { 'List-Unsubscribe': `<${forgetLink}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }, `follow-up-${lead.id}`);
    // Not sent: try again next hour, while it's still morning there.
    if (!sent) await env.DB.prepare('UPDATE leads SET follow_up_sent_at = NULL WHERE id = ?').bind(lead.id).run();
  }
}
