// Stand-ins for everything worker/ talks to, so the tests and the local preview
// run the real Worker code with no accounts and no network:
//   - a D1 database backed by Node's built-in SQLite, in memory
//   - Resend, Cal.com, ntfy and Turnstile, answered from memory by a patched
//     global fetch that records what was sent
// Each FakeServices has its own database and outbox. withFakes() picks which
// one the Worker's outgoing requests go to, for everything the call awaits.
import { AsyncLocalStorage } from 'node:async_hooks';

// Node 22.13 and later have SQLite built in. On an older Node the stand-ins
// run without a database, so the page behaves as if saving isn't set up yet.
// Node flags it as experimental; that one warning is dropped as noise.
const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => (/SQLite/.test(String(warning)) ? undefined : emitWarning.call(process, warning, ...rest));
const sqlite = await import('node:sqlite').catch(() => null);
process.emitWarning = emitWarning;
export const hasDatabase = Boolean(sqlite);

class FakeStatement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new FakeStatement(this.db, this.sql, params.map(v => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v)));
  }

  firstSync(column) {
    const row = this.db.prepare(this.sql).get(...this.params);
    if (!row) return null;
    const plain = { ...row };
    return column ? (plain[column] ?? null) : plain;
  }

  allSync() {
    return { success: true, results: this.db.prepare(this.sql).all(...this.params).map(r => ({ ...r })), meta: {} };
  }

  runSync() {
    const info = this.db.prepare(this.sql).run(...this.params);
    return { success: true, results: [], meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }

  async first(column) { return this.firstSync(column); }
  async all() { return this.allSync(); }
  async run() { return this.runSync(); }
}

// The parts of Cloudflare D1's API the Worker uses: prepare/bind/first/all/run and batch.
export class FakeD1 {
  constructor() {
    this.db = new sqlite.DatabaseSync(':memory:');
  }

  prepare(sql) {
    return new FakeStatement(this.db, sql);
  }

