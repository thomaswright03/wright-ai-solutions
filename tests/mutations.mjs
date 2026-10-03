// One deliberate break per business risk in docs/RISKS.md, for
// scripts/mutation-check.mjs. Each one undoes the behaviour that protects
// against its risk; the check applies it to a copy of the repo, runs only the
// tests docs/RISKS.md names for that risk, and fails if they still pass. That
// proves those tests would catch the behaviour breaking, not just that they run.
//
// `find` must appear exactly once in `file`, so a refactor that moves the code
// fails the check loudly instead of silently testing nothing: update the entry
// to match the new code.
export const MUTATIONS = [
  {
    risk: 1,
    why: "Thomas's copy of a new lead goes to the visitor instead",
    file: 'worker/leads.js',
    find: 'const tasks = [sendEmail(env, { from: cfg.from, to: [cfg.leadsTo]',
    replace: 'const tasks = [sendEmail(env, { from: cfg.from, to: [lead.email]',
  },
  {
    risk: 2,
    why: 'the lead is freed even when Cal.com may have booked the call',
    file: 'worker/leads.js',
    find: 'if (!booking || booking.taken) {',
    replace: 'if (true) {',
  },
  {
    risk: 3,
    why: '"Not booked" on the leads list no longer frees the lead',
    file: 'worker/admin.js',
    find: "} else if (booked === 'no') {",
    replace: "} else if (booked === 'never') {",
  },
  {
    risk: 4,
    why: 'a calendar outage shows no times instead of saying the calendar is down',
    file: 'worker/leads.js',
    find: "if (!times) return json({ error: 'calendar_unavailable' }, 502);",
    replace: 'if (!times) times = [];',
  },
  {
    risk: 5,
    why: 'nothing is retried after a quick failure',
    file: 'worker/http.js',
    find: 'export const retryAnyFailure = (status, err) => (err ? true : status === 429 || (status !== null && status >= 500));',
    replace: 'export const retryAnyFailure = () => false;',
  },
  {
    risk: 6,
    why: 'a failing service no longer sends an alert',
    file: 'worker/health.js',
    find: 'if (failed.length) {',
    replace: 'if (false) {',
  },
  {
    risk: 7,
    why: 'an outline promising a percentage is let through',
    file: 'worker/outline.js',
    find: String.raw`/\d\s?%|\bper ?cent\b/i,`,
    replace: '/(?!)/,',
  },
  {
    risk: 8,
    why: 'text aimed at the AI is sent to it anyway',
    file: 'worker/outline.js',
    find: "if (looksLikeInjection(raw)) return { outline: null, outcome: 'guarded' };",
    replace: '',
  },
  {
    risk: 9,
    why: 'the guard stops anything that mentions a system',
    file: 'worker/outline.js',
    find: 'const INJECTION = [',
    replace: 'const INJECTION = [/system/i,',
  },
  {
    risk: 10,
    why: 'a drop in the eval score no longer alerts Thomas',
    file: 'worker/eval.js',
    find: '} else if (last && rate < last.rate) {',
    replace: '} else if (false) {',
  },
  {
    risk: 11,
    why: 'the daily AI cap is ignored',
    file: 'worker/outline.js',
    find: 'return Number(used) <= settings(env).aiDailyLimit;',
    replace: 'return true;',
  },
  {
    risk: 12,
    why: 'the bot check is skipped',
    file: 'worker/outline.js',
    find: 'if (on.turnstile && !(await passedBotCheck(env, body.turnstile, clientIp(request), url.hostname))) {',
    replace: 'if (false) {',
  },
  {
    risk: 13,
    why: 'one inbox can be sent 300 outline emails a day',
    file: 'worker/leads.js',
    find: 'const INBOX_DAILY_LIMIT = 3;',
    replace: 'const INBOX_DAILY_LIMIT = 300;',
  },
  {
    risk: 14,
    why: 'any password opens the leads list',
    file: 'worker/admin.js',
    find: 'return difference === 0;',
    replace: 'return true;',
  },
  {
    risk: 15,
    why: 'the delete link no longer deletes',
    file: 'worker/leads.js',
    find: "const deleted = await env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(data.id).run();",
    replace: 'const deleted = { meta: { changes: 0 } };',
  },
  {
    risk: 16,
    why: 'reminders go out at any hour where the visitor is',
    file: 'worker/leads.js',
    find: 'if (hour < 9 || hour >= 11) continue;',
    replace: '',
  },
  {
    risk: 17,
    why: 'a spreadsheet cell can start with a formula',
    file: 'worker/admin.js',
    find: 'if (/^[=+\\-@\\t\\r]/.test(text)) text = `\'${text}`;',
    replace: '',
  },
  {
    risk: 18,
    why: 'the live check no longer notices the calendar is down',
    file: 'scripts/smoke-test.mjs',
    find: "const res = await get('/api/slots');\n      expectStatus(res, 200);",
    replace: "return 'skipped';",
  },
  {
    risk: 19,
    why: 'adding a column that another copy of the Worker just added fails',
    file: 'worker/db.js',
    find: 'if (!/duplicate column/i.test(String(err && err.message))) throw err;',
    replace: 'throw err;',
  },
  {
    risk: 20,
    why: 'the skip link goes nowhere',
    file: 'index.html',
    find: '<a class="skip-link" href="#main">',
    replace: '<a class="skip-link" href="#nowhere">',
  },
];
