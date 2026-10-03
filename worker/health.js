// A daily check, from inside the Worker where the keys are, that each outside
// service /start depends on still answers: email (Resend), the calendar
// (Cal.com open times), the AI (Workers AI), the bot check's secret
// (Turnstile) and phone alerts (ntfy). The hourly job runs every check once a
// UTC day, then checks again each hour any service that failed, until it
// passes, so a short outage clears the same day. Results are kept 30 days and
// shown on /admin, and Thomas gets a phone alert when one fails in the daily
// run. /api/health publishes only which services passed, for the live check on
// GitHub (scripts/smoke-test.mjs). Nothing is sent to anyone: no email,
// booking or alert unless something has failed.
import { calEvent, settings } from './config.js';
import { ensureSchema } from './db.js';
import { json, overLimit, tooMany, withTimeout } from './http.js';
import { MODEL } from './outline.js';
import { notify, ntfyFetch, openTimes } from './services.js';

const DAY = 24 * 60 * 60 * 1000;

/** @type {Record<string, string>} */
export const SERVICES = {
  email: 'Email (Resend)',
  calendar: 'Calendar (Cal.com)',
  ai: 'AI outlines (Workers AI)',
  botCheck: 'Bot check (Turnstile)',
  alerts: 'Phone alerts (ntfy)',
};

// Workers AI's answer when the free daily allowance is used up (error 4006):
// visitors get template outlines until it frees up, but nothing is down.
const ALLOWANCE_USED_UP = /\b4006\b|free allocation/i;

// Each check answers { ok, note }, or null when that service isn't switched on.
// `limited` marks a failure that is only a used-up allowance.
/** @type {Record<string, (env: Env) => Promise<CheckResult | null>>} */
const CHECKS = {
  async email(env) {
    if (!env.RESEND_API_KEY) return null;
    const response = await withTimeout(fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` } }), 8000);
    const body = /** @type {{ data?: unknown, name?: unknown } | null} */ (await response.json().catch(() => null));
    if (response.ok) {
      const domain = (settings(env).from.match(/@([^>\s]+)/) || [])[1];
      const found = (Array.isArray(body?.data) ? body.data : []).find(/** @param {{ name?: unknown, status?: unknown } | null} d */ d => d && d.name === domain);
      if (!found) return { ok: false, note: `${domain} isn't set up in Resend` };
      return { ok: found.status === 'verified', note: `${domain} is ${found.status}` };
    }
    // A key that may only send can't list domains, and Resend says so only to
    // a valid key, so this still proves the key works.
    if (response.status === 401 && body?.name === 'restricted_api_key') return { ok: true, note: 'key accepted (sending only)' };
    return { ok: false, note: `Resend answered ${response.status}` };
  },
  async calendar(env) {
    const cal = calEvent(env);
    if (!cal) return null;
    const now = new Date();
    const times = await openTimes(env, cal, now, new Date(now.getTime() + 21 * DAY));
    if (!times) return { ok: false, note: 'Cal.com didn\'t answer' };
    return times.length ? { ok: true, note: `${times.length} open times in the next three weeks` } : { ok: false, note: 'no open times in the next three weeks' };
  },
  async ai(env) {
    if (!env.AI) return null;
    // A few words, a tiny share of the daily allowance.
    let reply;
    try {
      reply = await withTimeout(env.AI.run(MODEL, { messages: [{ role: 'user', content: 'Reply with the word OK.' }], max_tokens: 5 }), 15000);
    } catch (err) {
      if (ALLOWANCE_USED_UP.test(String(err && /** @type {Error} */ (err).message))) return { ok: false, limited: true, note: 'the free daily allowance is used up; visitors get template outlines until it frees up' };
      throw err;
    }
    return reply && reply.response ? { ok: true, note: 'answered' } : { ok: false, note: 'no answer' };
  },
  async botCheck(env) {
    if (!env.TURNSTILE_SECRET) return null;
    // A made-up token is refused either way, but a wrong secret is named.
    const response = await withTimeout(fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: 'daily-check' }),
    }), 8000);
    const body = /** @type {{ 'error-codes'?: string[] } | null} */ (await response.json().catch(() => null));
    if (!response.ok || !body) return { ok: false, note: `Turnstile answered ${response.status}` };
    return (body['error-codes'] || []).includes('invalid-input-secret') ? { ok: false, note: 'Turnstile turned down the secret' } : { ok: true, note: 'secret accepted' };
  },
  async alerts(env) {
    if (!env.NTFY_TOPIC) return null;
    const response = await ntfyFetch(env, '/v1/health');
    const body = /** @type {{ healthy?: unknown } | null} */ (await response.json().catch(() => null));
    if (body && body.healthy === true) return { ok: true, note: 'ntfy is up' };
    const fallback = env.RESEND_API_KEY ? '; alerts go to your email instead' : '';
    const hint = response.status === 429 && !env.NTFY_TOKEN ? ' (ntfy limits Cloudflare\'s shared addresses; an NTFY_TOKEN fixes it)' : '';
    return { ok: false, note: `ntfy answered ${response.status}${hint}${fallback}` };
  },
};

