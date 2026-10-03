// The outside services /start uses, each behind one small function that never
// throws: Resend (email), Cal.com (open times and bookings), ntfy (phone
// alerts) and Cloudflare Turnstile (the bot check). A failure returns false or
// null and the caller decides what the visitor sees. Calls to Resend and
// Cal.com are tried up to three times after a quick failure that is safe to
// repeat (withRetries in http.js).
import { settings } from './config.js';
import { escapeHtml, retryAnyFailure, withRetries, withTimeout } from './http.js';

/** @param {Env} env @param {EmailMessage} message @param {string} [idempotencyKey] @returns {Promise<boolean>} */
export async function sendEmail(env, message, idempotencyKey) {
  if (!env.RESEND_API_KEY) return false;
  try {
    const response = await withRetries(() => withTimeout(fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        // Resend drops a repeat with the same key, so a retry can't send twice.
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify(message),
    }), 10000), idempotencyKey ? retryAnyFailure : status => status === 429);
    return response.ok;
  } catch {
    return false;
  }
}

// ntfy's answer to a request, with the access token when there is one. ntfy.sh
// limits requests per sending address, and a Worker shares its address with
// other Cloudflare customers, so a token (NTFY_TOKEN, from a free ntfy
// account) counts them against Thomas's own account instead.
/** @param {Env} env @param {string} path @param {RequestInit} [init] */
export function ntfyFetch(env, path, init = {}) {
  const headers = new Headers(init.headers);
  if (env.NTFY_TOKEN) headers.set('Authorization', `Bearer ${env.NTFY_TOKEN}`);
  return withTimeout(fetch(`https://ntfy.sh${path}`, { ...init, headers }), 5000);
}

// An instant push to Thomas's phone through the ntfy app. The topic name is
// the only key, so it's a secret; alerts never name the visitor. ntfy.sh often
// doesn't answer a Worker directly, so when it doesn't take the alert, the
// alert goes by email instead, through Resend: to ntfy's email address for the
// topic (ntfy turns it into the same phone push) and to Thomas's inbox, so a
// broken alert channel can't hide the alert. Why ntfy failed is logged and
// kept for /admin. Answers how it went: 'phone', 'email', or false when
// neither worked (or alerts aren't switched on).
/** @param {Env} env @param {{ title: string, body: string, click?: string }} alert @returns {Promise<'phone' | 'email' | false>} */
export async function notify(env, { title, body, click }) {
  if (!env.NTFY_TOPIC) return false;
  let reason;
  try {
    const response = await ntfyFetch(env, `/${encodeURIComponent(env.NTFY_TOPIC)}`, {
      method: 'POST',
      headers: { Title: title, Tags: 'bell', ...(click ? { Click: click } : {}) },
      body,
    });
    if (response.ok) {
      await noteAlert(env, { how: 'phone' });
      return 'phone';
    }
    reason = `ntfy answered ${response.status}`;
  } catch (err) {
    const message = String(err && /** @type {Error} */ (err).message);
    reason = message === 'timeout' ? 'ntfy didn\'t answer within 5 seconds' : `couldn't reach ntfy (${message.slice(0, 120)})`;
  }
  console.warn(JSON.stringify({ level: 'warn', event: 'alert_ntfy_failed', reason }));
  const cfg = settings(env);
  const link = click ? `\n\n${click}` : '';
  const pushed = await sendEmail(env, {
    from: cfg.from,
    to: [`ntfy-${env.NTFY_TOPIC}${env.NTFY_TOKEN ? `+${env.NTFY_TOKEN}` : ''}@ntfy.sh`],
    reply_to: cfg.replyTo,
    subject: title,
    text: `${body}${link}`,
    html: `<p>${escapeHtml(body)}</p>`,
  });
  const note = `Sent by email because ntfy didn't take the phone alert directly (${reason})${pushed ? '; it was also sent to ntfy by email, which should reach your phone' : ''}.`;
  const mailed = await sendEmail(env, {
    from: cfg.from,
    to: [cfg.leadsTo],
    reply_to: cfg.replyTo,
    subject: `Alert: ${title}`,
    text: `${body}\n\n${click ? `${click}\n\n` : ''}${note}`,
    html: `<p>${escapeHtml(body)}</p>${click ? `<p><a href="${escapeHtml(click)}">${escapeHtml(click)}</a></p>` : ''}<p>${escapeHtml(note)}</p>`,
  });
  if (!pushed && !mailed) return false;
  await noteAlert(env, { how: 'email', reason });
  return 'email';
}

// The last alert that went out, for the daily check (health.js lastAlert):
// when, how, and why ntfy didn't take it directly.
/** @param {Env} env @param {{ how: 'phone' | 'email', reason?: string }} alert */
async function noteAlert(env, alert) {
  if (!env.DB) return;
  const value = JSON.stringify({ at: new Date().toISOString(), ...alert });
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').bind('last_alert', value).run().catch(() => {});
}

// True only when Cloudflare confirms the visitor passed the bot check on this
// site: a token solved on another site that uses the same key is refused.
/** @param {Env} env @param {unknown} token @param {string} ip @param {string} hostname @returns {Promise<boolean | null>} */
export async function passedBotCheck(env, token, ip, hostname) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  try {
    const response = await withTimeout(fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: String(env.TURNSTILE_SECRET), response: token, ...(ip && ip !== 'unknown' ? { remoteip: ip } : {}) }),
    }), 5000);
    const result = /** @type {{ success?: unknown, hostname?: unknown } | null} */ (await response.json());
    return Boolean(result && result.success === true && result.hostname === hostname);
  } catch {
    return false;
  }
}

