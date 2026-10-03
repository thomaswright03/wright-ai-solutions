// Each business rule in docs/RULES.md checked right at its limit: one step
// inside it is allowed and one step past it is refused. The other tests show
// each rule working; these show the limit is exactly the one written down.
import { test, expect } from '@playwright/test';
import worker from '../worker/index.js';
import { ensureSchema } from '../worker/db.js';
import { templateOutline } from '../worker/outline.js';
import { FakeServices, fakeContext, withFakes } from './fakes.mjs';
import { basic, fakesWith, get, post, problem, rows, saveLead, send } from './helpers.mjs';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Runs `fn` with the clock moved `offset` ms from now.
async function at(offset, fn) {
  const realNow = Date.now;
  Date.now = () => realNow() + offset;
  try {
    return await fn();
  } finally {
    Date.now = realNow;
  }
}

async function insertLead(fakes, lead) {
  await ensureSchema(fakes.env.DB);
  const row = {
    id: `lead${Math.random().toString(36).slice(2, 12)}`, outline_id: Math.random().toString(36), email: 'pat@example.com', tz: 'America/Denver',
    problem, kind: 'leads', ad: 'leads', src: 'google', source: 'template', outline: JSON.stringify(templateOutline('leads')), follow_up: 1, sends: 1, booked_at: null,
    ...lead,
  };
  await fakes.env.DB.prepare(`INSERT INTO leads (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`).bind(...Object.values(row)).run();
  return row;
}

async function runHourly(fakes, now) {
  await withFakes(fakes, async () => {
    const ctx = fakeContext();
    await worker.scheduled({ scheduledTime: now }, fakes.env, ctx);
    await ctx.settle();
  });
}

test.describe('business rules at their limits', () => {
  test('an outline can be saved for 3 hours after it was written, and not after', async () => {
    const fakes = new FakeServices();
    const written = async offset => at(-offset, async () => (await (await send(fakes, post('/api/outline', { problem }))).json()).token);
    const fresh = await written(3 * HOUR - MINUTE);
    const stale = await written(3 * HOUR + MINUTE);
    expect((await send(fakes, post('/api/save', { token: fresh, email: 'in-time@example.com' }))).status).toBe(200);
    const late = await send(fakes, post('/api/save', { token: stale, email: 'too-late@example.com' }));
    expect(late.status).toBe(400);
    expect(await late.json()).toEqual({ error: 'expired' });
  });

  test('the call can be booked from the page for 12 hours after saving, and not after', async () => {
    const fakes = new FakeServices();
    const savedAgo = async offset => at(-offset, async () => (await saveLead(fakes, { email: `pat${offset}@example.com`, text: `${problem} ${offset}` })).saved.lead);
    const fresh = await savedAgo(12 * HOUR - MINUTE);
    const stale = await savedAgo(12 * HOUR + MINUTE);
    const { times } = await (await send(fakes, get('/api/slots'))).json();
    expect((await send(fakes, post('/api/book', { lead: fresh, start: times[0], name: 'Pat', timeZone: 'UTC' }))).status).toBe(200);
    const late = await send(fakes, post('/api/book', { lead: stale, start: times[1], name: 'Pat', timeZone: 'UTC' }));
    expect(late.status).toBe(400);
    expect(await late.json()).toEqual({ error: 'expired' });
  });

  test('a call can be booked up to 60 days ahead, never in the past', async () => {
    const fakes = new FakeServices();
    const tryAt = async start => {
      const { saved } = await saveLead(fakes, { email: `p${start}@example.com`, text: `${problem} ${start}` });
      const res = await send(fakes, post('/api/book', { lead: saved.lead, start: new Date(start).toISOString(), name: 'Pat', timeZone: 'UTC' }));
      return { status: res.status, body: await res.json() };
    };
    const now = Date.now();
    expect(await tryAt(now - MINUTE)).toEqual({ status: 400, body: { error: 'bad_time' } });
    expect(await tryAt(now + 60 * DAY + HOUR)).toEqual({ status: 400, body: { error: 'bad_time' } });
    // Inside the window the time goes to Cal.com, whose stand-in only has open
    // times for three weeks, so it answers that the time is taken.
    expect(await tryAt(now + 60 * DAY - HOUR)).toEqual({ status: 409, body: { error: 'taken' } });
  });

  test('open times start at least 30 minutes from now', async () => {
    const fakes = new FakeServices();
    const { times } = await (await send(fakes, get('/api/slots'))).json();
    expect(times.length).toBeGreaterThan(0);
    expect(Math.min(...times.map(t => Date.parse(t)))).toBeGreaterThanOrEqual(Date.now() + 30 * MINUTE - 5000);
  });

  test('a saved outline is emailed at most three times: once, then to two corrected addresses', async () => {
    const fakes = new FakeServices();
    const { outline } = await saveLead(fakes, { email: 'first@example.com' });
    for (const email of ['second@example.com', 'third@example.com']) {
      expect((await send(fakes, post('/api/save', { token: outline.token, email }))).status, email).toBe(200);
    }
    const fourth = await send(fakes, post('/api/save', { token: outline.token, email: 'fourth@example.com' }));
    expect(fourth.status).toBe(429);
    expect(await fourth.json()).toEqual({ error: 'too_many_sends' });
  });

  test('the reminder goes out from 9:00 to 10:59 where the visitor is, between 12 and 72 hours after saving', async () => {
    // Denver is UTC-6 in October.
    const day = Date.UTC(2026, 9, 7);
    const denver = (h, m = 0) => day + (h + 6) * HOUR + m * MINUTE;
    const sentAt = async (now, savedAgo) => {
      const fakes = new FakeServices();
      await insertLead(fakes, { created_at: new Date(now - savedAgo).toISOString() });
      await runHourly(fakes, now);
      return fakes.emails.length;
    };
    expect(await sentAt(denver(8, 59), 20 * HOUR)).toBe(0);
    expect(await sentAt(denver(9, 0), 20 * HOUR)).toBe(1);
    expect(await sentAt(denver(10, 59), 20 * HOUR)).toBe(1);
    expect(await sentAt(denver(11, 0), 20 * HOUR)).toBe(0);
    expect(await sentAt(denver(10), 12 * HOUR - MINUTE)).toBe(0);
    expect(await sentAt(denver(10), 12 * HOUR)).toBe(1);
    expect(await sentAt(denver(10), 72 * HOUR)).toBe(1);
    expect(await sentAt(denver(10), 72 * HOUR + MINUTE)).toBe(0);
  });

  test('a lead is kept for a year after it was saved, then deleted', async () => {
    const now = Date.UTC(2026, 9, 7, 3, 17);
    const fakes = fakesWith({ POSTAL_ADDRESS: '' });
    await insertLead(fakes, { email: 'kept@example.com', created_at: new Date(now - 365 * DAY + HOUR).toISOString() });
    await insertLead(fakes, { email: 'gone@example.com', created_at: new Date(now - 365 * DAY - HOUR).toISOString() });
    await runHourly(fakes, now);
    expect(await rows(fakes, 'SELECT email FROM leads')).toEqual([{ email: 'kept@example.com' }]);
  });

  test('the leads list opens only with a password of 16 characters or more', async () => {
    const short = 'x'.repeat(15);
    const long = 'x'.repeat(16);
    expect((await send(fakesWith({ ADMIN_PASSWORD: short }), get('/admin', basic(short)))).status).toBe(404);
    expect((await send(fakesWith({ ADMIN_PASSWORD: long }), get('/admin', basic(long)))).status).toBe(200);
  });
});
