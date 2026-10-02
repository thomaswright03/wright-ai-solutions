// Everything after the outline: saving it (email to the visitor, a copy to
// Thomas, a row in the leads list), booking the call through Cal.com, the
// "delete my details" link, page-view counting, and the hourly job that sends
// the one next-day reminder and deletes old leads.
import { adFor } from '../outlines.js';
import { calEvent, features, settings } from './config.js';
import { count, dayIn, ensureSchema, formatIn, hasDatabase, hourIn, inboxTag, newId, sign, verify } from './db.js';
import { followUpEmail, leadEmail, outlineEmail } from './emails.js';
import { clean, escapeHtml as esc, htmlResponse, json, overLimit, readJson, timeZoneOrNull, tooMany } from './http.js';
import { page } from './pages.js';
import { bookCall, findBooking, notify, openTimes, sendEmail } from './services.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// How long each step's token lasts: an outline can be saved for 3 hours, and
// the call booked from the page for 12 hours after saving.
const OUTLINE_TOKEN_AGE = 3 * 60 * 60;
const BOOK_TOKEN_AGE = 12 * 60 * 60;
const RETENTION_DAYS = 365;
// Each saved outline can be emailed this many times: once, then to corrected
// addresses. And one inbox gets at most this many outline emails a day, so the
// form can't be used to flood someone else's inbox.
const MAX_SENDS = 3;
const INBOX_DAILY_LIMIT = 3;
// Reminder emails sent per hourly run, at most.
const REMINDERS_PER_RUN = 50;

// Where the visitor came from, as the page reports it: the ad (?for=) and the
// ad platform (?utm_source=). Only known values are kept, so the counts can't
// fill up with junk. It's also run again on what an outline's token carries,
// which is already cleaned, so its own answers ('direct', 'other') pass through
// unchanged.
const PLATFORMS = ['google', 'bing', 'meta', 'facebook', 'instagram', 'linkedin', 'tiktok', 'x', 'reddit', 'youtube', 'nextdoor', 'yelp', 'email', 'qr'];

/** @param {Record<string, unknown> | null | undefined} body @returns {CameFrom} */
export function cameFrom(body) {
  const ad = typeof body?.ad === 'string' && adFor(body.ad) ? body.ad : 'none';
  const raw = typeof body?.src === 'string' ? body.src.trim().toLowerCase() : '';
  const src = !raw || raw === 'direct' ? 'direct' : PLATFORMS.includes(raw) || raw === 'other' ? raw : 'other';
  return { ad, src };
}

/** @type {Record<string, string>} */
const KIND_WORDS = {
  leads: 'answering leads',
  data: 'moving data',
  support: 'customer questions',
  app: 'an app',
  website: 'a website',
  general: 'something custom',
};

/** @param {CameFrom} from */
const fromWords = ({ ad, src }) => `${ad === 'none' ? 'no ad' : `the ${ad} ad`}${src === 'direct' ? '' : ` on ${src}`}`;

/** @param {unknown} value @returns {string | null} */
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

// The mailbox an address reaches, for the daily cap: changing the case, adding
// a +tag or (for Gmail) moving the dots still reaches the same person.
/** @param {string} email */
export function inboxKey(email) {
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at).toLowerCase().replace(/\+.*$/, '');
  const domain = email.slice(at + 1).toLowerCase();
  return domain === 'gmail.com' || domain === 'googlemail.com' ? `${local.replace(/\./g, '')}@gmail.com` : `${local}@${domain}`;
}

// Uses up one of the inbox's outline emails for today, if it has one left.
// Counted per email sent, so moving a saved outline to another address
// doesn't give the first one its turn back.
/** @param {EnvWithDB} env @param {string} email */
async function takeInboxSend(env, email) {
  const tag = await inboxTag(env, inboxKey(email));
  const now = Date.now();
  const taken = await env.DB.prepare(
    'INSERT INTO outline_sends (tag, sent_at) SELECT ?, ? WHERE (SELECT COUNT(*) FROM outline_sends WHERE tag = ? AND sent_at > ?) < ?',
  ).bind(tag, new Date(now).toISOString(), tag, new Date(now - DAY).toISOString(), INBOX_DAILY_LIMIT).run();
  return Boolean(taken.meta && taken.meta.changes);
}

