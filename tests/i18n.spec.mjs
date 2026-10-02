// Browser checks for the translated pages (/es/, /ar/privacy, /zh/start...),
// which scripts/i18n.mjs generates from the English pages.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { LANGUAGES } from '../languages.js';
import { STRINGS } from '../worker/strings.js';

const TRANSLATED = LANGUAGES.filter(l => l.code !== 'en');
const PAGES = [
  { path: '', status: 200 },
  { path: 'privacy', status: 200 },
  { path: 'start', status: 200 },
  { path: 'no/such/page', status: 404 },
];
const WIDTHS = [375, 768, 900, 1440];
const words = code => JSON.parse(readFileSync(new URL(`../i18n/${code}.json`, import.meta.url), 'utf8'));

function watchForErrors(page) {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const isOwnDocument404 = /status of 404/.test(msg.text()) && msg.location().url === page.url();
    if (!isOwnDocument404) errors.push(`console: ${msg.text()} (${msg.location().url})`);
  });
  page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));
  page.on('response', res => {
    if (res.request().resourceType() !== 'document' && res.status() >= 400) errors.push(`HTTP ${res.status()}: ${res.url()}`);
  });
  return errors;
}

for (const lang of TRANSLATED) {
  for (const { path, status } of PAGES) {
    test(`/${lang.code}/${path} fits at every width, loads cleanly and is in ${lang.english}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      const errors = watchForErrors(page);
      const response = await page.goto(`/${lang.code}/${path}`, { waitUntil: 'networkidle' });
      expect(response.status()).toBe(status);
      await expect(page.locator('html')).toHaveAttribute('lang', lang.tag);
      await expect(page.locator('html')).toHaveAttribute('dir', lang.dir);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth, `wider than the viewport at ${width}px`).toBeLessThanOrEqual(clientWidth);
      }
      await expect(page.locator('header.site-header')).toHaveCount(1);
      await expect(page.locator('footer.site-footer')).toHaveCount(1);
      await expect(page.locator(`footer a[href="/${lang.code}/privacy"]`)).toHaveCount(1);
      // Says it's a translation, and links to the English.
      await expect(page.locator('.footer-note a[hreflang="en"]')).toHaveCount(1);
      // The skip link is translated (so the page isn't English with a new lang).
      await expect(page.locator('.skip-link')).toHaveText(words(lang.code)['Skip to content']);
      expect(errors).toEqual([]);
    });
  }
}

test('every page lists every language, linked to each other with hreflang and a canonical address of its own', async ({ page }) => {
  for (const path of ['', 'privacy', 'start']) {
    for (const lang of LANGUAGES) {
      const url = lang.code === 'en' ? `/${path}` : `/${lang.code}/${path}`;
      await page.goto(url);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://wright-ai-solutions.com${url}`);
      const alternates = await page.locator('link[rel="alternate"][hreflang]').evaluateAll(links => links.map(l => [l.hreflang, l.getAttribute('href')]));
      expect(alternates).toEqual([
        ...LANGUAGES.map(l => [l.tag, `https://wright-ai-solutions.com${l.code === 'en' ? '' : `/${l.code}`}/${path}`]),
        ['x-default', `https://wright-ai-solutions.com/${path}`],
      ]);
      const menu = await page.locator('.lang-list a').evaluateAll(links => links.map(l => [l.lang, l.getAttribute('href'), l.getAttribute('aria-current')]));
      expect(menu).toEqual(LANGUAGES.map(l => [l.tag, l.code === 'en' ? `/${path}` : `/${l.code}/${path}`, l.code === lang.code ? 'true' : null]));
    }
  }
});

test.describe('language menu', () => {
  test('opens, goes to the same page in another language, and closes with Escape or a click elsewhere', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/privacy');
    const menu = page.locator('.lang-menu');
    const toggle = menu.locator('summary');
    await expect(toggle).toHaveAttribute('aria-label', 'Language: English');
    await toggle.click();
    await expect(menu.locator('.lang-list')).toBeVisible();
    await expect(menu.locator('.lang-list a')).toHaveCount(LANGUAGES.length);
    // The list stays inside a phone's screen.
    const box = await menu.locator('.lang-list').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    await page.keyboard.press('Escape');
    await expect(menu.locator('.lang-list')).toBeHidden();
    await expect(toggle).toBeFocused();

    await toggle.click();
    await page.locator('footer.site-footer').click();
    await expect(menu.locator('.lang-list')).toBeHidden();

    await toggle.click();
    await menu.getByRole('link', { name: 'Español' }).click();
    await expect(page).toHaveURL(/\/es\/privacy$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('.lang-menu summary')).toHaveAttribute('aria-label', `${words('es').Language}: Español`);
  });

  test('works without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/fr/');
    await page.locator('.lang-menu summary').click();
    await page.locator('.lang-list').getByRole('link', { name: 'English' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await context.close();
  });
});

test('Arabic reads right to left: the logo is on the right and the menu opens leftward', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ar/');
  const logo = await page.locator('.logo').boundingBox();
  expect(logo.x).toBeGreaterThan(720);
  await page.locator('.lang-menu summary').click();
  const list = await page.locator('.lang-list').boundingBox();
  expect(list.x).toBeGreaterThanOrEqual(0);
});

test('a translated page links within its own language and keeps the shared files', async ({ page }) => {
  await page.goto('/pt/');
  const links = await page.locator('main a[href^="/"], header a[href^="/"]:not([hreflang])').evaluateAll(as => as.map(a => a.getAttribute('href')));
  expect(links.length).toBeGreaterThan(0);
  for (const href of links) expect(href, href).toMatch(/^\/pt\//);
  await expect(page.locator('link[rel="stylesheet"][href^="/styles.css?v="]')).toHaveCount(1);
  // The translated privacy notice says the English one applies.
  await page.goto('/pt/privacy');
  await expect(page.locator('.footer-note')).toContainText(words('pt')['If this translation and the English differ, the English version applies.']);
});

test('/es/start builds the outline in Spanish and sends the language with it', async ({ page }) => {
  const es = words('es');
  let posted = null;
  page.on('request', req => {
    if (req.url().endsWith('/api/outline')) posted = req.postDataJSON();
  });
  await page.goto('/es/start?for=leads');
  await expect(page.locator('#startEyebrow')).toHaveText(es['For businesses losing leads']);
  await expect(page.locator('#problem')).toHaveValue(es['Leads come in by text, web form or phone while we\'re busy or closed, and by the time someone replies they\'ve gone somewhere else.']);
  await page.locator('#outlineButton').click();
  await expect(page.locator('#outlineTitle')).toHaveText(STRINGS.es['An AI agent that answers your leads']);
  await expect(page.locator('#outlineDraft')).toHaveText(es['A first draft from what you wrote. We\'d sharpen it together on a call.']);
  await expect(page.locator('#outlineShipped a')).toHaveAttribute('href', '/es/#work');
  expect(posted).toMatchObject({ ad: 'leads', lang: 'es' });
});
