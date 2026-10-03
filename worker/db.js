// The leads database (Cloudflare D1, bound as env.DB) and the signed tokens
// that tie each step of /start to the one before it.
//
// Tables are created on first use, so a new database needs no setup step.
import { bytesToText, fromBase64url, textToBytes, toBase64url } from './http.js';

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  // One row per saved outline. `outline_id` is the random ID in the outline's
  // token, so the same outline saved twice (a double click) stays one lead.
  `CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    outline_id TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    email TEXT NOT NULL,
    emailed_at TEXT,
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
    booking_uid TEXT,
    booking_start TEXT,
    lang TEXT
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
  // Every outline written each day, by how it was written: 'ai', or why the
  // template was used instead ('cap', 'error', 'rejected', 'unusable', 'off').
  // Shown on /admin, so a prompt or model change that quietly breaks the AI shows.
  `CREATE TABLE IF NOT EXISTS outline_outcomes (
    day TEXT NOT NULL,
    outcome TEXT NOT NULL,
    n INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, outcome)
  )`,
  // How many outlines the AI was asked for each day (UTC), for the daily cap.
  'CREATE TABLE IF NOT EXISTS ai_daily (day TEXT PRIMARY KEY, n INTEGER NOT NULL)',
  // One row per outline email, for the daily cap per inbox. `tag` stands in for
  // the address (see inboxTag), and rows are deleted after two days.
  'CREATE TABLE IF NOT EXISTS outline_sends (tag TEXT NOT NULL, sent_at TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS outline_sends_tag ON outline_sends (tag, sent_at)',
  // The AI outline eval the site runs on itself (eval.js): one row per run,
  // with each sample problem's result added as it's done.
  `CREATE TABLE IF NOT EXISTS eval_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL,
    model TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    results TEXT NOT NULL DEFAULT '[]'
  )`,
  // The daily check of each outside service (health.js): one row a day, with
  // { service: { ok, note } }. Kept 30 days.
  'CREATE TABLE IF NOT EXISTS service_checks (checked_at TEXT PRIMARY KEY, results TEXT NOT NULL)',
  // Every change to the leads list, newest last: what was done, when, and to
  // which lead (its random ID, never its details). Shown on /admin and kept
  // about 13 months, like the counts.
  `CREATE TABLE IF NOT EXISTS admin_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    action TEXT NOT NULL,
    lead TEXT
  )`,
];

// Columns added to a table after it first went live. CREATE TABLE IF NOT
// EXISTS leaves an existing table as it is, so these are added on first use.
//   leads.booking_start: the time the visitor picked, kept while Cal.com's
//   answer is unclear ('pending'), so /admin can show it and mark it booked.
//   leads.lang: the language of the page the outline was saved on (a code
//   from languages.js), so the visitor's emails and delete page use it.
const ADDED_COLUMNS = [
  ['leads', 'booking_start', 'TEXT'],
  ['leads', 'lang', 'TEXT'],
];

/** @param {D1Database} DB */
async function addColumns(DB) {
  for (const [table, column, type] of ADDED_COLUMNS) {
    const { results } = await DB.prepare(`PRAGMA table_info(${table})`).all();
    if ((results || []).some(c => c.name === column)) continue;
    await DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run().catch(err => {
      // Another copy of the Worker added it a moment ago.
      if (!/duplicate column/i.test(String(err && err.message))) throw err;
    });
  }
}

/** @type {WeakMap<D1Database, Promise<void>>} */
const ready = new WeakMap();

/** @param {D1Database} DB @returns {Promise<void>} */
export function ensureSchema(DB) {
  if (!ready.has(DB)) {
    const setup = DB.batch(SCHEMA.map(sql => DB.prepare(sql))).then(() => addColumns(DB)).catch(err => {
      ready.delete(DB);
      throw err;
    });
    ready.set(DB, setup);
  }
  return /** @type {Promise<void>} */ (ready.get(DB));
}

// Records one change to the leads list in admin_log ('deleted', 'marked
// booked', 'downloaded the list', ...), with the lead's ID when it's about one.
/** @param {D1Database} DB @param {string} action @param {string | null} [lead] */
export async function audit(DB, action, lead = null) {
  await DB.prepare('INSERT INTO admin_log (at, action, lead) VALUES (?, ?, ?)').bind(new Date().toISOString(), action, lead).run();
}

// The key that signs tokens: made once, at random, and kept in the database,
// so there's no extra secret to set up. Anyone who can read the database can
// already read the leads, so this protects nothing more by living elsewhere.
/** @type {WeakMap<D1Database, Promise<CryptoKey>>} */
const keys = new WeakMap();

/** @param {D1Database} DB @returns {Promise<CryptoKey>} */
async function loadKey(DB) {
  await ensureSchema(DB);
  /** @returns {Promise<string | null>} */
  const read = () => DB.prepare('SELECT value FROM settings WHERE key = ?').bind('signing_key').first('value');
  let value = await read();
  if (!value) {
    const fresh = toBase64url(crypto.getRandomValues(new Uint8Array(32)));
    // If two requests race here, the first write wins and both read it back.
    await DB.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind('signing_key', fresh).run();
    value = await read();
  }
  return crypto.subtle.importKey('raw', fromBase64url(/** @type {string} */ (value)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** @param {D1Database} DB @returns {Promise<CryptoKey>} */
function signingKey(DB) {
  if (!keys.has(DB)) {
    keys.set(DB, loadKey(DB).catch(err => {
      keys.delete(DB);
      throw err;
    }));
  }
  return /** @type {Promise<CryptoKey>} */ (keys.get(DB));
}

// "v1.<data>.<signature>": the data is readable by whoever holds the token, but
// only this Worker can make a signature that matches it. `iat` (issued at, in
// seconds) can be fixed so the same token comes out every time, as the delete
// link does, so a retried email is identical to the first try.
/** @param {EnvWithDB} env @param {string} purpose @param {object} data @param {number} [iat] */
export async function sign(env, purpose, data, iat = Math.floor(Date.now() / 1000)) {
  const key = await signingKey(env.DB);
  const payload = toBase64url(JSON.stringify({ ...data, p: purpose, iat }));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, textToBytes(`v1.${payload}`)));
  return `v1.${payload}.${toBase64url(signature)}`;
}

// The token's data if it's genuine, made for this purpose and younger than
// maxAge seconds (when given); otherwise null. Each token has exactly one
// spelling: base64 decoding forgives spaces, padding and unused bits, so a
// signature is only accepted written the way sign() writes it.
/** @param {EnvWithDB} env @param {string} purpose @param {unknown} token @param {number} [maxAge] @returns {Promise<TokenData | null>} */
export async function verify(env, purpose, token, maxAge) {
  if (typeof token !== 'string' || token.length > 20000) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1' || !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) return null;
  try {
    const signature = fromBase64url(parts[2]);
    if (toBase64url(signature) !== parts[2]) return null;
    const key = await signingKey(env.DB);
    const genuine = await crypto.subtle.verify('HMAC', key, signature, textToBytes(`v1.${parts[1]}`));
    if (!genuine) return null;
    const data = JSON.parse(bytesToText(fromBase64url(parts[1])));
    if (!data || data.p !== purpose || typeof data.iat !== 'number') return null;
    const age = Date.now() / 1000 - data.iat;
    if (age < -300 || (maxAge && age > maxAge)) return null;
    return data;
  } catch {
    return null;
  }
}

// Whether the leads database is bound. Each part that needs it already checks
// (features() in config.js); this tells the type checker too.
/** @param {Env} env @returns {env is EnvWithDB} */
export const hasDatabase = env => Boolean(env.DB);

export const newId = () => toBase64url(crypto.getRandomValues(new Uint8Array(16)));

// A keyed hash that stands in for an inbox: the same inbox always gives the
// same tag, but a tag can't be read back as the address.
/** @param {EnvWithDB} env @param {string} inbox */
export async function inboxTag(env, inbox) {
  const key = await signingKey(env.DB);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, textToBytes(`inbox.${inbox}`)));
  return toBase64url(mac.subarray(0, 16));
}

// Making a date formatter is slow next to using one, so each is made once.
// Time zones are checked names, so there are only a few hundred at most.
/** @type {Map<string, Intl.DateTimeFormat>} */
const formats = new Map();
/** @param {string} timeZone @param {Intl.DateTimeFormatOptions} options @returns {Intl.DateTimeFormat} */
export function formatIn(timeZone, options) {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  if (!formats.has(key)) formats.set(key, new Intl.DateTimeFormat('en-US', { timeZone, ...options }));
  return /** @type {Intl.DateTimeFormat} */ (formats.get(key));
}

/** @param {string} timeZone @param {Date} date @param {Intl.DateTimeFormatOptions} options */
function partsIn(timeZone, date, options) {
  const parts = formatIn(timeZone, options).formatToParts(date);
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}

// The date (YYYY-MM-DD) in a time zone, so "today" in the counts matches
// Thomas's day.
/** @param {string} timeZone @param {Date} [date] */
export function dayIn(timeZone, date = new Date()) {
  const { year, month, day } = partsIn(timeZone, date, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${year}-${month}-${day}`;
}

// The hour of the day (0-23) in a time zone.
/** @param {string} timeZone @param {Date} [date] */
export const hourIn = (timeZone, date = new Date()) =>
  Number(partsIn(timeZone, date, { hour: 'numeric', hourCycle: 'h23' }).hour);

/** @param {Env} env @param {string} timeZone @param {CameFrom} from @param {CountStep} step */
export async function count(env, timeZone, { ad, src }, step) {
  if (!env.DB) return;
  await ensureSchema(env.DB);
  await env.DB.prepare(
    'INSERT INTO counts (day, ad, src, step, n) VALUES (?, ?, ?, ?, 1) ON CONFLICT (day, ad, src, step) DO UPDATE SET n = n + 1',
  ).bind(dayIn(timeZone), ad, src, step).run();
}

/** @param {Env} env @param {string} timeZone @param {string} outcome */
export async function countOutcome(env, timeZone, outcome) {
  if (!env.DB) return;
  await ensureSchema(env.DB);
  await env.DB.prepare(
    'INSERT INTO outline_outcomes (day, outcome, n) VALUES (?, ?, 1) ON CONFLICT (day, outcome) DO UPDATE SET n = n + 1',
  ).bind(dayIn(timeZone), outcome).run();
}