// The delete link for a lead. It's the same link every time (it's signed as of
// when the lead was saved), so a retried email is identical to the first try.
/** @param {EnvWithDB} env @param {string} origin @param {{ id: string, created_at: string }} lead */
const forgetLinkFor = async (env, origin, lead) =>
  `${origin}/forget?t=${encodeURIComponent(await sign(env, 'lead', { id: lead.id }, Math.floor(Date.parse(lead.created_at) / 1000)))}`;

/** @param {Request} request @param {Env} env */
export function configRoute(request, env) {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
  const on = features(env);
  return json({ save: on.save, book: on.book, followUp: on.followUp, turnstile: on.turnstile, bookLink: on.cal ? on.cal.link : null });
}

// POST /api/event: one page view, counted by ad. No cookies, IP or anything
// else that could tell one visitor from another.
/** @param {Request} request @param {Env} env @param {WaitUntil} ctx @param {URL} url */
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
/** @param {Request} request @param {Env} env @param {WaitUntil} ctx @param {URL} url */
export async function saveRoute(request, env, ctx, url) {
  const { body, error } = await readJson(request, url, 24000);
  if (error) return error;
  if (await overLimit(env.SAVE_LIMIT, request)) return tooMany();
  const on = features(env);
  if (!on.save || !hasDatabase(env)) return json({ error: 'not_configured' }, 503);
  const email = normalizeEmail(body.email);
  if (!email) return json({ error: 'bad_email' }, 400);
  const data = await verify(env, 'outline', body.token, OUTLINE_TOKEN_AGE);
  if (!data || typeof data.n !== 'string') return json({ error: 'expired' }, 400);

  const cfg = settings(env);
  // Signed by /api/outline, so it's an outline this site wrote.
  const outline = /** @type {Outline} */ (data.outline);
  const followUp = on.followUp && body.followUp === true ? 1 : 0;
  const from = cameFrom(data);
  await ensureSchema(env.DB);
  /** @returns {Promise<LeadRow | null>} */
  const find = () => env.DB.prepare('SELECT * FROM leads WHERE outline_id = ?').bind(data.n).first();

  /** @type {SavedLead | null} */
  let lead = await find();
  let isNew = false;
  if (!lead) {
    if (!(await takeInboxSend(env, email))) return json({ error: 'inbox_limit' }, 429);
    lead = {
      id: newId(), outline_id: data.n, created_at: new Date().toISOString(), email, tz: timeZoneOrNull(body.timeZone),
      problem: String(data.problem), kind: outline.kind, ad: from.ad, src: from.src, source: data.source === 'ai' ? 'ai' : 'template',
      outline: JSON.stringify(outline), follow_up: followUp, sends: 1, emailed_at: null,
    };
    const added = await env.DB.prepare(
      'INSERT INTO leads (id, outline_id, created_at, email, tz, problem, kind, ad, src, source, outline, follow_up, sends) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (outline_id) DO NOTHING',
    ).bind(lead.id, lead.outline_id, lead.created_at, lead.email, lead.tz, lead.problem, lead.kind, lead.ad, lead.src, lead.source, lead.outline, lead.follow_up, lead.sends).run();
    if (added.meta && added.meta.changes) {
      isNew = true;
    } else {
      // A double click: the other request saved it first.
      lead = await find();
      if (!lead) throw new Error('lead not saved');
    }
  }

  let send = isNew;
  /** @type {string | null} */
  let correctedFrom = null;
  if (!isNew && lead.email !== email) {
    // Fixing a typo in the address: sent again to the new one, a few times at most.
    if (lead.sends >= MAX_SENDS) return json({ error: 'too_many_sends' }, 429);
    if (!(await takeInboxSend(env, email))) return json({ error: 'inbox_limit' }, 429);
    const fixed = await env.DB.prepare(
      'UPDATE leads SET email = ?, follow_up = ?, sends = sends + 1, emailed_at = NULL WHERE id = ? AND sends < ? RETURNING sends',
    ).bind(email, followUp, lead.id, MAX_SENDS).first();
    if (!fixed) return json({ error: 'too_many_sends' }, 429);
    correctedFrom = lead.email;
    lead = { ...lead, email, follow_up: followUp, sends: Number(fixed.sends), emailed_at: null };
    send = true;
  } else if (!isNew && !lead.emailed_at) {
    // The last try didn't go through: the same email again. Resend drops it if
    // the last one actually went out after all.
    send = true;
  }

  let emailed = true;
  if (send) {
    const forgetLink = await forgetLinkFor(env, url.origin, lead);
    const message = outlineEmail({ outline, source: lead.source, bookLink: on.cal ? on.cal.link : null, forgetLink, followUp: Boolean(lead.follow_up), postalAddress: cfg.postalAddress });
    emailed = await sendEmail(env, { from: cfg.from, to: [lead.email], reply_to: cfg.replyTo, ...message }, `outline-${lead.id}-${lead.sends}`);
    if (emailed) await env.DB.prepare('UPDATE leads SET emailed_at = ? WHERE id = ? AND email = ?').bind(new Date().toISOString(), lead.id, lead.email).run();
  }
  if (isNew || correctedFrom) {
    // Thomas's copy, with Reply-To set to the visitor, again after a corrected address.
    const copy = leadEmail({ lead, outline, adminLink: `${url.origin}/admin`, correctedFrom });
    /** @type {Promise<unknown>[]} */
    const tasks = [sendEmail(env, { from: cfg.from, to: [cfg.leadsTo], reply_to: lead.email, ...copy }, `lead-${lead.id}-${lead.sends}`)];
    if (isNew) {
      tasks.push(
        notify(env, { title: 'New lead', body: `Someone saved an outline about ${KIND_WORDS[lead.kind] || 'a project'}, from ${fromWords(from)}. Details are in your email.`, click: `${url.origin}/admin` }),
        count(env, cfg.ownerTz, from, 'save'),
      );
    }
    ctx.waitUntil(Promise.allSettled(tasks));
  }

  /** @type {{ ok: boolean, emailed: boolean, lead?: string }} */
  const reply = { ok: true, emailed };
  if (on.book) reply.lead = await sign(env, 'book', { id: lead.id });
  return json(reply);
}

