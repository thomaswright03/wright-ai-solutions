// The AI outline eval, run by the site on itself. The sample problems in
// eval-cases.js go through the same model, prompt and checks /start uses, a
// batch in each hourly run (index.js), and the result is published at
// /api/eval and shown on /admin. A new run starts a week after the last one
// finished, or as soon as the model, the prompt or the cases change. No
// visitor's text is involved. scripts/eval-outlines.mjs runs the same cases by
// hand or on GitHub.
import { adFor } from '../outlines.js';
import { settings } from './config.js';
import { ensureSchema } from './db.js';
import { CASES } from './eval-cases.js';
import { json, overLimit, tooMany, withTimeout } from './http.js';
import { AI_TIMEOUT_MS, GUARD, MODEL, cleanProblem, finishOutline, looksLikeInjection, outlineRequest, rejectionReason } from './outline.js';
import { notify } from './services.js';

export { CASES };
// The share of cases that must come back right.
export const EVAL_BAR = 0.9;
const DAY = 24 * 60 * 60 * 1000;
const EVERY = 7 * DAY;
// Cases per hourly run, well inside the Free plan's 50 outside calls per run.
export const EVAL_BATCH = 12;
// A batch runs only while today's AI outlines (visitors' and the eval's
// together) number fewer than this, so the eval never uses up the free daily
// allowance of about 90 that visitors' outlines rely on.
export const EVAL_ROOM = 40;

/** @param {EvalCase} c */
const hintFor = c => (c.ad ? /** @type {AdPage} */ (adFor(c.ad)).kind : null);

// The request for one case, exactly as /api/outline would send it.
// A case with `lang` is one typed on that language's page, so the outline has
// to come back in that language.
/** @param {EvalCase} c */
export const requestFor = c => outlineRequest(cleanProblem(c.problem), hintFor(c), c.lang || 'en');

// Whether the model's reply is right for the case: an outline that passes the
// site's checks for a usable case, and a "usable": false for an unusable one.
// Kind (after the site settles it against the visitor's words) is reported but
// not required; a usable outline of another kind still helps the visitor.
/** @param {EvalCase} c @param {unknown} raw @returns {CaseOutcome} */
export function judge(c, raw) {
  const outline = finishOutline(raw, cleanProblem(c.problem), hintFor(c), c.lang || 'en');
  const outcome = outline ? 'ai' : rejectionReason(raw, c.lang || 'en');
  const pass = c.expect === 'usable' ? Boolean(outline) : outcome === 'unusable';
  const kindMatch = c.kind && outline ? outline.kind === c.kind : null;
  return { outcome, pass, kindMatch, title: outline ? outline.title : null };
}

// One case the way the site handles it: text the injection guard catches
// never reaches the AI ('guarded', right only for an unusable case, so a guard
// that catches a real problem fails the eval). Otherwise `ask(request)`
// returns the model's reply. { guard: false } asks the model anyway, to test
// the prompt on its own.
/**
 * @param {EvalCase} c @param {(request: ReturnType<typeof requestFor>) => Promise<unknown>} ask
 * @param {{ guard?: boolean }} [options]
 * @returns {Promise<CaseOutcome>}
 */
export async function runCase(c, ask, { guard = true } = {}) {
  if (guard && looksLikeInjection(c.problem)) return { outcome: 'guarded', pass: c.expect === 'unusable', kindMatch: null, title: null };
  return judge(c, await ask(requestFor(c)));
}

/** @param {{ pass: boolean, kindMatch?: boolean | null }[]} results @returns {EvalSummary} */
function summarize(results) {
  const passed = results.filter(r => r.pass).length;
  const kinds = results.filter(r => r.kindMatch !== null && r.kindMatch !== undefined);
  return {
    passed,
    total: results.length,
    rate: results.length ? passed / results.length : 0,
    kindRight: kinds.filter(r => r.kindMatch).length,
    kindTotal: kinds.length,
  };
}