const CAL_API = 'https://api.cal.com/v2';

/** @param {Env} env @param {string} version */
function calHeaders(env, version) {
  return {
    'cal-api-version': version,
    'Content-Type': 'application/json',
    // Optional: public events don't need a key, but one gets a higher rate limit.
    ...(env.CAL_API_KEY ? { Authorization: `Bearer ${env.CAL_API_KEY}` } : {}),
  };
}

// Thomas's open start times between two dates, as sorted ISO strings (UTC),
// or null if Cal.com couldn't be reached.
/** @param {Env} env @param {CalEvent} cal @param {Date} from @param {Date} to @returns {Promise<string[] | null>} */
export async function openTimes(env, cal, from, to) {
  const query = new URLSearchParams({
    username: cal.username,
    eventTypeSlug: cal.slug,
    start: from.toISOString(),
    end: to.toISOString(),
  });
  try {
    const response = await withRetries(() => withTimeout(fetch(`${CAL_API}/slots?${query}`, { headers: calHeaders(env, '2024-09-04') }), 8000), retryAnyFailure);
    if (!response.ok) return null;
    const days = /** @type {{ data?: unknown } | null} */ (await response.json())?.data;
    if (!days || typeof days !== 'object') return null;
    /** @type {Set<string>} */
    const times = new Set();
    for (const list of Object.values(days)) {
      if (!Array.isArray(list)) continue;
      for (const slot of list) {
        const start = Date.parse(typeof slot === 'string' ? slot : slot?.start);
        if (Number.isFinite(start)) times.add(new Date(start).toISOString());
      }
    }
    return [...times].sort();
  } catch {
    return null;
  }
}

// Cal.com's invite and emails come in the attendee's language where it has one.
/** @type {Record<string, string>} */
const CAL_LANGUAGES = { es: 'es', fr: 'fr', pt: 'pt-BR', zh: 'zh-CN', vi: 'vi', ar: 'ar', ko: 'ko', ru: 'ru' };

// Books the call. Cal.com then emails both people the calendar invite.
// Returns { uid, start }; { taken: true } when the time is no longer free;
// { uncertain: true } when there's no clear answer (a timeout, a dropped
// connection, a server error mid-request or an unreadable reply), since the
// call may have been booked anyway; or null when Cal.com clearly turned it
// down, including a 503, which means it took nothing in. Only a 429 or a 503
// is tried again, since only those say nothing was booked.
/**
 * @param {Env} env @param {CalEvent} cal
 * @param {{ start: string, name: string, email: string, timeZone: string, notes: string, metadata: Record<string, string>, lang?: string }} booking
 * @returns {Promise<BookingResult | null>}
 */
export async function bookCall(env, cal, { start, name, email, timeZone, notes, metadata, lang = 'en' }) {
  let response;
  try {
    response = await withRetries(() => withTimeout(fetch(`${CAL_API}/bookings`, {
      method: 'POST',
      headers: calHeaders(env, '2026-02-25'),
      body: JSON.stringify({
        start,
        attendee: { name, email, timeZone, language: CAL_LANGUAGES[lang] || 'en' },
        eventTypeSlug: cal.slug,
        username: cal.username,
        bookingFieldsResponses: { notes },
        metadata,
      }),
    }), 15000), status => status === 429 || status === 503);
  } catch {
    return { uncertain: true };
  }
  if (response.status >= 500 && response.status !== 503) return { uncertain: true };
  // Cal.com's reply, whatever shape it came in.
  /** @type {any} */
  const result = await response.json().catch(() => null);
  if (response.ok) {
    const booking = result && result.data && (Array.isArray(result.data) ? result.data[0] : result.data);
    return booking ? { uid: String(booking.uid || ''), start: booking.start || start } : { uncertain: true };
  }
  const message = JSON.stringify(result?.error || result || '');
  if ([400, 409].includes(response.status) && /not available|already has (a )?booking|no available|unavailable|slot|booking limit/i.test(message)) {
    return { taken: true };
  }
  return null;
}

// After an unclear reply: the call Cal.com booked for this person at this
// time, if it did. Listing bookings needs the optional CAL_API_KEY. Returns
// { uid, start } when found, null when Cal.com confirms there's none, and
// undefined when it can't tell (no key, or no clear answer).
/** @param {Env} env @param {{ email: string, start: string }} booking @returns {Promise<{ uid: string, start: string } | null | undefined>} */
export async function findBooking(env, { email, start }) {
  if (!env.CAL_API_KEY) return undefined;
  const query = new URLSearchParams({ attendeeEmail: email, status: 'upcoming,unconfirmed', take: '100' });
  try {
    const response = await withRetries(() => withTimeout(fetch(`${CAL_API}/bookings?${query}`, { headers: calHeaders(env, '2024-08-13') }), 8000), retryAnyFailure);
    if (!response.ok) return undefined;
    const list = /** @type {{ data?: unknown } | null} */ (await response.json())?.data;
    if (!Array.isArray(list)) return undefined;
    const wanted = Date.parse(start);
    const match = list.find(b => Date.parse(b?.start) === wanted && !/cancel|reject/i.test(String(b?.status || ''))
      && (b.attendees || []).some(/** @param {{ email?: unknown } | null} a */ a => String(a?.email || '').toLowerCase() === email.toLowerCase()));
    return match ? { uid: String(match.uid || ''), start: match.start } : null;
  } catch {
    return undefined;
  }
}
