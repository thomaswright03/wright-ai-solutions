// Adds AI outline eval results to eval-history.csv, the dated record of every
// run kept in the repository on the `eval-results` branch, so the track record
// lives in git as well as in the site's database. Run by
// scripts/push-eval-record.sh, from .github/workflows/eval-outlines.yml (each
// GitHub run) and .github/workflows/eval-history.yml (the site's own runs,
// read from /api/eval once a day).
//
//   node scripts/record-eval.mjs --csv=eval-history.csv --result=eval-result.json
//   node scripts/record-eval.mjs --csv=eval-history.csv --site=https://wright-ai-solutions.com
//
// A run already in the file isn't added again. A run that scores lower than
// the one before it from the same source is flagged on the run's summary page;
// the site also sends Thomas a phone alert for its own runs (worker/eval.js).
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

export const COLUMNS = ['finished_at', 'source', 'ref', 'model', 'version', 'passed', 'total', 'kind_right', 'kind_total', 'model_alone_passed', 'failed'];

const cell = value => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function parseCsv(text) {
  const rows = [];
  for (const line of text.split('\n').filter(Boolean)) {
    const fields = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { fields.push(field); field = ''; } else field += c;
    }
    fields.push(field);
    rows.push(fields);
  }
  const [header, ...body] = rows;
  return header ? body.map(fields => Object.fromEntries(header.map((name, i) => [name, fields[i] ?? '']))) : [];
}

// The rows to add for the site's runs, from its /api/eval report.
export function siteRows(report) {
  return [...(report.history || [])].reverse().map(run => ({
    finished_at: run.finishedAt,
    source: 'site',
    ref: '',
    model: run.model,
    version: run.version,
    passed: run.passed,
    total: run.total,
    kind_right: run.kindRight,
    kind_total: run.kindTotal,
    model_alone_passed: '',
    // Only the latest run's cases are published.
    failed: report.latest && report.latest.finishedAt === run.finishedAt ? report.latest.results.filter(r => !r.pass).map(r => r.id).join(' ') : '',
  }));
}

// Adds the rows not already in `existing`; answers the rows added and, for
// each, whether it scored lower than the previous run from its source.
export function addRows(existing, incoming) {
  const seen = new Set(existing.map(r => `${r.source} ${r.finished_at}`));
  const added = [];
  const all = [...existing];
  for (const row of incoming) {
    const key = `${row.source} ${row.finished_at}`;
    if (!row.finished_at || seen.has(key)) continue;
    seen.add(key);
    const before = [...all].reverse().find(r => r.source === row.source && (!row.model || !r.model || r.model === row.model));
    const rate = r => Number(r.passed) / Number(r.total);
    added.push({ row, dropped: Boolean(before && rate(row) < rate(before)), before });
    all.push(row);
  }
  return added;
}

async function main() {
  const arg = name => (process.argv.slice(2).find(a => a.startsWith(`--${name}=`)) || '').slice(name.length + 3) || null;
  const csv = arg('csv');
  if (!csv || (!arg('result') && !arg('site'))) {
    console.error('Usage: node scripts/record-eval.mjs --csv=FILE (--result=eval-result.json | --site=URL)');
    process.exit(2);
  }
  let incoming;
  if (arg('result')) {
    incoming = [{ source: 'github', ...JSON.parse(readFileSync(arg('result'), 'utf8')) }];
  } else {
    const response = await fetch(new URL('/api/eval', arg('site')), { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`/api/eval answered ${response.status}`);
    incoming = siteRows(await response.json());
  }
  const existing = existsSync(csv) ? parseCsv(readFileSync(csv, 'utf8')) : [];
  if (!existsSync(csv)) writeFileSync(csv, `${COLUMNS.join(',')}\n`);
  const added = addRows(existing, incoming);
  for (const { row, dropped, before } of added) {
    appendFileSync(csv, `${COLUMNS.map(name => cell(row[name])).join(',')}\n`);
    console.log(`Recorded the ${row.source} run of ${row.finished_at}: ${row.passed}/${row.total}.`);
    if (dropped) {
      const note = `The ${row.source} run of ${row.finished_at} got ${row.passed}/${row.total}, down from ${before.passed}/${before.total} on ${before.finished_at}.`;
      console.log(`::warning title=AI eval dropped::${note}`);
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n**AI eval dropped.** ${note}\n`);
    }
  }
  if (!added.length) console.log('Nothing new to record.');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
