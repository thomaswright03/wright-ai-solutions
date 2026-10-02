// The outside services /start uses, each behind one small function that never
// throws: Resend (email), Cal.com (open times and bookings), ntfy (phone
// alerts) and Cloudflare Turnstile (the bot check). A failure returns false or
// null and the caller decides what the visitor sees.
import { withTimeout } from './http.js';

export async function sendEmail(env, message, idempotencyKey) {
  if (!env.RESEND_API_KEY) return false;
  try {
    const response = await withTimeout(fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        // Resend drops a repeat with the same key, so a retry can't send twice.
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify(message),
    }), 10000);
    return response.ok;
  } catch {
    return false;
  }
}

// An instant push to Thomas's phone through the ntfy app. The topic name is
// the only key, so it's a secret; alerts never name the visitor.
export async function notify(env, { title, body, click }) {
  if (!env.NTFY_TOPIC) return false;
  try {
    const response = await withTimeout(fetch(`https://ntfy.sh/${encodeURIComponent(env.NTFY_TOPIC)}`, {
      method: 'POST',
      headers: { Title: title, Tags: 'bell', ...(click ? { Click: click } : {}) },
      body,
    }), 5000);
    return response.ok;
  } catch {
    return false;
  }
}

// True only when Cloudflare confirms the visitor passed the bot check.
export async function passedBotCheck(env, token, ip) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  try {
    const response = await withTimeout(fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, ...(ip && ip !== 'unknown' ? { remoteip: ip } : {}) }),
    }), 5000);
    const result = await response.json();
    return result && result.success === true;
  } catch {
    return false;
  }
}

const CAL_API = 'https://api.cal.com/v2';

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
export async function openTimes(env, cal, from, to) {
  const query = new URLSearchParams({
    username: cal.username,
    eventTypeSlug: cal.slug,
    start: from.toISOString(),
    end: to.toISOString(),
  });
  try {
    const response = await withTimeout(fetch(`${CAL_API}/slots?${query}`, { headers: calHeaders(env, '2024-09-04') }), 8000);
    if (!response.ok) return null;
    const days = (await response.json())?.data;
    if (!days || typeof days !== 'object') return null;
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
const CAL_LANGUAGES = { es: 'es', fr: 'fr', pt: 'pt-BR', zh: 'zh-CN', vi: 'vi', ar: 'ar', ko: 'ko', ru: 'ru' };

// Books the call. Cal.com then emails both people the calendar invite.
// Returns { uid, start }; { taken: true } when the time is no longer free;
// { uncertain: true } when there's no clear answer (a timeout, a dropped
// connection, a server error mid-request or an unreadable reply), since the
// call may have been booked anyway; or null when Cal.com clearly turned it
// down, including a 503, which means it took nothing in.
export async function bookCall(env, cal, { start, name, email, timeZone, notes, metadata, lang = 'en' }) {
  let response;
  try {
    response = await withTimeout(fetch(`${CAL_API}/bookings`, {
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
    }), 15000);
  } catch {
    return { uncertain: true };
  }
  if (response.status >= 500 && response.status !== 503) return { uncertain: true };
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
export async function findBooking(env, { email, start }) {
  if (!env.CAL_API_KEY) return undefined;
  const query = new URLSearchParams({ attendeeEmail: email, status: 'upcoming,unconfirmed', take: '100' });
  try {
    const response = await withTimeout(fetch(`${CAL_API}/bookings?${query}`, { headers: calHeaders(env, '2024-08-13') }), 8000);
    if (!response.ok) return undefined;
    const list = (await response.json())?.data;
    if (!Array.isArray(list)) return undefined;
    const wanted = Date.parse(start);
    const match = list.find(b => Date.parse(b?.start) === wanted && !/cancel|reject/i.test(String(b?.status || ''))
      && (b.attendees || []).some(a => String(a?.email || '').toLowerCase() === email.toLowerCase()));
    return match ? { uid: String(match.uid || ''), start: match.start } : null;
  } catch {
    return undefined;
  }
}
