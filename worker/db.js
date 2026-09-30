// The leads database (Cloudflare D1, bound as env.DB) and the signed tokens
// that tie each step of /start to the one before it.
//
// Tables are created on first use, so a new database needs no setup step.
import { bytesToText, fromBase64url, textToBytes, toBase64url } from './http.js';

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  // One row per saved outline. `sig` is the outline token's signature, so the
  // same outline saved twice (a double click) stays one lead.
  `CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    sig TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    email TEXT NOT NULL,
    tz TEXT,
    problem TEXT NOT NULL,
    kind TEXT NOT NULL,
    ad TEXT NOT NULL,
    src TEXT NOT NULL,
    source TEXT NOT NULL,
    outline TEXT NOT NULL,
    follow_up INTEGER NOT NULL DEFAULT 0,
    follow_up_sent_at TEXT,
    sends INTEGER NOT NULL DEFAULT 1,
    name TEXT,
    booked_at TEXT,
    booking_uid TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS leads_created_at ON leads (created_at)',
  // Daily totals per ad and ad platform: page views, outlines, saves, bookings.
  // Numbers only, nothing about who.
  `CREATE TABLE IF NOT EXISTS counts (
    day TEXT NOT NULL,
    ad TEXT NOT NULL,
    src TEXT NOT NULL,
    step TEXT NOT NULL,
    n INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, ad, src, step)
  )`,
];

const ready = new WeakMap();

export function ensureSchema(DB) {
  if (!ready.has(DB)) {
    const setup = DB.batch(SCHEMA.map(sql => DB.prepare(sql))).catch(err => {
      ready.delete(DB);
      throw err;
    });
    ready.set(DB, setup);
  }
  return ready.get(DB);
}

// The key that signs tokens: made once, at random, and kept in the database,
// so there's no extra secret to set up. Anyone who can read the database can
// already read the leads, so this protects nothing more by living elsewhere.
const keys = new WeakMap();

async function loadKey(DB) {
  await ensureSchema(DB);
  const read = () => DB.prepare('SELECT value FROM settings WHERE key = ?').bind('signing_key').first('value');
  let value = await read();
  if (!value) {
    const fresh = toBase64url(crypto.getRandomValues(new Uint8Array(32)));
    // If two requests race here, the first write wins and both read it back.
    await DB.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind('signing_key', fresh).run();
    value = await read();
  }
  return crypto.subtle.importKey('raw', fromBase64url(value), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function signingKey(DB) {
  if (!keys.has(DB)) {
    keys.set(DB, loadKey(DB).catch(err => {
      keys.delete(DB);
      throw err;
    }));
  }
  return keys.get(DB);
}

// "v1.<data>.<signature>": the data is readable by whoever holds the token, but
// only this Worker can make a signature that matches it.
export async function sign(env, purpose, data) {
  const key = await signingKey(env.DB);
  const payload = toBase64url(JSON.stringify({ ...data, p: purpose, iat: Math.floor(Date.now() / 1000) }));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, textToBytes(`v1.${payload}`)));
  return `v1.${payload}.${toBase64url(signature)}`;
}

// The token's data if it's genuine, made for this purpose and younger than
// maxAge seconds (when given); otherwise null.
export async function verify(env, purpose, token, maxAge) {
  if (typeof token !== 'string' || token.length > 20000) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  try {
    const key = await signingKey(env.DB);
    const genuine = await crypto.subtle.verify('HMAC', key, fromBase64url(parts[2]), textToBytes(`v1.${parts[1]}`));
    if (!genuine) return null;
    const data = JSON.parse(bytesToText(fromBase64url(parts[1])));
    if (!data || data.p !== purpose || typeof data.iat !== 'number') return null;
    const age = Date.now() / 1000 - data.iat;
    if (age < -300 || (maxAge && age > maxAge)) return null;
    return { ...data, sig: parts[2] };
  } catch {
    return null;
  }
}

export const newId = () => toBase64url(crypto.getRandomValues(new Uint8Array(16)));

function partsIn(timeZone, date, options) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, ...options }).formatToParts(date);
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}

// The date (YYYY-MM-DD) in a time zone, so "today" in the counts matches
// Thomas's day.
export function dayIn(timeZone, date = new Date()) {
  const { year, month, day } = partsIn(timeZone, date, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${year}-${month}-${day}`;
}

// The hour of the day (0-23) in a time zone.
export const hourIn = (timeZone, date = new Date()) =>
  Number(partsIn(timeZone, date, { hour: 'numeric', hourCycle: 'h23' }).hour);

export async function count(env, timeZone, { ad, src }, step) {
  if (!env.DB) return;
  await ensureSchema(env.DB);
  await env.DB.prepare(
    'INSERT INTO counts (day, ad, src, step, n) VALUES (?, ?, ?, ?, 1) ON CONFLICT (day, ad, src, step) DO UPDATE SET n = n + 1',
  ).bind(dayIn(timeZone), ad, src, step).run();
}
