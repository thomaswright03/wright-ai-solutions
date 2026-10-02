// Checks for the ad-matched openings of /start (AD_PAGES in outlines.js) and for
// the ready-to-paste ad copy in docs/ADS.md that links to them.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { AD_PAGES, KINDS, pickKind } from '../outlines.js';

const SITE = 'https://wright-ai-solutions.com';
const ADS = readFileSync(new URL('../docs/ADS.md', import.meta.url), 'utf8');

// Each ad page's section starts at "## `<key>`" and runs to the next "## " heading.
function adSections(markdown) {
  const sections = {};
  for (const block of markdown.split(/^(?=## )/m)) {
    const key = block.match(/^## `([^`]+)`/)?.[1];
    if (key) sections[key] = block;
  }
  return sections;
}

// The "- " lines under "#### <heading>", up to the next heading.
function listUnder(section, heading) {
  const lines = section.split('\n');
  const start = lines.indexOf(`#### ${heading}`);
  if (start === -1) return [];
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('#')) break;
    if (line.startsWith('- ')) items.push(line.slice(2).trim());
  }
  return items;
}

const SECTIONS = adSections(ADS);
const copyFor = section => ({
  googleHeadlines: listUnder(section, 'Google headlines'),
  googleDescriptions: listUnder(section, 'Google descriptions'),
  metaPrimary: listUnder(section, 'Meta primary text'),
  metaHeadlines: listUnder(section, 'Meta headline'),
});

test.describe('ad-matched /start pages', () => {
  for (const [key, ad] of Object.entries(AD_PAGES)) {
    test(`/start?for=${key} opens on that ad's headline and example problem`, async ({ page }) => {
      await page.goto(`/start?for=${key}`);
      await expect(page.locator('#startTitle')).toHaveText(ad.title.join(''));
      await expect(page.locator('#startTitle .grad-text')).toHaveText(ad.title[1]);
      await expect(page.locator('#startEyebrow')).toHaveText(ad.eyebrow);
      await expect(page.locator('#startSub')).toHaveText(ad.sub);
      await expect(page.locator('#problemLabel')).toHaveText(ad.label);
      await expect(page.locator('#problem')).toHaveValue(ad.prefill);
    });
  }

  test('every ad page has the same fields, a lowercase key and an example that points to its own kind of work', () => {
    for (const [key, ad] of Object.entries(AD_PAGES)) {
      expect(key).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(Object.keys(ad).sort(), key).toEqual(['eyebrow', 'kind', 'label', 'prefill', 'sub', 'title']);
      expect(ad.title, key).toHaveLength(2);
      expect(KINDS, key).toContain(ad.kind);
      expect(pickKind(ad.prefill, ad.kind), key).toBe(ad.kind);
    }
  });
});

test.describe('ad copy in docs/ADS.md', () => {
  test('has a section for every ad page, and links only to ad pages that exist', () => {
    expect(Object.keys(SECTIONS).sort()).toEqual(Object.keys(AD_PAGES).sort());
    // "for=<key>" in the "Anywhere else" pattern is a placeholder, not a link.
    const linked = [...ADS.matchAll(/[?&]for=([^&\s`)]+)/g)].map(m => m[1]).filter(k => !k.startsWith('<'));
    for (const key of linked) expect(Object.keys(AD_PAGES), `for=${key}`).toContain(key);
    for (const key of Object.keys(AD_PAGES)) expect(linked, `a link with for=${key}`).toContain(key);
  });

  for (const key of Object.keys(AD_PAGES)) {
    test(`the ${key} ads link to their own page and fit each platform's limits`, () => {
      const section = SECTIONS[key];
      expect(section, `a "## \`${key}\`" section`).toBeDefined();
      expect(section).toContain(`Opens on: **${AD_PAGES[key].title.join('')}**`);
      expect(section).toContain(`${SITE}/start?for=${key}&utm_source=google&utm_medium=cpc&utm_campaign=${key}`);
      expect(section).toContain(`${SITE}/start?for=${key}&utm_source=meta&utm_medium=paid_social&utm_campaign=${key}`);

      const { googleHeadlines, googleDescriptions, metaPrimary, metaHeadlines } = copyFor(section);
      // A responsive search ad takes 3 to 15 headlines and 2 to 4 descriptions, none repeated.
      expect(googleHeadlines.length).toBeGreaterThanOrEqual(3);
      expect(googleHeadlines.length).toBeLessThanOrEqual(15);
      expect(googleDescriptions.length).toBeGreaterThanOrEqual(2);
      expect(googleDescriptions.length).toBeLessThanOrEqual(4);
      expect(new Set(googleHeadlines.map(h => h.toLowerCase())).size, 'repeated headline').toBe(googleHeadlines.length);
      expect(new Set(googleDescriptions.map(d => d.toLowerCase())).size, 'repeated description').toBe(googleDescriptions.length);
      expect(metaPrimary.length).toBeGreaterThanOrEqual(1);
      expect(metaHeadlines.length).toBeGreaterThanOrEqual(1);

      for (const text of googleHeadlines) {
        expect(text.length, text).toBeGreaterThanOrEqual(1);
        expect(text.length, text).toBeLessThanOrEqual(30);
      }
      for (const text of googleDescriptions) {
        expect(text.length, text).toBeGreaterThanOrEqual(1);
        expect(text.length, text).toBeLessThanOrEqual(90);
      }
      for (const text of metaPrimary) {
        expect(text.length, text).toBeGreaterThanOrEqual(1);
        expect(text.length, text).toBeLessThanOrEqual(125);
      }
      for (const text of metaHeadlines) {
        expect(text.length, text).toBeGreaterThanOrEqual(1);
        expect(text.length, text).toBeLessThanOrEqual(40);
      }
    });
  }

  test('the copy keeps to the editorial rules in the file', () => {
    for (const [key, section] of Object.entries(SECTIONS)) {
      const copy = copyFor(section);
      for (const text of copy.googleHeadlines) expect(text, `${key}: no "!" in a Google headline`).not.toContain('!');
      for (const text of Object.values(copy).flat()) {
        const where = `${key}: ${text}`;
        expect(text, where).not.toMatch(/([!?.,;:])\1/);
        expect((text.match(/\b[A-Z]{2,}\b/g) || []).filter(word => word !== 'AI'), `${where} (all-caps words)`).toEqual([]);
        // No figures, prices or phone numbers; the free 30-minute call is the one number allowed.
        expect(text.replace(/\b30-minute\b/gi, ''), where).not.toMatch(/\d/);
        expect(text, where).not.toMatch(/guarantee|\bbest\b|#1|number one|cheapest|limited|hurry|act now/i);
        expect(text, `${where} (plain ASCII dashes and quotes)`).not.toMatch(/[\u2013\u2014\u2018\u2019\u201c\u201d]/);
      }
    }
  });

  test('every URL is inside code, so the CI link checker leaves it alone', () => {
    const prose = ADS.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    expect(prose).not.toMatch(/https?:\/\//);
  });
});
