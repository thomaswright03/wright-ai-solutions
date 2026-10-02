// What the Worker tests share: requests the way the site's pages send them,
// running one through the Worker with the stand-ins from fakes.mjs, and a few
// shortcuts (an outline saved the way the page does it, rows from the database,
// a password header). Used by worker.spec.mjs and rules.spec.mjs.
import worker from '../worker/index.js';
import { FakeServices, fakeContext, withFakes } from './fakes.mjs';

export const ORIGIN = 'https://wright-ai-solutions.com';
export const IP = '203.0.113.7';
export const GOOD = {
  usable: true,
  kind: 'leads',
  title: 'A missed-call text-back agent',
  build: 'I\'d build an agent that texts back every caller you miss and offers them a time to come in.',
  steps: ['A call goes unanswered.', 'The agent texts the caller back.', 'It offers open times.', 'Your team takes over when they reply.'],
  needs: ['Access to your phone system', 'Your booking rules', 'How you greet customers'],
  milestone: 'Texting back missed calls from one line while you watch every message.',
  questions: ['How many calls do you miss?', 'Who books appointments today?', 'What should it never say?'],
};
const { usable, ...outlineFields } = GOOD;
export const GOOD_OUTLINE = outlineFields;
export const problem = 'We miss calls at lunch and those people book somewhere else.';

function request(path, { method = 'POST', body, headers = {} } = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': IP, ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}
export const post = (path, body, headers) => request(path, { body, headers });
export const get = (path, headers) => request(path, { method: 'GET', headers });

// Runs one request through the Worker with these stand-ins, including the work
// it hands to waitUntil.
export async function send(fakes, req) {
  return withFakes(fakes, async () => {
    const ctx = fakeContext();
    const res = await worker.fetch(req, fakes.env, ctx);
    await ctx.settle();
    return res;
  });
}

// A stand-in for env.AI that records what it was asked and replies with `reply`.
export function fakeAI(reply) {
  const calls = [];
  return {
    calls,
    async run(model, input) {
      calls.push({ model, input });
      if (reply instanceof Error) throw reply;
      return { response: reply };
    },
  };
}

export const fakesWith = (env = {}, options = {}) => {
  const fakes = new FakeServices(options);
  Object.assign(fakes.env, env);
  return fakes;
};

// Gets an outline and saves it, the way the page does.
export async function saveLead(fakes, { email = 'pat@example.com', followUp = false, text = problem, ad = 'leads', src = 'google', timeZone = 'America/New_York' } = {}) {
  const outline = await (await send(fakes, post('/api/outline', { problem: text, ad, src }))).json();
  const res = await send(fakes, post('/api/save', { token: outline.token, email, followUp, timeZone }));
  return { outline, res, saved: await res.json() };
}

export const rows = async (fakes, sql, ...params) => (await fakes.env.DB.prepare(sql).bind(...params).all()).results;
export const basic = password => ({ Authorization: `Basic ${btoa(`thomas:${password}`)}` });
