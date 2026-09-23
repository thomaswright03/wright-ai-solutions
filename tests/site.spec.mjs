// Browser checks for the static site, run in CI against tests/serve.mjs.
import { test, expect } from '@playwright/test';

const PAGES = [
  { path: '/', status: 200 },
  { path: '/privacy', status: 200 },
  { path: '/privacy.html', status: 200 },
  { path: '/404.html', status: 200 },
  { path: '/no/such/page', status: 404 },
];
const WIDTHS = [375, 390, 768, 1440];
const THEMES = ['dark', 'light'];

// Collects console errors, uncaught exceptions and failed sub-requests for a page.
function watchForErrors(page) {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    // The 404 page's own document status is expected, not an error.
    const isOwnDocument404 = /status of 404/.test(msg.text()) && msg.location().url === page.url();
    if (!isOwnDocument404) errors.push(`console: ${msg.text()} (${msg.location().url})`);
  });
  page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));
  page.on('response', res => {
    if (res.request().resourceType() !== 'document' && res.status() >= 400) {
      errors.push(`HTTP ${res.status()}: ${res.url()}`);
    }
  });
  return errors;
}

for (const { path, status } of PAGES) {
  for (const colorScheme of THEMES) {
    for (const width of WIDTHS) {
      test(`${path} at ${width}px (${colorScheme}) fits, loads cleanly and has header and footer`, async ({ page }) => {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await page.setViewportSize({ width, height: 900 });
        const errors = watchForErrors(page);
        const response = await page.goto(path, { waitUntil: 'networkidle' });
        expect(response.status()).toBe(status);

        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth, 'page is wider than the viewport').toBeLessThanOrEqual(clientWidth);

        await expect(page.locator('header.site-header')).toHaveCount(1);
        await expect(page.locator('footer.site-footer')).toHaveCount(1);
        await expect(page.locator('main#main')).toHaveCount(1);
        await expect(page.locator('footer a[href="/privacy"]')).toHaveCount(1);
        expect(errors).toEqual([]);
      });
    }
  }
}

test('unknown routes get the custom 404 page', async ({ page }) => {
  const response = await page.goto('/definitely-not-a-page');
  expect(response.status()).toBe(404);
  await expect(page).toHaveTitle(/Page not found/);
});

test.describe('mobile menu', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('opens and closes by click, by Escape, and after following a link', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('#navToggle');
    const menu = page.locator('#navMobile');

    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(menu).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeHidden();
    await expect(toggle).toBeFocused();

    await toggle.click();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await menu.getByRole('link', { name: 'Work' }).click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeHidden();
  });
});

test('the first Tab reaches a skip link that jumps to the main content', async ({ page }) => {
  for (const path of ['/', '/privacy', '/404.html']) {
    await page.goto(path);
    await page.keyboard.press('Tab');
    const skip = page.locator('.skip-link');
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
  }
});

test.describe('theme', () => {
  const bg = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  test('follows the OS setting when nothing is saved', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    expect(await bg(page)).toBe('rgb(247, 247, 251)');
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await bg(page)).toBe('rgb(8, 8, 12)');
  });

  test('the toggle cycles system, light, dark and the choice survives a reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    const toggle = page.locator('#themeToggle');
    await expect(toggle).toHaveAttribute('data-choice', 'system');

    await toggle.click();
    await expect(toggle).toHaveAttribute('data-choice', 'light');
    expect(await bg(page)).toBe('rgb(247, 247, 251)');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(toggle).toHaveAttribute('data-choice', 'light');
    expect(await bg(page)).toBe('rgb(247, 247, 251)');

    await page.goto('/privacy');
    expect(await bg(page)).toBe('rgb(247, 247, 251)');

    await toggle.click();
    await expect(toggle).toHaveAttribute('data-choice', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await bg(page)).toBe('rgb(8, 8, 12)');

    await toggle.click();
    await expect(toggle).toHaveAttribute('data-choice', 'system');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();
    expect(await bg(page)).toBe('rgb(247, 247, 251)');
  });

  for (const colorScheme of THEMES) {
    test(`${colorScheme} palette keeps text at 4.5:1 contrast or better`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto('/');
      const tokens = await page.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        const names = ['bg', 'surface', 'surface-2', 'text', 'text-dim', 'text-dimmer',
          'accent-1', 'accent-2', 'accent-3', 'on-accent'];
        return Object.fromEntries(names.map(n => [n, css.getPropertyValue(`--${n}`).trim()]));
      });
      const lum = hex => {
        const [r, g, b] = hex.replace('#', '').match(/../g).map(h => parseInt(h, 16) / 255)
          .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const contrast = (a, b) => {
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      };
      const pairs = [];
      for (const fg of ['text', 'text-dim', 'text-dimmer', 'accent-2', 'accent-3']) {
        for (const back of ['bg', 'surface', 'surface-2']) pairs.push([fg, back]);
      }
      for (const back of ['accent-1', 'accent-2', 'accent-3']) pairs.push(['on-accent', back]);
      for (const [fg, back] of pairs) {
        expect(contrast(tokens[fg], tokens[back]), `--${fg} on --${back}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

test('home page headings never skip a level', async ({ page }) => {
  await page.goto('/');
  const levels = await page.locator('h1, h2, h3, h4, h5, h6').evaluateAll(els => els.map(e => Number(e.tagName[1])));
  expect(levels[0]).toBe(1);
  levels.slice(1).forEach((level, i) => expect(level - levels[i]).toBeLessThanOrEqual(1));
});

test('links that open a new tab say so to screen readers', async ({ page }) => {
  await page.goto('/');
  const names = await page.locator('a[target="_blank"]').allTextContents();
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) expect(name).toContain('opens in a new tab');
});

test('the logo link is a comfortable tap target', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  const box = await page.locator('.logo').boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test('the desktop "Start a Project" button is at least 44px tall', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const path of ['/', '/privacy', '/404.html']) {
    await page.goto(path);
    const box = await page.locator('.nav .nav-cta').boundingBox();
    expect(box.height, path).toBeGreaterThanOrEqual(44);
  }
});

test('email links in the privacy notice are at least 24px tall and do not overlap', async ({ page }) => {
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/privacy');
    const boxes = await page.locator('main a[href^="mailto:"]').evaluateAll(els =>
      els.map(e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; }));
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) expect(box.height, `mailto link at ${width}px`).toBeGreaterThanOrEqual(24);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(overlap, `mailto links ${i} and ${j} overlap at ${width}px`).toBe(false);
      }
    }
  }
});

test('every visible link and button on every page is at least 24px tall', async ({ page }) => {
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/privacy', '/404.html']) {
      await page.goto(path);
      const small = await page.locator('a, button').evaluateAll(els => els
        .filter(e => e.checkVisibility() && !e.classList.contains('skip-link'))
        .map(e => ({ text: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 40), height: e.getBoundingClientRect().height }))
        .filter(t => t.height < 24));
      expect(small, `${path} at ${width}px`).toEqual([]);
    }
  }
});

test('the AI card describes the agent without made-up figures', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.flow-mock');
  await expect(card).toBeVisible();
  expect(await card.innerText()).not.toMatch(/\d/);
  await expect(page.locator('body')).not.toContainText(/sample data/i);
});

test('if copying fails, the contact hint shows the address to copy by hand', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });
  await page.goto('/');
  await page.evaluate(() => document.addEventListener('click', e => e.preventDefault(), true));
  await page.locator('.contact-links a[href^="mailto:"]').click();
  await expect(page.locator('#contactHint')).toHaveText('Copy this: t@thomasewright.com');
});
