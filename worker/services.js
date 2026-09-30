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

// Books the call. Cal.com then emails both people the calendar invite.
// Returns { uid, start }, { taken: true } when the time is no longer free, or
// null for any other failure.
export async function bookCall(env, cal, { start, name, email, timeZone, notes, metadata }) {
  try {
    const response = await withTimeout(fetch(`${CAL_API}/bookings`, {
      method: 'POST',
      headers: calHeaders(env, '2026-02-25'),
      body: JSON.stringify({
        start,
        attendee: { name, email, timeZone, language: 'en' },
        eventTypeSlug: cal.slug,
        username: cal.username,
        bookingFieldsResponses: { notes },
        metadata,
      }),
    }), 15000);
    const result = await response.json().catch(() => null);
    if (response.ok && result?.data) {
      const booking = Array.isArray(result.data) ? result.data[0] : result.data;
      return { uid: String(booking?.uid || ''), start: booking?.start || start };
    }
    const message = JSON.stringify(result?.error || result || '');
    if ([400, 409].includes(response.status) && /not available|already has (a )?booking|no available|unavailable|slot|booking limit/i.test(message)) {
      return { taken: true };
    }
    return null;
  } catch {
    return null;
  }
}