// Runs every check once a UTC day, and in the hours between, checks again
// only the services that failed last time, keeping the others' results.
/** @param {Env} env @param {number} [now] */
export async function runHealthChecks(env, now = Date.now()) {
  if (!env.DB) return;
  await ensureSchema(env.DB);
  const today = new Date(now).toISOString().slice(0, 10);
  /** @type {{ checked_at: string, results: string } | null} */
  const last = await env.DB.prepare('SELECT checked_at, results FROM service_checks ORDER BY checked_at DESC LIMIT 1').first();
  const daily = !last || last.checked_at.slice(0, 10) !== today;
  /** @type {Record<string, CheckResult>} */
  const before = last ? JSON.parse(last.results) : {};
  const names = daily ? Object.keys(CHECKS) : Object.keys(before).filter(name => !before[name].ok && CHECKS[name]);
  if (!names.length) return;
  /** @type {Record<string, CheckResult>} */
  const results = daily ? {} : { ...before };
  for (const name of names) {
    let result;
    try {
      result = await CHECKS[name](env);
    } catch (err) {
      result = { ok: false, note: err && /** @type {Error} */ (err).message === 'timeout' ? 'no answer in time' : 'couldn\'t be reached' };
    }
    if (result) results[name] = result;
    else delete results[name];
  }
  await env.DB.batch([
    env.DB.prepare('INSERT INTO service_checks (checked_at, results) VALUES (?, ?)').bind(new Date(now).toISOString(), JSON.stringify(results)),
    env.DB.prepare('DELETE FROM service_checks WHERE checked_at < ?').bind(new Date(now - 30 * DAY).toISOString()),
  ]);
  // One alert a day: the hourly re-checks only clear a failure. A used-up
  // allowance isn't an outage, so it shows on /admin without an alert.
  const failed = daily ? Object.entries(results).filter(([, r]) => !r.ok && !r.limited) : [];
  if (failed.length) {
    await notify(env, {
      title: 'A service /start needs is failing',
      body: `${failed.map(([name, r]) => `${SERVICES[name]}: ${r.note}`).join('. ')}. Details on your leads list.`,
      click: `${settings(env).siteUrl}/admin#health-title`,
    });
  }
}

// The latest check: { checkedAt, services: { name: { ok, note } } }, or null.
/** @param {Env} env @returns {Promise<HealthReport | null>} */
export async function healthReport(env) {
  if (!env.DB) return null;
  await ensureSchema(env.DB);
  /** @type {{ checked_at: string, results: string } | null} */
  const row = await env.DB.prepare('SELECT checked_at, results FROM service_checks ORDER BY checked_at DESC LIMIT 1').first();
  return row ? { checkedAt: row.checked_at, services: JSON.parse(row.results) } : null;
}

// GET /api/health: when the services were last checked, which passed, and
// which failed only because an allowance is used up. The notes stay on /admin.
/** @param {Request} request @param {Env} env */
export async function healthRoute(request, env) {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
  if (await overLimit(env.API_LIMIT, request, env)) return tooMany();
  const report = await healthReport(env);
  const services = report ? Object.entries(report.services) : [];
  return json({
    checkedAt: report ? report.checkedAt : null,
    services: Object.fromEntries(services.map(([name, r]) => [name, r.ok])),
    limited: services.filter(([, r]) => r.limited).map(([name]) => name),
  });
}
