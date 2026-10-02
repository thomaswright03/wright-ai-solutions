// Small helpers every route shares: responses that carry the security headers,
// the same-site JSON check, rate limiting and text cleaning. Nothing here
// touches storage or another service.

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

const JSON_HEADERS = {
  ...SECURITY_HEADERS,
  'Content-Type': 'application/json; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

// Pages the Worker writes itself (/forget, /admin) use the site's own CSS and
// fonts, and never send their address (which can hold a private link) onward.
const HTML_HEADERS = {
  ...SECURITY_HEADERS,
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};

/** @param {unknown} body @param {number} [status] @param {Record<string, string>} [extra] */
export const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });

/** @param {string} body @param {number} [status] @param {Record<string, string>} [extra] */
export const htmlResponse = (body, status = 200, extra = {}) =>
  new Response(body, { status, headers: { ...HTML_HEADERS, ...extra } });

// Plain text only: no control characters, single spaces.
/** @param {unknown} value */
// eslint-disable-next-line no-control-regex -- removing control characters is the point
export const clean = value => String(value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();

/** @param {unknown} value */
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c =>
  /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// A POST from this site's own pages with a JSON object body of at most `max`
// bytes. Returns { body } or { error: <Response to send instead> }.
/**
 * @param {Request} request @param {URL} url @param {number} max
 * @returns {Promise<{ body: Record<string, unknown>, error?: undefined } | { body?: undefined, error: Response }>}
 */
export async function readJson(request, url, max) {
  if (request.method !== 'POST') return { error: json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' }) };
  if (request.headers.get('Origin') !== url.origin) return { error: json({ error: 'forbidden' }, 403) };
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) {
    return { error: json({ error: 'unsupported_media_type' }, 415) };
  }
  if (Number(request.headers.get('Content-Length') || 0) > max) return { error: json({ error: 'too_large' }, 413) };
  const raw = await request.text();
  if (raw.length > max) return { error: json({ error: 'too_large' }, 413) };
  try {
    const body = JSON.parse(raw);
    if (body && typeof body === 'object' && !Array.isArray(body)) return { body };
  } catch {
    // Falls through to the 400 below.
  }
  return { error: json({ error: 'bad_request' }, 400) };
}

/** @param {Request} request */
export const clientIp = request => request.headers.get('CF-Connecting-IP') || 'unknown';

// Cloudflare's rate limiting binding, per visitor (IP) per Cloudflare location.
// No binding (the local test server) means no limit.
/** @param {RateLimit | undefined} limiter @param {Request} request */
export async function overLimit(limiter, request) {
  if (!limiter) return false;
  const { success } = await limiter.limit({ key: clientIp(request) });
  return !success;
}

export const tooMany = () => json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });

/** @template T @param {Promise<T>} promise @param {number} ms @returns {Promise<T>} */
export function withTimeout(promise, ms) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  /** @type {Promise<never>} */
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Waits before each retry; each wait is longer, with jitter so many visitors'
// retries don't land together.
export const RETRY_DELAYS_MS = [250, 750];
/** @param {number} ms */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Calls `attempt()` (a fetch) again after a quick failure that is safe to
// repeat: an answer whose status `again` accepts (such as 429, "too many
// requests"), or, when `again` also accepts a thrown error, a dropped
// connection. Each caller decides what is safe: a request Resend can recognize
// as a repeat may be sent again after anything; a booking only after Cal.com
// said it took nothing in. A timeout is never retried, because the visitor has
// already waited for it. Returns the last answer or throws the last error.
/**
 * @param {() => Promise<Response>} attempt
 * @param {(status: number | null, err: unknown) => boolean} again
 * @param {number[]} [delays]
 * @returns {Promise<Response>}
 */
export async function withRetries(attempt, again, delays = RETRY_DELAYS_MS) {
  for (let i = 0; ; i++) {
    let response;
    try {
      response = await attempt();
    } catch (err) {
      if (i >= delays.length || /** @type {Error | undefined} */ (err)?.message === 'timeout' || !again(null, err)) throw err;
    }
    if (response) {
      if (i >= delays.length || !again(response.status, null)) return response;
      try { await response.body?.cancel(); } catch { /* nothing to free */ }
    }
    const asked = response ? Number(response.headers.get('Retry-After')) : 0;
    await sleep(Math.max(delays[i] * (0.75 + Math.random() * 0.5), asked > 0 && asked <= 2 ? asked * 1000 : 0));
  }
}

// What's safe to repeat for a read, or a write the service drops as a repeat:
// a dropped connection, 429, or a server error.
/** @param {number | null} status @param {unknown} err */
export const retryAnyFailure = (status, err) => (err ? true : status === 429 || (status !== null && status >= 500));

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** @param {string | Uint8Array} input */
export function toBase64url(input) {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {string} text */
export function fromBase64url(text) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

/** @param {Uint8Array} bytes */
export const bytesToText = bytes => decoder.decode(bytes);
/** @param {string} text */
export const textToBytes = text => encoder.encode(text);

// A valid IANA time zone name, or null.
/** @param {unknown} value @returns {string | null} */
export function timeZoneOrNull(value) {
  if (typeof value !== 'string' || value.length > 64) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}