// GET /api/slots: Thomas's open times for the next three weeks, from Cal.com.
/** @param {Request} request @param {Env} env @param {WaitUntil} ctx @param {URL} url */
export async function slotsRoute(request, env, ctx, url) {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
  if (await overLimit(env.API_LIMIT, request)) return tooMany();
  const on = features(env);
  if (!on.book || !on.cal) return json({ error: 'not_configured' }, 503);

  const now = Date.now();
  // Asking from the top of the hour lets a minute's worth of visitors share one answer.
  const from = new Date(Math.floor(now / HOUR) * HOUR);
  const to = new Date(from.getTime() + 21 * DAY);
  // No Cache API on the local test server.
  const storage = /** @type {{ caches?: CacheStorage }} */ (globalThis).caches;
  const cache = storage ? storage.default : null;
  const key = new Request(`${url.origin}/api/slots/cache/${on.cal.username}/${on.cal.slug}/${from.getTime()}`);
  /** @type {string[] | null} */
  let times = null;
  const hit = cache ? await cache.match(key) : null;
  // What this route cached a moment ago (checked to be a list below).
  if (hit) times = await hit.json();
  if (!Array.isArray(times)) {
    times = await openTimes(env, on.cal, from, to);
    if (!times) return json({ error: 'calendar_unavailable' }, 502);
    if (cache) ctx.waitUntil(cache.put(key, new Response(JSON.stringify(times), { headers: { 'Cache-Control': 'max-age=60' } })).catch(() => {}));
  }
  const soonest = now + 30 * 60 * 1000;
  return json({ times: times.filter(t => Date.parse(t) >= soonest).slice(0, 400) });
}

/** @param {string} timeZone @param {string} iso */
const ownerTime = (timeZone, iso) => formatIn(timeZone, {
  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
}).format(new Date(iso));