// Names this model, prompt, injection guard and set of cases, so changing any
// of them starts a new run instead of mixing results.
export async function evalVersion() {
  const text = JSON.stringify({ model: MODEL, request: outlineRequest('', null), guard: GUARD, cases: CASES });
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...hash.subarray(0, 6)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// One hourly step: start a run if one is due, then ask the AI the next few
// cases. A case the AI can't answer (down, slow or out of its allowance) is
// left for the next hour rather than counted against the prompt.
/** @param {Env} env @param {number} [now] */
export async function runEvalBatch(env, now = Date.now()) {
  if (!env.AI || !env.DB) return;
  await ensureSchema(env.DB);
  /** @param {number} ms */
  const iso = ms => new Date(ms).toISOString();
  const version = await evalVersion();
  /** @type {EvalRunRow | null} */
  let run = await env.DB.prepare('SELECT id, version, finished_at, results FROM eval_runs ORDER BY id DESC LIMIT 1').first();
  const due = !run || run.version !== version || (run.finished_at && Date.parse(run.finished_at) <= now - EVERY);
  if (run && !due && run.finished_at) return;

  const today = iso(now).slice(0, 10);
  const used = Number(await env.DB.prepare('SELECT n FROM ai_daily WHERE day = ?').bind(today).first('n')) || 0;
  const size = Math.min(EVAL_BATCH, EVAL_ROOM - used);
  if (size <= 0) return;

  if (due) {
    await env.DB.prepare('DELETE FROM eval_runs WHERE started_at < ?').bind(iso(now - 400 * DAY)).run();
    run = await env.DB.prepare('INSERT INTO eval_runs (version, model, started_at) VALUES (?, ?, ?) RETURNING id, version, finished_at, results')
      .bind(version, MODEL, iso(now)).first();
  }
  // Always there: the row read above, or the one just added.
  if (!run) return;
  /** @type {CaseResult[]} */
  const results = JSON.parse(run.results);
  let asked = 0;
  /** @param {object} request */
  const ask = async request => {
    asked += 1;
    // Checked at the top.
    const reply = await withTimeout(/** @type {AiBinding} */ (env.AI).run(MODEL, request), AI_TIMEOUT_MS);
    return reply && reply.response;
  };
  for (const c of CASES.slice(results.length, results.length + size)) {
    let result;
    try {
      result = await runCase(c, ask);
    } catch {
      break;
    }
    results.push({ id: c.id, pass: result.pass, outcome: result.outcome, kindMatch: result.kindMatch });
  }

  const finished = results.length >= CASES.length;
  await env.DB.batch([
    env.DB.prepare('UPDATE eval_runs SET results = ?, finished_at = ? WHERE id = ?').bind(JSON.stringify(results), finished ? iso(now) : null, run.id),
    // Counted with visitors' outlines, so the daily cap covers the eval too.
    env.DB.prepare('INSERT INTO ai_daily (day, n) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET n = n + excluded.n').bind(today, asked),
  ]);
  if (!finished) return;
  const { passed, total, rate } = summarize(results);
  /** @type {{ results: string } | null} */
  const before = await env.DB.prepare('SELECT results FROM eval_runs WHERE finished_at IS NOT NULL AND id < ? ORDER BY id DESC LIMIT 1').bind(run.id).first();
  const last = before ? summarize(JSON.parse(before.results)) : null;
  const click = `${settings(env).siteUrl}/admin#eval-title`;
  if (rate < EVAL_BAR) {
    await notify(env, {
      title: 'AI outline eval below the bar',
      body: `${passed} of ${total} sample problems came back right; the bar is ${Math.round(EVAL_BAR * 100)}%. Visitors still get an outline (templates cover what the AI gets wrong). Details on your leads list.`,
      click,
    });
  } else if (last && rate < last.rate) {
    // A slide is worth knowing about before it reaches the bar.
    await notify(env, {
      title: 'AI outline eval dropped',
      body: `${passed} of ${total} sample problems came back right, down from ${last.passed} of ${last.total} last time. Still above the ${Math.round(EVAL_BAR * 100)}% bar. Details on your leads list.`,
      click,
    });
  }
}

// Finished runs kept in the report's history, newest first.
export const EVAL_HISTORY = 6;

// The latest finished run (with each case), the few before it, and any run
// under way, for /api/eval and /admin.
/** @param {Env} env @returns {Promise<EvalReport>} */
export async function evalReport(env) {
  const version = await evalVersion();
  /** @type {EvalReport} */
  const report = { model: MODEL, version, bar: EVAL_BAR, cases: CASES.length, on: Boolean(env.AI && env.DB), latest: null, running: null, history: [] };
  if (!env.DB) return report;
  await ensureSchema(env.DB);
  const [finished, newest] = await Promise.all([
    /** @type {Promise<D1Result<EvalRunRow & { finished_at: string }>>} */ (env.DB.prepare('SELECT * FROM eval_runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT ?').bind(EVAL_HISTORY).all()),
    /** @type {Promise<EvalRunRow | null>} */ (env.DB.prepare('SELECT * FROM eval_runs ORDER BY id DESC LIMIT 1').first()),
  ]);
  const expectOf = new Map(CASES.map(c => [c.id, c.expect]));
  const runs = (finished.results || []).map(row => ({ row, results: /** @type {CaseResult[]} */ (JSON.parse(row.results)) }));
  report.history = runs.map(({ row, results }) => ({
    version: row.version,
    model: row.model,
    current: row.version === version,
    finishedAt: row.finished_at,
    ...summarize(results),
  }));
  if (runs.length) {
    const [{ row, results }] = runs;
    report.latest = {
      ...report.history[0],
      startedAt: row.started_at,
      results: results.map(r => ({ id: r.id, expect: expectOf.get(r.id) || null, pass: r.pass, outcome: r.outcome, kindMatch: r.kindMatch })),
    };
  }
  if (newest && !newest.finished_at && newest.version === version) {
    report.running = { startedAt: newest.started_at, done: JSON.parse(newest.results).length, total: CASES.length };
  }
  return report;
}

// GET /api/eval: the eval's latest result, public. Synthetic cases only.
/** @param {Request} request @param {Env} env */
export async function evalRoute(request, env) {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
  if (await overLimit(env.API_LIMIT, request)) return tooMany();
  return json(await evalReport(env));
}
