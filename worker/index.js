// The site's only server code. Static files are served straight from the assets
// directory without running it (see wrangler.jsonc); only /api/*, /admin and
// /forget reach it, plus an hourly scheduled run.
//
//   POST /api/outline  the AI-written outline for /start (outline.js)
//   GET  /api/config   which parts of /start are switched on (config.js)
//   POST /api/event    counts a /start page view by ad, with nothing about who
//   POST /api/save     emails the outline and adds the lead to the list (leads.js)
//   GET  /api/slots    open times from Cal.com
//   POST /api/book     books the call through Cal.com
//   GET  /api/eval     the latest result of the AI outline eval (eval.js)
//   GET  /api/health   which outside services passed today's check (health.js)
//   /forget            the "delete my details" link in every email
//   /admin             Thomas's private leads list (admin.js)
import { adminRoute } from './admin.js';
import { evalRoute, runEvalBatch } from './eval.js';
import { healthRoute, runHealthChecks } from './health.js';
import { json, logError } from './http.js';
import { bookRoute, configRoute, eventRoute, forgetRoute, runSchedule, saveRoute, slotsRoute } from './leads.js';
import { outlineRoute } from './outline.js';

export { MODEL, KINDS, SYSTEM_PROMPT, validateOutline, templateOutline } from './outline.js';

/** @type {Record<string, Route>} */
const ROUTES = {
  '/api/outline': outlineRoute,
  '/api/config': configRoute,
  '/api/event': eventRoute,
  '/api/save': saveRoute,
  '/api/slots': slotsRoute,
  '/api/book': bookRoute,
  '/api/eval': evalRoute,
  '/api/health': healthRoute,
};

export default /** @satisfies {ExportedHandler<Env>} */ ({
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const context = ctx || { waitUntil() {} };
    try {
      if (Object.hasOwn(ROUTES, url.pathname)) return await ROUTES[url.pathname](request, env, context, url);
      if (url.pathname === '/forget') return await forgetRoute(request, env, url);
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return await adminRoute(request, env, url);
      return json({ error: 'not_found' }, 404);
    } catch (err) {
      // Never show the visitor (or an attacker) the details: only a reference
      // to the log line, for them to quote (docs/FAILURES.md).
      return json({ error: 'server_error', ref: logError(err, { request }) }, 500);
    }
  },

  // Hourly: the leads list's upkeep and reminders, then the next few cases of
  // the AI outline eval (which runs even if the first part failed); and once
  // a day, the check of each outside service.
  async scheduled(event, env, ctx) {
    /** @param {string} where @returns {(err: unknown) => void} */
    const logged = where => err => { logError(err, { where }); };
    ctx.waitUntil(runSchedule(env, event.scheduledTime).catch(logged('hourly upkeep')).then(() => runEvalBatch(env, event.scheduledTime)).catch(logged('AI eval')));
    ctx.waitUntil(runHealthChecks(env, event.scheduledTime).catch(logged('service check')));
  },
});
