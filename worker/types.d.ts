// Shared shapes for the Worker's JSDoc types: what Cloudflare hands it (Env)
// and the rows it keeps in the leads database. Only the type checker reads
// this file (`npm run typecheck`); nothing here runs. Cloudflare's own types
// (D1Database, RateLimit, ExecutionContext ...) come from
// @cloudflare/workers-types, which tsconfig.json loads.

type Outline = import('../outlines.js').Outline;
type AdPage = import('../outlines.js').AdPage;
type EvalCase = import('./eval-cases.js').EvalCase;

// Every binding, setting and secret the Worker reads (wrangler.jsonc and
// docs/SIGNUP-SETUP.md). All are optional: each part of /start switches on by
// itself once its account is connected, and the local test server has none of
// the outside services.
interface Env {
  // Bindings.
  DB?: D1Database;
  AI?: AiBinding;
  OUTLINE_LIMIT?: RateLimit;
  SAVE_LIMIT?: RateLimit;
  API_LIMIT?: RateLimit;
  ADMIN_LIMIT?: RateLimit;
  // Secrets.
  RESEND_API_KEY?: string;
  TURNSTILE_SECRET?: string;
  ADMIN_PASSWORD?: string;
  NTFY_TOPIC?: string;
  CAL_API_KEY?: string;
  // Settings.
  TURNSTILE_SITE_KEY?: string;
  CAL_LINK?: string;
  POSTAL_ADDRESS?: string;
  EMAIL_FROM?: string;
  REPLY_TO?: string;
  LEADS_TO?: string;
  OWNER_TZ?: string;
  SITE_URL?: string;
  AI_DAILY_LIMIT?: string | number;
}

// Env once the leads database is known to be there (db.js hasDatabase).
type EnvWithDB = Env & { DB: D1Database };

// The part of Workers AI the Worker uses: one text model, whose reply carries
// the answer in `response` (a string, or already-parsed JSON in JSON mode).
interface AiBinding {
  run(model: string, inputs: object): Promise<{ response?: unknown } | null | undefined>;
}

// What a route gets besides the request: only waitUntil is used, and the
// local test server passes a stand-in with just that.
interface WaitUntil {
  waitUntil(promise: Promise<unknown>): void;
}

// A route under /api/*: (request, env, ctx, url) => response.
type Route = (request: Request, env: Env, ctx: WaitUntil, url: URL) => Response | Promise<Response>;

// Where a visitor came from: the ad (?for=) and the ad platform (?utm_source=).
interface CameFrom {
  ad: string;
  src: string;
}

// The Cal.com event booking uses (config.js calEvent).
interface CalEvent {
  username: string;
  slug: string;
  link: string;
}

// A signed token's data (db.js sign/verify): what was signed, plus its purpose
// and when it was issued. The rest is checked where it's used.
interface TokenData {
  p: string;
  iat: number;
  [key: string]: unknown;
}

// A lead as saveRoute knows it: the columns it writes.
interface SavedLead extends CameFrom {
  id: string;
  outline_id: string;
  created_at: string;
  email: string;
  emailed_at: string | null;
  tz: string | null;
  problem: string;
  kind: string;
  source: string;
  // The outline, as JSON.
  outline: string;
  follow_up: number;
  sends: number;
}

// A whole row of the leads table (db.js SCHEMA).
interface LeadRow extends SavedLead {
  follow_up_sent_at: string | null;
  name: string | null;
  booked_at: string | null;
  booking_uid: string | null;
  booking_start: string | null;
}

// A row of the admin_log table (db.js): one change to the leads list.
interface AuditRow {
  at: string;
  action: string;
  lead: string | null;
}

// A row of the eval_runs table; `results` is JSON of CaseResult[].
interface EvalRunRow {
  id: number;
  version: string;
  model: string;
  started_at: string;
  finished_at: string | null;
  results: string;
}

// One eval case's result, as kept in eval_runs.results.
interface CaseResult {
  id: string;
  pass: boolean;
  outcome: string | null;
  kindMatch: boolean | null;
}

// The steps counted per ad each day (db.js count).
type CountStep = 'view' | 'outline' | 'save' | 'book';

// The eval's tally (eval.js summarize), each finished run's line in the
// report, and the report /api/eval and /admin show (eval.js evalReport).
interface EvalSummary {
  passed: number;
  total: number;
  rate: number;
  kindRight: number;
  kindTotal: number;
}
interface EvalRunSummary extends EvalSummary {
  version: string;
  model: string;
  current: boolean;
  finishedAt: string;
}
interface EvalReport {
  model: string;
  version: string;
  bar: number;
  cases: number;
  on: boolean;
  latest: (EvalRunSummary & { startedAt: string; results: (CaseResult & { expect: string | null })[] }) | null;
  running: { startedAt: string; done: number; total: number } | null;
  history: EvalRunSummary[];
}

// How one case went (eval.js judge and runCase).
interface CaseOutcome {
  outcome: string | null;
  pass: boolean;
  kindMatch: boolean | null;
  title: string | null;
}

// A daily service check's answer (health.js).
interface CheckResult {
  ok: boolean;
  note: string;
}

// The latest daily check (health.js healthReport).
interface HealthReport {
  checkedAt: string;
  services: Record<string, CheckResult>;
}

// An email for Resend: { subject, html, text } plus who it's from and to.
interface EmailContent {
  subject: string;
  html: string;
  text: string;
}
interface EmailMessage extends EmailContent {
  from: string;
  to: string[];
  reply_to: string;
  headers?: Record<string, string>;
}

// What Cal.com said to a booking (services.js bookCall): booked, the time was
// taken, or no clear answer.
type BookingResult =
  | { uid: string; start: string; taken?: undefined; uncertain?: undefined }
  | { taken: true; uid?: undefined; start?: undefined; uncertain?: undefined }
  | { uncertain: true; uid?: undefined; start?: undefined; taken?: undefined };