// POST /api/book: { lead, start, name, timeZone }.
/** @param {Request} request @param {Env} env @param {WaitUntil} ctx @param {URL} url */
export async function bookRoute(request, env, ctx, url) {
  const { body, error } = await readJson(request, url, 4000);
  if (error) return error;
  if (await overLimit(env.SAVE_LIMIT, request)) return tooMany();
  const on = features(env);
  if (!on.book || !on.cal || !hasDatabase(env)) return json({ error: 'not_configured' }, 503);
  const data = await verify(env, 'book', body.lead, BOOK_TOKEN_AGE);
  if (!data) return json({ error: 'expired' }, 400);
  const name = typeof body.name === 'string' ? clean(body.name).slice(0, 100) : '';
  if (!name) return json({ error: 'bad_name' }, 400);
  const start = Date.parse(String(body.start));
  if (!Number.isFinite(start) || start < Date.now() || start > Date.now() + 60 * DAY) return json({ error: 'bad_time' }, 400);
  const timeZone = timeZoneOrNull(body.timeZone) || 'UTC';

  await ensureSchema(env.DB);
  /** @type {Pick<LeadRow, 'id' | 'email' | 'ad' | 'src' | 'kind' | 'outline' | 'booked_at'> | null} */
  const lead = await env.DB.prepare('SELECT id, email, ad, src, kind, outline, booked_at FROM leads WHERE id = ?').bind(data.id).first();
  if (!lead) return json({ error: 'gone' }, 410);
  // Claim the lead first, so two tabs can't book two calls for it. A lead
  // still 'pending' is one whose booking Cal.com never clearly answered;
  // booking_start and the name keep what was asked for, for Thomas to check
  // against the calendar on /admin.
  const startIso = new Date(start).toISOString();
  const claim = await env.DB.prepare("UPDATE leads SET booked_at = 'pending', booking_start = ?, name = ? WHERE id = ? AND booked_at IS NULL").bind(startIso, name, lead.id).run();
  if (!claim.meta || !claim.meta.changes) return json({ error: lead.booked_at === 'pending' ? 'unconfirmed' : 'already_booked' }, 409);

  /** @type {BookingResult | null} */
  let booking = null;
  try {
    booking = await bookCall(env, on.cal, {
      start: startIso,
      name,
      email: lead.email,
      timeZone,
      notes: `Outline from wright-ai-solutions.com/start: ${JSON.parse(lead.outline).title}`,
      metadata: { source: 'start-page', ad: lead.ad },
    });
    // No clear answer: Cal.com may have booked it anyway. Ask, when there's a
    // key to ask with; a confirmed "no booking" is safe to try again.
    if (booking && booking.uncertain) {
      const found = await findBooking(env, { email: lead.email, start: startIso });
      if (found !== undefined) booking = found;
    }
  } finally {
    // Free the lead only when it's certain nothing was booked. While it's
    // uncertain the lead stays 'pending', so a retry can't make a second call.
    if (!booking || booking.taken) {
      await env.DB.prepare("UPDATE leads SET booked_at = NULL, booking_start = NULL WHERE id = ? AND booked_at = 'pending'").bind(lead.id).run();
    }
  }
  if (!booking) return json({ error: 'booking_failed' }, 502);
  if (booking.taken) return json({ error: 'taken' }, 409);
  const cfg = settings(env);
  if (booking.uncertain) {
    ctx.waitUntil(notify(env, {
      title: 'Booking unconfirmed',
      body: `Cal.com didn't confirm a call for ${ownerTime(cfg.ownerTz, startIso)}. Check your calendar, then mark it booked or not on your leads list.`,
      click: `${url.origin}/admin`,
    }).catch(() => {}));
    return json({ error: 'unconfirmed' }, 502);
  }

  const bookedAt = new Date(Number.isFinite(Date.parse(booking.start)) ? Date.parse(booking.start) : start).toISOString();
  await env.DB.prepare('UPDATE leads SET name = ?, booked_at = ?, booking_uid = ? WHERE id = ?').bind(name, bookedAt, booking.uid, lead.id).run();
  ctx.waitUntil(Promise.allSettled([
    notify(env, { title: 'Call booked', body: `${ownerTime(cfg.ownerTz, bookedAt)}, about ${KIND_WORDS[lead.kind] || 'a project'}, from ${fromWords(lead)}. It's on your calendar.`, click: `${url.origin}/admin` }),
    count(env, cfg.ownerTz, lead, 'book'),
  ]));
  return json({ ok: true, start: bookedAt });
}

/** @param {string} title @param {string} text @param {string} [extra] */
function forgetPage(title, text, extra = '') {
  return page({ title, body: `<p class="eyebrow">Your details</p>\n<h1>${esc(title)}</h1>\n<p>${text}</p>${extra}` });
}

