// Runs the sample problems in worker/eval-cases.js through the same model,
// prompt and checks the site uses for /start outlines, and reports how many
// come back the way they should. Run it before changing the prompt or the
// model in worker/outline.js, and again after, and compare. The site also
// runs these cases on itself every week (worker/eval.js, /api/eval).
//
//   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node scripts/eval-outlines.mjs
//
// The token needs only the "Workers AI: Read" permission. Each run uses about
// 30 outlines of the daily Workers AI allowance. Every case is scored two
// ways: as the site runs it, with the injection guard first, and by the model
// alone, so a weaker prompt can't hide behind the guard. Options:
//   --dry-run   check the cases and print the requests without calling the AI
//   --min=0.9   the pass rate, for both scores, below which it exits with an
//               error (default 0.9)
//   --out=FILE  also write the result as Markdown, e.g. docs/EVAL-RESULTS.md,
//               so it can be committed next to the prompt it measured
// In GitHub Actions the same Markdown goes to the run's summary page
// (.github/workflows/eval-outlines.yml).
import { appendFileSync, writeFileSync } from 'node:fs';
import { CODES } from '../languages.js';
import { KINDS, adFor } from '../outlines.js';
import { CASES, EVAL_BAR, judge, requestFor, runCase } from '../worker/eval.js';
import { MIN_PROBLEM, MODEL, cleanProblem, looksLikeInjection } from '../worker/outline.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const minArg = args.find(a => a.startsWith('--min='));
const minRate = minArg ? Number(minArg.slice(6)) : EVAL_BAR;
const outArg = args.find(a => a.startsWith('--out='));

// Throws, listing every problem, unless each case is one the site would accept
// with a known expectation, kind and ad.
export function checkCases(cases = CASES) {
  const problems = [];
  const ids = new Set();
  for (const c of cases) {
    if (!c.id || typeof c.problem !== 'string') problems.push(`${c.id || '?'}: needs an id and a problem`);
    else if (cleanProblem(c.problem).length < MIN_PROBLEM) problems.push(`${c.id}: too short for the site to accept`);
    if (ids.has(c.id)) problems.push(`${c.id}: used twice`);
    ids.add(c.id);
    if (!['usable', 'unusable'].includes(c.expect)) problems.push(`${c.id}: expect must be "usable" or "unusable"`);
    if (c.expect === 'usable' && looksLikeInjection(c.problem)) problems.push(`${c.id}: a real problem the injection guard would stop`);
    if (c.kind && !KINDS.includes(c.kind)) problems.push(`${c.id}: unknown kind "${c.kind}"`);
    if (c.ad && !adFor(c.ad)) problems.push(`${c.id}: unknown ad "${c.ad}"`);
    if (c.lang && !CODES.includes(c.lang)) problems.push(`${c.id}: unknown language "${c.lang}"`);
  }
  if (problems.length) throw new Error(`worker/eval-cases.js:\n  ${problems.join('\n  ')}`);
  return cases;
}

export { judge, requestFor, runCase };

async function runModel(request) {
  const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } = process.env;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(60000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || !body.success) throw new Error(`Workers AI answered ${response.status}: ${JSON.stringify(body?.errors || body).slice(0, 300)}`);
  return body.result && body.result.response;
}

async function main() {
  const cases = checkCases();
  if (dryRun) {
    for (const c of cases) console.log(`${c.id}${looksLikeInjection(c.problem) ? ' (stopped by the guard)' : ''}: ${JSON.stringify(c.problem).slice(0, 110)}`);
    console.log(`\n${cases.length} cases look fine (dry run, nothing sent).`);
    return;
  }
  if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
    console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Workers AI: Read), or use --dry-run.');
    process.exit(2);
  }
  console.log(`Model ${MODEL}, ${cases.length} cases. Each is scored as the site runs it (injection guard first) and by the model alone.\n`);
  const site = [];
  const alone = [];
  const rows = [];
  for (const c of cases) {
    let model;
    try {
      // The model is asked every case, including those the guard stops.
      model = await runCase(c, runModel, { guard: false });
    } catch (err) {
      model = { outcome: 'error', pass: false, kindMatch: null, title: String(err.message || err) };
    }
    const result = looksLikeInjection(c.problem) ? await runCase(c, runModel) : model;
    site.push(result);
    alone.push(model);
    const kindNote = r => (r.kindMatch === false ? ` (kind should be ${c.kind})` : '');
    const got = r => `${r.pass ? '' : 'FAIL '}${r.outcome}${kindNote(r)}`;
    rows.push(`| ${result.pass ? 'Pass' : '**Fail**'} | ${c.id} | ${c.expect} | ${result.outcome}${kindNote(result)} | ${model.pass ? '' : '**Fail** '}${model.outcome}${kindNote(model)} |`);
    console.log(`${result.pass ? 'PASS' : 'FAIL'}  ${c.id.padEnd(22)} expected ${c.expect.padEnd(8)} got ${result.outcome}${kindNote(result)}${result === model ? '' : `; the model alone: ${got(model)}`}${model.title ? `  "${model.title}"` : ''}`);
  }
  const score = results => {
    const passed = results.filter(r => r.pass).length;
    const kinds = results.filter(r => r.kindMatch !== null);
    return { passed, rate: passed / cases.length, kindRight: kinds.filter(r => r.kindMatch).length, kindTotal: kinds.length };
  };
  const ours = score(site);
  const model = score(alone);
  const pct = rate => `${Math.round(rate * 100)}%`;
  const ok = ours.rate >= minRate && model.rate >= minRate;
  const verdict = `${ok ? 'Passed' : 'Below the bar'}: ${ours.passed}/${cases.length} right as the site runs it (${pct(ours.rate)}), ${model.passed}/${cases.length} by the model alone (${pct(model.rate)}). Kind right on ${model.kindRight}/${model.kindTotal}.`;
  console.log(`\n${verdict}`);
  const markdown = [
    '# AI outline eval result',
    '',
    `Run ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC against \`${MODEL}\`, with the prompt and the injection guard in \`worker/outline.js\` and the cases in \`worker/eval-cases.js\`. "Site" is what a visitor gets: text the guard stops never reaches the model. "Model alone" asks the model every case, to test the prompt on its own.`,
    '',
    `**${verdict}** The bar is ${pct(minRate)} for both.`,
    '',
    '| Site | Case | Expected | Site got | Model alone got |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
  if (outArg) writeFileSync(outArg.slice(6), markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  if (!ok) {
    console.error(`Below the ${pct(minRate)} bar.`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
