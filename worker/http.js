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

export const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });

export const htmlResponse = (body, status = 200, extra = {}) =>
  new Response(body, { status, headers: { ...HTML_HEADERS, ...extra } });

// Plain text only: no control characters, single spaces.
export const clean = value => String(value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();

export const escapeHtml = value => String(value).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// A POST from this site's own pages with a JSON object body of at most `max`
// bytes. Returns { body } or { error: <Response to send instead> }.
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

export const clientIp = request => request.headers.get('CF-Connecting-IP') || 'unknown';

// Cloudflare's rate limiting binding, per visitor (IP) per Cloudflare location.
// No binding (the local test server) means no limit.
export async function overLimit(limiter, request) {
  if (!limiter) return false;
  const { success } = await limiter.limit({ key: clientIp(request) });
  return !success;
}

export const tooMany = () => json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });

export function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64url(input) {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(text) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

export const bytesToText = bytes => decoder.decode(bytes);
export const textToBytes = text => encoder.encode(text);

// A valid IANA time zone name, or null.
export function timeZoneOrNull(value) {
  if (typeof value !== 'string' || value.length > 64) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}
