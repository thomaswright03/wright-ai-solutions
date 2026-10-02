// Checks a running copy of the site the way visitors and the outside services
// meet it: the pages load with their security headers, the API answers, the
// calendar (Cal.com) gives open times, the AI eval result is published, and
// the private pages stay private. It only reads: nothing is saved, emailed or
// booked. Run by .github/workflows/deploy-check.yml after every deploy and
// each morning, and by tests/site.spec.mjs against the local server.
//
//   node scripts/smoke-test.mjs                                  # the live site
//   node scripts/smoke-test.mjs --base=http://localhost:4173     # tests/serve.mjs
//   node scripts/smoke-test.mjs --sha=<commit>                   # also checks /version.txt
const args = process.argv.slice(2);
const arg = name => (args.find(a => a.startsWith(`--${name}=`)) || '').slice(name.length + 3) || null;

const DAY = 24 * 60 * 60 * 1000;

// Every check, in order. Each returns a short note for the log, or throws.
export function checks(base, { sha = null, headers = {} } = {}) {
  const get = (path, init = {}) => fetch(new URL(path, base), { redirect: 'manual', ...init, headers: { ...headers, ...init.headers }, signal: AbortSignal.timeout(20000) });
  const expectStatus = (res, status) => {
    if (res.status !== status) throw new Error(`answered ${res.status}, expected ${status}`);
  };
  const jsonOf = async res => {
    if (!(res.headers.get('content-type') || '').includes('application/json')) throw new Error(`answered ${res.headers.get('content-type')}, not JSON`);
    return res.json();
  };
  let config = null;

  return [
    ['home page', async () => {
      const res = await get('/');
      expectStatus(res, 200);
      for (const header of ['content-security-policy', 'strict-transport-security', 'x-content-type-options']) {
        if (!res.headers.get(header)) throw new Error(`no ${header} header`);
      }
      if (!(await res.text()).includes('Wright AI Solutions')) throw new Error('page doesn\'t name the business');
      return 'loads, with its security headers';
    }],
    ['signup page', async () => {
      const res = await get('/start');
      expectStatus(res, 200);
      if (!(await res.text()).includes('start.js')) throw new Error('page doesn\'t load its script');
      return '/start loads';
    }],
    ['privacy notice', async () => {
      expectStatus(await get('/privacy'), 200);
      return '/privacy loads';
    }],
    ['missing page', async () => {
      expectStatus(await get(`/no-such-page-${Date.now()}`), 404);
      return 'an unknown address gets the 404 page';
    }],
    ['/api/config', async () => {
      const res = await get('/api/config');
      expectStatus(res, 200);
      config = await jsonOf(res);
      if (typeof config.save !== 'boolean' || typeof config.book !== 'boolean') throw new Error(`unexpected answer ${JSON.stringify(config)}`);
      return `saving ${config.save ? 'on' : 'off'}, booking ${config.book ? 'on' : 'off'}, bot check ${config.turnstile ? 'on' : 'off'}`;
    }],
    ['calendar (Cal.com)', async () => {
      if (!config || !config.book) return 'skipped: booking is off';
      const res = await get('/api/slots');
      expectStatus(res, 200);
      const { times } = await jsonOf(res);
      if (!Array.isArray(times) || !times.length) throw new Error('no open times in the next three weeks, so nobody can book from /start');
      const bad = times.find(t => !Number.isFinite(Date.parse(t)) || Date.parse(t) < Date.now() || Date.parse(t) > Date.now() + 60 * DAY);
      if (bad) throw new Error(`an open time that can't be right: ${bad}`);
      return `${times.length} open times, the first ${times[0]}`;
    }],
    ['AI outline eval', async () => {
      const res = await get('/api/eval');
      expectStatus(res, 200);
      const report = await jsonOf(res);
      if (typeof report.model !== 'string' || typeof report.bar !== 'number') throw new Error(`unexpected answer ${JSON.stringify(report).slice(0, 200)}`);
      const { latest, running } = report;
      if (latest && latest.current && latest.rate < report.bar) throw new Error(`the latest run is below the bar: ${latest.passed}/${latest.total}`);
      if (latest) return `${latest.passed}/${latest.total} on ${latest.finishedAt.slice(0, 10)}${latest.current ? '' : ' (an earlier prompt or model)'}${running ? `; a new run is ${running.done}/${running.total} done` : ''}`;
      return running ? `first run ${running.done}/${running.total} done` : `not run yet${report.on ? '' : ' (AI not connected)'}`;
    }],
    ['outline API', async () => {
      // A request from another site is turned away before any work is done.
      const res = await get('/api/outline', { method: 'POST', headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' }, body: '{}' });
      expectStatus(res, 403);
      return 'refuses other sites';
    }],
    ['leads list', async () => {
      const res = await get('/admin');
      if (![401, 404].includes(res.status)) throw new Error(`answered ${res.status} without a password`);
      return res.status === 401 ? 'asks for the password' : 'off';
    }],
    ['deployed commit', async () => {
      if (!sha) return 'skipped: no --sha given';
      const res = await get(`/version.txt?check=${Date.now()}`);
      expectStatus(res, 200);
      const live = (await res.text()).trim();
      if (live !== sha) throw new Error(`serves ${live || 'nothing'}, expected ${sha}`);
      return live.slice(0, 7);
    }],
  ];
}

export async function smokeTest(base, options) {
  const results = [];
  for (const [name, check] of checks(base, options)) {
    try {
      results.push({ name, ok: true, note: await check() });
    } catch (err) {
      results.push({ name, ok: false, note: String(err && err.message ? err.message : err) });
    }
  }
  return results;
}

async function main() {
  const base = arg('base') || 'https://wright-ai-solutions.com';
  const results = await smokeTest(base, { sha: arg('sha') });
  for (const { name, ok, note } of results) {
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}: ${note}`);
    if (!ok && process.env.GITHUB_ACTIONS) console.log(`::error title=Live check: ${name}::${note}`);
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${base}: ${results.length - failed} of ${results.length} checks passed.`);
  if (failed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