  async batch(statements) {
    this.db.exec('BEGIN');
    try {
      const results = statements.map(s => (/^\s*(select|with)\b/i.test(s.sql) ? s.allSync() : s.runSync()));
      this.db.exec('COMMIT');
      return results;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}

const DAY = 24 * 60 * 60 * 1000;
// Open times in the fake calendar: weekdays at these UTC hours (9am to 4pm in
// Utah for most of the year).
const OPEN_UTC = [[15, 0], [15, 30], [16, 30], [17, 0], [19, 0], [20, 0], [21, 30], [22, 0]];

export class FakeServices {
  // options: { turnstile, calDown, calLost, calSilent, emailDown, bare }.
  // calLost: Cal.com books the first call but the reply never arrives, the way
  // a dropped connection or a timeout looks. calSilent: the first booking
  // request is lost the same way, but before Cal.com booked anything.
  constructor(options = {}) {
    this.options = options;
    this.emails = [];
    this.alerts = [];
    this.bookings = [];
    this.botChecks = [];
    this.env = options.bare ? {} : {
      ...(hasDatabase ? { DB: new FakeD1() } : {}),
      RESEND_API_KEY: 're_test_key',
      CAL_LINK: 'https://cal.com/demo/intro-call',
      NTFY_TOPIC: 'demo-topic',
      POSTAL_ADDRESS: '123 Example Street, Salt Lake City, UT 84101',
      ADMIN_PASSWORD: 'local-demo-password',
      ...(options.turnstile ? { TURNSTILE_SITE_KEY: '1x00000000000000000000AA', TURNSTILE_SECRET: 'test-turnstile-secret' } : {}),
    };
  }

  openTimes(from = Date.now(), to = from + 21 * DAY) {
    const times = [];
    const day = new Date(from);
    day.setUTCHours(0, 0, 0, 0);
    for (let t = day.getTime(); t < to; t += DAY) {
      const d = new Date(t);
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
      for (const [h, m] of OPEN_UTC) {
        const slot = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m);
        if (slot >= from && slot < to && !this.bookings.some(b => Date.parse(b.start) === slot)) times.push(new Date(slot).toISOString());
      }
    }
    return times;
  }

  async handle(url, init = {}) {
    const headers = new Headers(init.headers);
    const body = typeof init.body === 'string' ? init.body : init.body ? String(init.body) : '';
    const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

    if (url.host === 'api.resend.com') {
      if (this.options.emailDown) return reply(500, { message: 'down' });
      const key = headers.get('Idempotency-Key');
      const earlier = key && this.emails.find(e => e.idempotencyKey === key);
      if (earlier) return reply(200, { id: earlier.id });
      const email = { id: `email_${this.emails.length + 1}`, idempotencyKey: key, auth: headers.get('Authorization'), ...JSON.parse(body) };
      this.emails.push(email);
      return reply(200, { id: email.id });
    }

    if (url.host === 'ntfy.sh') {
      this.alerts.push({ topic: decodeURIComponent(url.pathname.slice(1)), title: headers.get('Title'), click: headers.get('Click'), body });
      return reply(200, { id: 'alert' });
    }

    if (url.host === 'challenges.cloudflare.com' && url.pathname === '/turnstile/v0/siteverify') {
      const form = new URLSearchParams(body);
      this.botChecks.push({ response: form.get('response'), secret: form.get('secret'), remoteip: form.get('remoteip') });
      return reply(200, { success: form.get('response') === 'pass-token' && form.get('secret') === this.env.TURNSTILE_SECRET });
    }

    if (url.host === 'api.cal.com') {
      if (this.options.calDown) return reply(503, { status: 'error' });
      if (url.pathname === '/v2/slots') {
        const data = {};
        for (const start of this.openTimes(Date.parse(url.searchParams.get('start')), Date.parse(url.searchParams.get('end')))) {
          (data[start.slice(0, 10)] ||= []).push({ start });
        }
        return reply(200, { status: 'success', data });
      }
      if (url.pathname === '/v2/bookings' && init.method === 'POST') {
        if (this.options.calSilent && !this.silentOne) {
          this.silentOne = true;
          throw new TypeError('Network connection lost.');
        }
        const request = JSON.parse(body);
        const start = Date.parse(request.start);
        if (!this.openTimes(start, start + 1).length) {
          return reply(400, { status: 'error', error: { code: 'BadRequestException', message: 'User either already has booking at this time or is not available' } });
        }
        const booking = { uid: `booking_${this.bookings.length + 1}`, start: new Date(start).toISOString(), end: new Date(start + 30 * 60 * 1000).toISOString(), ...request };
        this.bookings.push(booking);
        if (this.options.calLost && !this.lostOne) {
          this.lostOne = true;
          throw new TypeError('Network connection lost.');
        }
        return reply(201, { status: 'success', data: { uid: booking.uid, start: booking.start, end: booking.end } });
      }
      // Listing bookings needs an API key, as on Cal.com.
      if (url.pathname === '/v2/bookings' && (init.method || 'GET') === 'GET') {
        if (!headers.get('Authorization')) return reply(401, { status: 'error' });
        const email = (url.searchParams.get('attendeeEmail') || '').toLowerCase();
        const data = this.bookings
          .filter(b => b.attendee.email.toLowerCase() === email)
          .map(b => ({ uid: b.uid, start: b.start, end: b.end, status: 'accepted', attendees: [{ name: b.attendee.name, email: b.attendee.email }] }));
        return reply(200, { status: 'success', data });
      }
    }
    return reply(404, { error: 'not faked' });
  }
}

const FAKE_HOSTS = new Set(['api.resend.com', 'ntfy.sh', 'api.cal.com', 'challenges.cloudflare.com']);
const current = new AsyncLocalStorage();
const realFetch = globalThis.fetch;

// Once per process: outside services go to the active FakeServices, and never
// to the real ones.
if (!globalThis.fetch.isFake) {
  const fakeFetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (!FAKE_HOSTS.has(url.host)) return realFetch(input, init);
    const fakes = current.getStore();
    if (!fakes) throw new Error(`Refusing to call ${url.host} outside a fake`);
    return fakes.handle(url, init);
  };
  fakeFetch.isFake = true;
  globalThis.fetch = fakeFetch;
}

export const withFakes = (fakes, fn) => current.run(fakes, fn);

// A ctx whose waitUntil work can be awaited, for tests that check what
// happened after the response.
export function fakeContext() {
  const pending = [];
  return { pending, waitUntil: p => pending.push(Promise.resolve(p).catch(() => {})), settle: () => Promise.all(pending) };
}