// /forget?t=<token>: the "delete my details" link in every email. GET only
// asks (so a mail scanner opening the link deletes nothing); POST deletes,
// including a mail app's one-click unsubscribe.
/** @param {Request} request @param {Env} env @param {URL} url */
export async function forgetRoute(request, env, url) {
  if (!['GET', 'POST'].includes(request.method)) return htmlResponse('Method not allowed', 405, { Allow: 'GET, POST' });
  if (await overLimit(env.SAVE_LIMIT, request)) {
    return htmlResponse(forgetPage('Too many tries', 'Wait a minute, then try the link again.'), 429, { 'Retry-After': '60' });
  }
  const contact = 'Email <a href="mailto:t@thomasewright.com">t@thomasewright.com</a> and your details will be deleted by hand.';
  if (!hasDatabase(env)) return htmlResponse(forgetPage('This link doesn\'t work', contact), 404);

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
/** @param {Env} env @param {number} [now] */
export async function runSchedule(env, now = Date.now()) {
  if (!hasDatabase(env)) return;
  await ensureSchema(env.DB);
  const cfg = settings(env);
  /** @param {number} ms */
  const iso = ms => new Date(ms).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM leads WHERE created_at < ?').bind(iso(now - RETENTION_DAYS * DAY)),
    env.DB.prepare('DELETE FROM counts WHERE day < ?').bind(dayIn(cfg.ownerTz, new Date(now - 400 * DAY))),
    env.DB.prepare('DELETE FROM outline_outcomes WHERE day < ?').bind(dayIn(cfg.ownerTz, new Date(now - 400 * DAY))),
    env.DB.prepare('DELETE FROM ai_daily WHERE day < ?').bind(iso(now - 2 * DAY).slice(0, 10)),
    env.DB.prepare('DELETE FROM outline_sends WHERE sent_at < ?').bind(iso(now - 2 * DAY)),
  ]);

  const on = features(env);
  if (!on.followUp) return;
  const cal = calEvent(env);
  // Saved 12 to 72 hours ago, asked for a reminder, didn't book, not reminded yet.
  // With the mid-morning window below, anything saved before about 10pm goes
  // out the next morning, matching the "tomorrow" on the page. All of them are
  // checked, so people it isn't morning for yet can't hold up those it is.
  /** @type {D1Result<Pick<LeadRow, 'id' | 'email' | 'tz' | 'outline' | 'created_at'>>} */
  const { results } = await env.DB.prepare(
    'SELECT id, email, tz, outline, created_at FROM leads WHERE follow_up = 1 AND booked_at IS NULL AND follow_up_sent_at IS NULL AND created_at <= ? AND created_at >= ? ORDER BY created_at',
  ).bind(iso(now - 12 * HOUR), iso(now - 72 * HOUR)).all();

  let sent = 0;
  for (const lead of results || []) {
    if (sent >= REMINDERS_PER_RUN) break;
    // Mid-morning where they are, not at 3am.
    const hour = hourIn(timeZoneOrNull(lead.tz) || cfg.ownerTz, new Date(now));
    if (hour < 9 || hour >= 11) continue;
    // Claimed first, and only if they still haven't booked.
    const claim = await env.DB.prepare('UPDATE leads SET follow_up_sent_at = ? WHERE id = ? AND follow_up_sent_at IS NULL AND booked_at IS NULL').bind(iso(now), lead.id).run();
    if (!claim.meta || !claim.meta.changes) continue;
    sent += 1;
    const forgetLink = await forgetLinkFor(env, cfg.siteUrl, lead);
    const message = followUpEmail({ outline: JSON.parse(lead.outline), bookLink: cal ? cal.link : null, forgetLink, postalAddress: cfg.postalAddress });
    const delivered = await sendEmail(env, {
      from: cfg.from,
      to: [lead.email],
      reply_to: cfg.replyTo,
      ...message,
      headers: { 'List-Unsubscribe': `<${forgetLink}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }, `follow-up-${lead.id}`);
    // Not sent: try again next hour, while it's still morning there.
    if (!delivered) await env.DB.prepare('UPDATE leads SET follow_up_sent_at = NULL WHERE id = ?').bind(lead.id).run();
  }
}
