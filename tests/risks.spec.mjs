// Checks the docs that map the business to tests: docs/RISKS.md (the top 20
// risks), docs/RULES.md (every business rule) and docs/FAILURES.md (every
// realistic failure). Every entry names at least one test, and every test and
// CI job named exists, so renaming or removing one fails here.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const RISKS = read('../docs/RISKS.md');

// "### N. Title" up to the next heading.
const risks = RISKS.split(/^(?=##)/m).filter(block => /^### \d+\. /.test(block));
// `file.spec.mjs: title` and `ci.yml: job` citations.
const cited = block => [...block.matchAll(/`([a-z]+\.spec\.mjs|ci\.yml): ([^`]+)`/g)].map(([, file, name]) => ({ file, name }));

test('docs/RISKS.md lists 20 risks, in order, each with a test that catches it', () => {
  expect(risks.map(block => Number(block.match(/^### (\d+)\./)[1]))).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  for (const block of risks) {
    const title = block.split('\n')[0];
    expect(cited(block).filter(c => c.file !== 'ci.yml').length, title).toBeGreaterThan(0);
  }
});

// docs/RULES.md and docs/FAILURES.md cite tests the same way.
for (const doc of ['RISKS', 'RULES', 'FAILURES']) {
  test(`every test and CI job docs/${doc}.md names exists`, () => {
    const text = read(`../docs/${doc}.md`);
    const sources = {};
    for (const { file, name } of cited(text)) {
      if (file === 'ci.yml') {
        sources[file] ||= read('../.github/workflows/ci.yml');
        expect(sources[file], `${file}: ${name}`).toMatch(new RegExp(`^  ${name}:$`, 'm'));
      } else {
        // Titles are written with \' in the test files.
        sources[file] ||= read(`./${file}`).replace(/\\'/g, '\'');
        expect(sources[file].includes(`test('${name}'`), `${file}: ${name}`).toBe(true);
      }
    }
  });
}

// Each rule and each failure names at least one test that checks it.
for (const doc of ['RULES', 'FAILURES']) {
  test(`every entry in docs/${doc}.md names a test`, () => {
    const entries = read(`../docs/${doc}.md`).split(/^(?=##)/m).filter(block => /^### \d+\. /.test(block));
    expect(entries.length).toBeGreaterThan(5);
    for (const block of entries) expect(cited(block).filter(c => c.file !== 'ci.yml').length, block.split('\n')[0]).toBeGreaterThan(0);
  });
}

// scripts/mutation-check.mjs breaks each risk's guard and runs that risk's
// tests; this keeps its list complete and pointed at code that still exists.
test('every risk has a deliberate break in tests/mutations.mjs, aimed at code that exists exactly once', async () => {
  const { MUTATIONS } = await import('./mutations.mjs');
  expect([...new Set(MUTATIONS.map(m => m.risk))].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  for (const m of MUTATIONS) {
    expect(read(`../${m.file}`).split(m.find).length - 1, `risk ${m.risk}: ${m.why}`).toBe(1);
  }
});
