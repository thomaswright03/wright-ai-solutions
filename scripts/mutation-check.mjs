// Proves the tests docs/RISKS.md names would actually catch each risk. For
// every entry in tests/mutations.mjs it copies the repo, breaks the one
// behaviour that guards that risk, and runs only that risk's tests from
// docs/RISKS.md. A break the tests don't notice ("survived") fails the check,
// and so does an entry whose code can't be found. The repo itself is never
// changed.
//
//   node scripts/mutation-check.mjs            every risk
//   node scripts/mutation-check.mjs --risk=7   one risk
//
// Needs the same setup as `npm test` (Playwright's Chromium). Set
// PW_CHROMIUM_PATH as for the tests to use a preinstalled browser.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MUTATIONS } from '../tests/mutations.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const only = Number((process.argv.find(a => a.startsWith('--risk=')) || '').slice(7)) || null;

// "### N. Title" blocks of docs/RISKS.md, and the `file.spec.mjs: title` tests each names.
const risksDoc = readFileSync(join(root, 'docs/RISKS.md'), 'utf8');
const testsFor = number => {
  const block = risksDoc.split(/^(?=##)/m).find(b => b.startsWith(`### ${number}. `));
  if (!block) return [];
  return [...block.matchAll(/`([a-z]+\.spec\.mjs): ([^`]+)`/g)].map(([, file, title]) => ({ file, title }));
};
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A copy of the tracked files, sharing node_modules.
function copyRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'mutation-'));
  const files = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).stdout.split('\0').filter(Boolean);
  for (const file of files) cpSync(join(root, file), join(dir, file), { recursive: true });
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
}

const results = [];
let port = 4600;
for (const m of MUTATIONS.filter(x => !only || x.risk === only)) {
  const tests = testsFor(m.risk);
  const label = `Risk ${m.risk}: ${m.why}`;
  if (!tests.length) {
    results.push({ ...m, outcome: 'no tests', detail: 'docs/RISKS.md names no test for this risk' });
    continue;
  }
  const dir = copyRepo();
  try {
    const path = join(dir, m.file);
    const source = readFileSync(path, 'utf8');
    const found = source.split(m.find).length - 1;
    if (found !== 1) {
      results.push({ ...m, outcome: 'not found', detail: `the code to break appears ${found} times in ${m.file}; update tests/mutations.mjs` });
      continue;
    }
    writeFileSync(path, source.replace(m.find, () => m.replace));
    const files = [...new Set(tests.map(t => `tests/${t.file}`))];
    const grep = tests.map(t => escapeRegex(t.title)).join('|');
    port += 1;
    const run = spawnSync('npx', ['playwright', 'test', ...files, '--grep', grep, '--reporter=dot', '--retries=0', '--max-failures=1'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, PORT: String(port), CI: '1' },
      timeout: 10 * 60 * 1000,
    });
    const ran = /(\d+) (?:passed|failed)/.test(run.stdout);
    let outcome;
    if (run.status === 0) outcome = 'survived';
    else if (ran && /failed/.test(run.stdout)) outcome = 'caught';
    else outcome = 'error';
    results.push({ ...m, outcome, detail: outcome === 'error' ? (run.stdout + run.stderr).slice(-800) : `${tests.length} named test(s)` });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const last = results[results.length - 1];
  console.log(`${last.outcome === 'caught' ? 'caught  ' : last.outcome.toUpperCase().padEnd(8)} ${label}`);
  if (last.outcome === 'error') console.log(last.detail);
}

const caught = results.filter(r => r.outcome === 'caught').length;
const summary = [
  `# Risk mutation check: ${caught} of ${results.length} breaks caught`,
  '',
  'Each row breaks the behaviour that guards one risk in `docs/RISKS.md`, then runs only the tests that risk names. "Caught" means at least one of them failed, as it should.',
  '',
  '| Risk | The break | Result |',
  '|---:|---|---|',
  ...results.map(r => `| ${r.risk} | ${r.why} (\`${r.file}\`) | ${r.outcome === 'caught' ? 'caught' : `**${r.outcome}**: ${String(r.detail).split('\n')[0]}`} |`),
].join('\n');
console.log(`\n${caught} of ${results.length} breaks caught.`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
process.exit(caught === results.length ? 0 : 1);
