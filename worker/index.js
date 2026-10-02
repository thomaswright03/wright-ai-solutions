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
//   /forget            the "delete my details" link in every email
//   /admin             Thomas's private leads list (admin.js)
import { adminRoute } from './admin.js';
import { json } from './http.js';
import { bookRoute, configRoute, eventRoute, forgetRoute, runSchedule, saveRoute, slotsRoute } from './leads.js';
import { outlineRoute } from './outline.js';

export { MODEL, KINDS, SYSTEM_PROMPT, validateOutline, templateOutline } from './outline.js';

const ROUTES = {
  '/api/outline': outlineRoute,
  '/api/config': configRoute,
  '/api/event': eventRoute,
  '/api/save': saveRoute,
  '/api/slots': slotsRoute,
  '/api/book': bookRoute,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const context = ctx || { waitUntil() {} };
    try {
      if (Object.hasOwn(ROUTES, url.pathname)) return await ROUTES[url.pathname](request, env, context, url);
      if (url.pathname === '/forget') return await forgetRoute(request, env, url);
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return await adminRoute(request, env, url);
      return json({ error: 'not_found' }, 404);
    } catch {
      // Never show the visitor (or an attacker) the details.
      return json({ error: 'server_error' }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runSchedule(env, event.scheduledTime));
  },
};
