// Runs the sample problems in scripts/outline-eval.json through the same model,
// prompt and checks the site uses for /start outlines, and reports how many
// come back the way they should. Run it before changing the prompt or the
// model in worker/outline.js, and again after, and compare.
//
//   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node scripts/eval-outlines.mjs
//
// The token needs only the "Workers AI: Read" permission. Each run uses about
// 25 outlines of the daily Workers AI allowance. Options:
//   --dry-run   check the cases and print the requests without calling the AI
//   --min=0.9   the pass rate below which it exits with an error (default 0.9)
import { readFileSync } from 'node:fs';
import { KINDS, adFor } from '../outlines.js';
import { MIN_PROBLEM, MODEL, cleanProblem, outlineRequest, rejectionReason, validateOutline } from '../worker/outline.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const minArg = args.find(a => a.startsWith('--min='));
const minRate = minArg ? Number(minArg.slice(6)) : 0.9;

export function loadCases(file = new URL('./outline-eval.json', import.meta.url)) {
  const { cases } = JSON.parse(readFileSync(file, 'utf8'));
  const problems = [];
  for (const c of cases) {
    if (!c.id || typeof c.problem !== 'string') problems.push(`${c.id || '?'}: needs an id and a problem`);
    else if (cleanProblem(c.problem).length < MIN_PROBLEM) problems.push(`${c.id}: too short for the site to accept`);
    if (!['usable', 'unusable'].includes(c.expect)) problems.push(`${c.id}: expect must be "usable" or "unusable"`);
    if (c.kind && !KINDS.includes(c.kind)) problems.push(`${c.id}: unknown kind "${c.kind}"`);
    if (c.ad && !adFor(c.ad)) problems.push(`${c.id}: unknown ad "${c.ad}"`);
  }
  if (problems.length) throw new Error(`outline-eval.json:\n  ${problems.join('\n  ')}`);
  return cases;
}

// The request for one case, exactly as /api/outline would send it.
export const requestFor = c => outlineRequest(cleanProblem(c.problem), c.ad ? adFor(c.ad).kind : null);

// Whether the model's reply is right for the case: an outline that passes the
// site's checks for a usable case, and a "usable": false for an unusable one.
// Kind is reported but not required; a usable outline of another kind still
// helps the visitor.
export function judge(c, raw) {
  const outline = validateOutline(raw);
  const outcome = outline ? 'ai' : rejectionReason(raw);
  const pass = c.expect === 'usable' ? Boolean(outline) : outcome === 'unusable';
  const kindMatch = c.kind && outline ? outline.kind === c.kind : null;
  return { outcome, pass, kindMatch, title: outline ? outline.title : null };
}

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
  const cases = loadCases();
  if (dryRun) {
    for (const c of cases) console.log(`${c.id}: ${JSON.stringify(requestFor(c).messages[1].content).slice(0, 120)}`);
    console.log(`\n${cases.length} cases look fine (dry run, nothing sent).`);
    return;
  }
  if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
    console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Workers AI: Read), or use --dry-run.');
    process.exit(2);
  }
  console.log(`Model ${MODEL}, ${cases.length} cases\n`);
  let passed = 0;
  let kinds = 0;
  let kindTotal = 0;
  for (const c of cases) {
    let result;
    try {
      result = judge(c, await runModel(requestFor(c)));
    } catch (err) {
      result = { outcome: 'error', pass: false, kindMatch: null, title: String(err.message || err) };
    }
    if (result.pass) passed += 1;
    if (result.kindMatch !== null) {
      kindTotal += 1;
      if (result.kindMatch) kinds += 1;
    }
    const kindNote = result.kindMatch === false ? ` (kind should be ${c.kind})` : '';
    console.log(`${result.pass ? 'PASS' : 'FAIL'}  ${c.id.padEnd(22)} expected ${c.expect.padEnd(8)} got ${result.outcome}${kindNote}${result.title ? `  "${result.title}"` : ''}`);
  }
  const rate = passed / cases.length;
  console.log(`\n${passed}/${cases.length} passed (${Math.round(rate * 100)}%). Kind right on ${kinds}/${kindTotal}.`);
  if (rate < minRate) {
    console.error(`Below the ${Math.round(minRate * 100)}% bar.`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
