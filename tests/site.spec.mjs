// Browser checks for the static site, run in CI against tests/serve.mjs.
import { test, expect } from '@playwright/test';

const PAGES = [
  { path: '/', status: 200 },
  { path: '/privacy', status: 200 },
  { path: '/privacy.html', status: 200 },
  { path: '/404.html', status: 200 },
  { path: '/start', status: 200 },
  { path: '/start?for=leads', status: 200 },
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
  for (const path of ['/', '/privacy', '/404.html', '/start']) {
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

test('email links in the privacy notice are at least 44px tall to tap and do not overlap', async ({ page }) => {
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/privacy');
    const boxes = await page.locator('main a[href^="mailto:"]').evaluateAll(els =>
      els.map(e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; }));
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) expect(box.height, `mailto link at ${width}px`).toBeGreaterThanOrEqual(44);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(overlap, `mailto links ${i} and ${j} overlap at ${width}px`).toBe(false);
      }
    }
  }
});

test('the privacy link under the outline button on /start is at least 44px tall to tap, without spacing the text out', async ({ page }) => {
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/start');
    const link = page.locator('.start-fineprint a');
    expect((await link.boundingBox()).height, `${width}px`).toBeGreaterThanOrEqual(44);
    // Still an inline link: the paragraph's lines keep their normal height.
    expect(await link.evaluate(e => getComputedStyle(e).display)).toBe('inline');
  }
});

test('every visible link and button on every page is at least 24px tall', async ({ page }) => {
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/privacy', '/404.html', '/start']) {
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

test('the CSP blocks the Cloudflare Web Analytics beacon, as the privacy notice says', async ({ page, request }) => {
  const csp = (await request.get('/')).headers()['content-security-policy'];
  expect(csp).toMatch(/script-src 'self'(;|$)/);
  expect(csp).not.toContain('cloudflareinsights');
  await page.goto('/privacy');
  await expect(page.locator('main')).toContainText('the site\'s security policy blocks it');
});

test('every response carries the security headers from _headers', async ({ request }) => {
  for (const path of ['/', '/privacy', '/start', '/no/such/page', '/styles.css?v=0']) {
    const res = await request.get(path);
    const headers = res.headers();
    expect(headers['strict-transport-security'], path).toMatch(/max-age=31536000/);
    expect(headers['content-security-policy'], path).toContain("default-src 'self'");
    expect(headers['x-content-type-options'], path).toBe('nosniff');
    expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
  }
});

test('only /start may load Cloudflare\'s bot check, and nothing else from other sites', async ({ request }) => {
  const policy = async path => (await request.get(path)).headers()['content-security-policy'];
  const start = await policy('/start?for=leads');
  expect(start).toContain("script-src 'self' https://challenges.cloudflare.com;");
  expect(start).toContain('frame-src https://challenges.cloudflare.com;');
  expect(start).not.toContain('cloudflareinsights');
  for (const path of ['/', '/privacy', '/no/such/page']) {
    expect(await policy(path), path).toMatch(/script-src 'self';/);
    expect(await policy(path), path).not.toContain('challenges.cloudflare.com');
  }
});

test('only /start may use the microphone', async ({ request }) => {
  const policy = async path => (await request.get(path)).headers()['permissions-policy'];
  expect(await policy('/start?for=leads')).toBe('camera=(), microphone=(self), geolocation=(), interest-cohort=()');
  for (const path of ['/', '/privacy', '/no/such/page']) {
    expect(await policy(path), path).toBe('camera=(), microphone=(), geolocation=(), interest-cohort=()');
  }
});

test.describe('signup flow on /start', () => {
  // Each test gets its own stand-in services on the test server (tests/serve.mjs),
  // so saved leads and booked times don't leak between tests. Flags such as
  // 'bare' or 'caldown' change how they behave.
  async function useServices(page, ...flags) {
    const { testId, retry } = test.info();
    const letters = [...`${testId}${retry}`].filter(c => /[0-9a-f]/.test(c)).map(c => 'abcdefghijklmnop'[parseInt(c, 16)]);
    const mode = [`t${letters.join('').slice(0, 30)}`, ...flags].join('+');
    await page.setExtraHTTPHeaders({ 'x-test-env': mode });
    return {
      mode,
      state: async () => (await page.request.get(`/__test/state?mode=${encodeURIComponent(mode)}`)).json(),
    };
  }

  // Every request the page makes that isn't for a file on this site: its calls
  // to this site's /api, with what they sent, and anything sent anywhere else.
  function watchRequests(page) {
    const calls = [];
    const host = new URL(test.info().project.use.baseURL).host;
    page.on('request', req => {
      const url = new URL(req.url());
      if (url.host === host && url.pathname.startsWith('/api/')) {
        calls.push({ call: `${req.method()} ${url.pathname}`, body: req.method() === 'POST' ? req.postDataJSON() : null });
      } else if (url.host !== host || req.method() !== 'GET') {
        calls.push({ call: `${req.method()} ${req.url()}`, body: null });
      }
    });
    return calls;
  }

  const buildOutline = page => page.getByRole('button', { name: /Build my outline/ }).click();

  // A stand-in for Cloudflare's Turnstile script. It answers at once with this
  // token, or with { interactive: true } waits for the test to call
  // window.tickTheBox(), the way a visitor ticks the box. The server's check
  // (tests/fakes.mjs) passes only 'pass-token'.
  const fakeTurnstile = (token, { interactive = false } = {}) => `window.turnstile = {
    render(element, options) {
      window.turnstileOptions = { sitekey: options.sitekey, action: options.action, appearance: options.appearance };
      const answer = () => options.callback(${JSON.stringify(token)});
      if (${interactive}) {
        options['before-interactive-callback']();
        window.tickTheBox = () => { options['after-interactive-callback'](); answer(); };
      } else {
        setTimeout(answer, 0);
      }
      return 'widget-1';
    },
    reset() { window.turnstileResets = (window.turnstileResets || 0) + 1; },
  };`;

  // From a fresh page to the booking step, saving the outline with this email.
  async function toBooking(page, email, path = '/start?for=leads') {
    await page.goto(path);
    await buildOutline(page);
    await page.fill('#email', email);
    await page.getByRole('button', { name: 'Email it to me' }).click();
    await expect(page.locator('#bookTitle')).toBeFocused();
    await expect(page.locator('#bookForm')).toBeVisible();
  }

  const AI_OUTLINE = {
    kind: 'leads',
    title: 'A lunchtime call-back agent for your dental office',
    build: 'I\'d build an agent that texts back every caller you miss over lunch and offers them a time to come in.',
    steps: ['A call goes unanswered.', 'The agent texts the caller back.', 'It offers open appointment times.', 'Your front desk takes over when they reply.'],
    needs: ['Access to your phone system', 'Your appointment rules', 'How you like to greet patients'],
    milestone: 'Texting back missed calls from one line while you watch every message.',
    questions: ['How many calls do you miss at lunch?', 'Who books appointments today?', 'What should it never say?'],
  };

  test('each ad link opens on the problem that ad named', async ({ page }) => {
    const ads = { leads: /after hours/, spreadsheets: /by hand/, support: /questions/, app: /app idea/ };
    for (const [ad, headline] of Object.entries(ads)) {
      await page.goto(`/start?for=${ad}`);
      await expect(page.locator('h1')).toContainText(headline);
      expect(await page.locator('#problem').inputValue()).not.toBe('');
    }
    await page.goto('/start?for=unknown');
    await expect(page.locator('h1')).toContainText('slowing your business down');
    await expect(page.locator('#problem')).toHaveValue('');
  });

  test('an empty answer gets a message instead of an outline', async ({ page }) => {
    await page.goto('/start');
    await buildOutline(page);
    await expect(page.locator('#problemError')).not.toBeEmpty();
    await expect(page.locator('#problem')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#problem')).toBeFocused();
    await expect(page.locator('#stepOutline')).toBeHidden();
  });

  test('what the visitor types is shown as text, never run as markup', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/start');
    const typed = '<img src=x onerror="window.pwned=1">We copy invoices into Excel by hand';
    await page.fill('#problem', typed);
    await buildOutline(page);
    await expect(page.locator('#outlineProblem')).toHaveText(typed);
    expect(await page.evaluate(() => window.pwned)).toBeUndefined();
    await expect(page.locator('#outlineProblem img')).toHaveCount(0);
  });

  test('a visitor goes from one answer to a saved outline and a booked call, and only talks to this site', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const services = await useServices(page);
    const calls = watchRequests(page);
    const errors = watchForErrors(page);
    await page.goto('/start?for=spreadsheets&utm_source=google');
    const problem = await page.locator('#problem').inputValue();
    await buildOutline(page);

    await expect(page.locator('#outline')).toBeVisible();
    await expect(page.locator('#outlineTitle')).toBeFocused();
    await expect(page.locator('#outlineTitle')).toContainText('pipeline');
    await expect(page.locator('.start-progress [aria-current="step"]')).toHaveText('Your outline');
    await expect(page.locator('#saveLive')).toBeVisible();
    await expect(page.locator('#saveOff')).toBeHidden();

    await page.fill('#email', 'not-an-email');
    await page.getByRole('button', { name: 'Email it to me' }).click();
    await expect(page.locator('#emailError')).not.toBeEmpty();
    await expect(page.locator('#email')).toHaveAttribute('aria-invalid', 'true');
    await page.fill('#email', 'jane@example.com');
    await page.getByRole('button', { name: 'Email it to me' }).click();

    await expect(page.locator('#bookTitle')).toBeFocused();
    await expect(page.locator('#sentNote')).toContainText('Sent to jane@example.com');
    await expect(page.locator('#bookForm')).toBeVisible();
    await page.getByRole('button', { name: 'Book the call' }).click();
    await expect(page.locator('#bookError')).toHaveText('Pick a day first.');

    const days = page.locator('#bookDays input');
    expect(await days.count()).toBeGreaterThan(5);
    await days.nth(1).check();
    await page.getByRole('button', { name: 'Book the call' }).click();
    await expect(page.locator('#bookError')).toHaveText('Pick a time that works.');
    await page.locator('#bookTimes input').first().check();
    await expect(page.locator('#bookButton')).toHaveText(/^Book .+ at .+/);
    await page.locator('#bookButton').click();
    await expect(page.locator('#bookError')).toContainText('Add your name');
    await expect(page.locator('#name')).toBeFocused();
    await page.fill('#name', 'Jane Doe');
    await page.locator('#bookButton').click();

    await expect(page.locator('#doneTitle')).toHaveText('You\'re booked.');
    await expect(page.locator('#doneTitle')).toBeFocused();
    await expect(page.locator('#doneNext')).toContainText('jane@example.com');
    await expect(page.locator('#bookAfterAll')).toBeHidden();

    // The only things sent: the ad and platform, the answer, then the email,
    // then the time and name. All to this site, and nothing anywhere else.
    expect(calls.map(c => c.call)).toEqual(['GET /api/config', 'POST /api/event', 'POST /api/outline', 'POST /api/save', 'GET /api/slots', 'POST /api/book']);
    const sent = Object.fromEntries(calls.map(c => [c.call, c.body]));
    expect(sent['POST /api/event']).toEqual({ ad: 'spreadsheets', src: 'google' });
    expect(sent['POST /api/outline']).toEqual({ problem, ad: 'spreadsheets', src: 'google', turnstile: null });
    expect(sent['POST /api/save']).toEqual({ token: expect.any(String), email: 'jane@example.com', followUp: false, timeZone: expect.any(String) });
    expect(sent['POST /api/book']).toEqual({ lead: expect.any(String), start: expect.stringMatching(/^\d{4}-\d\d-\d\dT/), name: 'Jane Doe', timeZone: expect.any(String) });

    const { emails, bookings, alerts } = await services.state();
    expect(emails.map(e => e.to[0])).toEqual(['jane@example.com', 't@thomasewright.com']);
    expect(emails[0].subject).toContain('pipeline');
    expect(bookings).toHaveLength(1);
    expect(bookings[0].attendee).toMatchObject({ name: 'Jane Doe', email: 'jane@example.com' });
    expect(new Date(bookings[0].start).toISOString()).toBe(sent['POST /api/book'].start);
    expect(alerts.map(a => a.title)).toEqual(['New lead', 'Call booked']);
    expect(JSON.stringify(alerts)).not.toMatch(/jane|Jane/);
    expect(errors).toEqual([]);
  });

  test('the reminder box is offered only when the reminder email is set up, and its choice is sent', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await useServices(page);
    const calls = watchRequests(page);
    await page.goto('/start?for=leads');
    await buildOutline(page);
    await expect(page.locator('#followUpField')).toBeVisible();
    await expect(page.locator('#followUp')).not.toBeChecked();
    await page.getByLabel('Send me one reminder tomorrow if I haven\'t picked a time').check();
    await page.fill('#email', 'reminder@example.com');
    await page.getByRole('button', { name: 'Email it to me' }).click();
    await expect(page.locator('#bookTitle')).toBeFocused();
    expect(calls.find(c => c.call === 'POST /api/save').body.followUp).toBe(true);

    await useServices(page, 'noreminder');
    await page.goto('/start?for=leads');
    await buildOutline(page);
    await expect(page.locator('#saveLive')).toBeVisible();
    await expect(page.locator('#followUpField')).toBeHidden();
  });

  test('with nothing connected, the outline still shows, with email and phone instead of saving', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await useServices(page, 'bare');
    const calls = watchRequests(page);
    const errors = watchForErrors(page);
    await page.goto('/start?for=leads');
    await buildOutline(page);
    await expect(page.locator('#outlineTitle')).toContainText('leads');
    await expect(page.locator('#saveLive')).toBeHidden();
    await expect(page.locator('#saveOff')).toBeVisible();
    await expect(page.locator('#saveTitle')).toHaveText('Want to talk it through?');
    await expect(page.locator('#jumpToSave')).toContainText('How to talk it through');
    await expect(page.locator('#saveOff a[href="mailto:t@thomasewright.com"]')).toBeVisible();
    await expect(page.locator('#saveOff a[href="tel:+18015808630"]')).toBeVisible();
    expect(calls.map(c => c.call)).toEqual(['GET /api/config', 'POST /api/event', 'POST /api/outline']);
    expect(errors).toEqual([]);
  });

  test('with booking off, saving finishes the flow and says to reply to the email', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await useServices(page, 'nobook');
    await page.goto('/start?for=leads');
    await buildOutline(page);
    await page.fill('#email', 'nobook@example.com');
    await page.getByRole('button', { name: 'Email it to me' }).click();
    await expect(page.locator('#doneTitle')).toHaveText('Your outline is on its way.');
    await expect(page.locator('#doneText')).toContainText('Sent to nobook@example.com');
    await expect(page.locator('#doneNext')).toContainText('reply to the email and we\'ll find a time');
    await expect(page.locator('#bookAfterAll')).toBeHidden();
  });

  test('if the calendar can\'t be reached, the booking step says so and links to Cal.com', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await useServices(page, 'caldown');
    await page.goto('/start?for=leads');
    await buildOutline(page);
    await page.fill('#email', 'caldown@example.com');
    await page.getByRole('button', { name: 'Email it to me' }).click();
    const unavailable = page.locator('#timesUnavailable');
    await expect(unavailable).toBeVisible();
    await expect(unavailable).toContainText('Open times couldn\'t be loaded just now.');
    await expect(unavailable.getByRole('link', { name: /Pick a time on Cal\.com/ })).toHaveAttribute('href', 'https://cal.com/demo/intro-call');
    await expect(page.locator('#bookForm')).toBeHidden();
    await expect(page.locator('#timesLoading')).toBeHidden();
  });

  test('if the email doesn\'t go out, the page says Thomas still has the details', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const services = await useServices(page, 'emaildown');
    await page.goto('/start?for=leads');
    await buildOutline(page);
    await page.fill('#email', 'emaildown@example.com');
    await page.getByRole('button', { name: 'Email it to me' }).click();
    await expect(page.locator('#sentNote')).toHaveText('Saved. The email didn\'t go through, but Thomas has your details and will reply to emaildown@example.com.');
    await expect(page.locator('#bookForm')).toBeVisible();
    expect((await services.state()).alerts.map(a => a.title)).toEqual(['New lead']);

    // Booked anyway: the page doesn't point to an outline email that never came.
    await page.locator('#bookDays input').first().check();
    await page.locator('#bookTimes input').first().check();
    await page.fill('#name', 'Pat Doe');
    await page.locator('#bookButton').click();
    await expect(page.locator('#doneTitle')).toHaveText('You\'re booked.');
    await expect(page.locator('#doneNext')).toContainText('Thomas has your outline and will go through it with you on the call.');
    await expect(page.locator('#doneNext')).not.toContainText('separate email');
  });

  test('saving errors say what to do next', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await useServices(page);
    let reply;
    await page.route('**/api/save', route => route.fulfill(reply));
    await page.goto('/start?for=leads');
    await buildOutline(page);
    await page.fill('#email', 'errors@example.com');
    const cases = [
      [{ status: 400, json: { error: 'expired' } }, /open a while/],
      [{ status: 429, json: { error: 'too_many_sends' } }, /already been sent a few times/],
      [{ status: 429, json: { error: 'inbox_limit' } }, /a few outlines today.*t@thomasewright\.com/],
      [{ status: 429, body: '' }, /Too many tries/],
      [{ status: 500, json: { error: 'server_error' } }, /couldn't be sent just now.*t@thomasewright\.com/],
    ];
    for (const [response, message] of cases) {
      reply = response;
      await page.getByRole('button', { name: 'Email it to me' }).click();
      await expect(page.locator('#emailError'), JSON.stringify(response)).toHaveText(message);
      await expect(page.locator('#email')).toBeFocused();
      await expect(page.locator('#saveButton')).toBeEnabled();
      await expect(page.locator('#stepOutline')).toBeVisible();
    }
  });

  test('booking errors say what to do next, and a call already booked counts as booked', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await useServices(page);
    await toBooking(page, 'bookerrors@example.com');
    let reply;
    await page.route('**/api/book', route => route.fulfill(reply));
    await page.locator('#bookDays input').nth(1).check();
    await page.locator('#bookTimes input').first().check();
    await page.fill('#name', 'Pat Doe');

    reply = { status: 502, json: { error: 'booking_failed' } };
    await page.locator('#bookButton').click();
    await expect(page.locator('#bookError')).toHaveText('The call couldn\'t be booked just now. Try again in a moment.');
    await expect(page.locator('.book-fallback a')).toHaveAttribute('href', 'https://cal.com/demo/intro-call');

    reply = { status: 400, json: { error: 'expired' } };
    await page.locator('#bookButton').click();
    await expect(page.locator('#bookError')).toContainText('Reply to your outline email instead.');
    await expect(page.locator('.book-fallback')).toHaveCount(1);

    reply = { status: 409, json: { error: 'already_booked' } };
    await page.locator('#bookButton').click();
    await expect(page.locator('#doneTitle')).toHaveText('You\'re booked.');
    await expect(page.locator('#doneText')).toHaveText('Your call is already on the calendar.');
  });

  test('a time someone else just took is refused, and fresh times load without it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const services = await useServices(page);
    await toBooking(page, 'first@example.com');
    await page.locator('#bookDays input').nth(1).check();
    await page.locator('#bookTimes input').first().check();
    const taken = await page.locator('#bookButton').textContent();

    // Someone else books that same time in another tab first.
    const other = await page.context().newPage();
    await other.setExtraHTTPHeaders({ 'x-test-env': services.mode });
    await other.emulateMedia({ reducedMotion: 'reduce' });
    await toBooking(other, 'second@example.com');
    await other.locator('#bookDays input').nth(1).check();
    await other.locator('#bookTimes input').first().check();
    expect(await other.locator('#bookButton').textContent()).toBe(taken);
    await other.fill('#name', 'Second Visitor');
    await other.locator('#bookButton').click();
    await expect(other.locator('#doneTitle')).toHaveText('You\'re booked.');

    await page.fill('#name', 'First Visitor');
    await page.locator('#bookButton').click();
    await expect(page.locator('#bookError')).toHaveText('Someone just took that time. Pick another.');
    await expect(page.locator('#bookForm')).toBeVisible();
    // Keyboard and screen reader users land back on the choice of day, not at the top of the page.
    await expect(page.locator('#bookDays input').first()).toBeFocused();
    await expect(page.locator('#name')).toHaveValue('First Visitor');
    await page.locator('#bookDays input').nth(1).check();
    await page.locator('#bookTimes input').first().check();
    expect(await page.locator('#bookButton').textContent()).not.toBe(taken);
    await page.locator('#bookButton').click();
    await expect(page.locator('#doneTitle')).toHaveText('You\'re booked.');

    const { bookings } = await services.state();
    expect(bookings.map(b => b.attendee.name)).toEqual(['Second Visitor', 'First Visitor']);
    expect(bookings[0].start).not.toBe(bookings[1].start);
  });

  test('the booking step fits a phone screen, even after picking the last day', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 320, height: 700 });
    await useServices(page);
    await toBooking(page, 'narrow@example.com');
    await page.locator('#bookDays input').last().check();
    await page.locator('#bookTimes input').last().check();
    const { overflow, scrollX } = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      scrollX: window.scrollX,
    }));
    expect(overflow).toBeLessThanOrEqual(0);
    expect(scrollX).toBe(0);
    await expect(page.locator('#bookButton')).toBeInViewport({ ratio: 0 });
  });

  test('Back and Forward move between steps and keep what was typed', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await useServices(page);
    await page.goto('/start');
    await page.fill('#problem', 'We re-enter every Shopify order into QuickBooks by hand.');
    await buildOutline(page);
    await expect(page.locator('#outline')).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/start$/);
    await expect(page.locator('#stepDescribe')).toBeVisible();
    await expect(page.locator('#problem')).toHaveValue('We re-enter every Shopify order into QuickBooks by hand.');

    await page.goForward();
    await expect(page.locator('#outline')).toBeVisible();
    await page.fill('#email', 'backforward@example.com');
    await page.getByRole('button', { name: 'Email it to me' }).click();
    await expect(page.locator('#bookTitle')).toBeFocused();
    await page.getByRole('button', { name: 'See my outline again' }).click();
    await expect(page.locator('#outlineTitle')).toBeFocused();
    await expect(page.locator('#outlineTitle')).toContainText('pipeline');
    await page.goForward();
    await expect(page.locator('#bookTitle')).toBeFocused();
  });

  test('a reload keeps the outline and the save form without writing it again, until it is saved', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await useServices(page);
    const calls = watchRequests(page);
    await page.goto('/start');
    await page.fill('#problem', 'We re-enter every Shopify order into QuickBooks by hand.');
    await buildOutline(page);
    await expect(page.locator('#outline')).toBeVisible();
    const title = await page.locator('#outlineTitle').textContent();

    await page.reload();
    await expect(page.locator('#outline')).toBeVisible();
    await expect(page.locator('#outlineTitle')).toHaveText(title);
    await expect(page.locator('#outlineProblem')).toHaveText('We re-enter every Shopify order into QuickBooks by hand.');
    expect(calls.filter(c => c.call === 'POST /api/outline')).toHaveLength(1);

    // The kept outline can still be saved, and Back still reaches the answer.
    await page.fill('#email', 'reload@example.com');
    await page.getByRole('button', { name: 'Email it to me' }).click();
    await expect(page.locator('#bookTitle')).toBeFocused();

    // Once saved, a reload starts fresh.
    await page.reload();
    await expect(page.locator('#stepDescribe')).toBeVisible();
    await expect(page.locator('#stepOutline')).toBeHidden();
  });

  test('opening /start afresh in the same tab starts a new outline', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await useServices(page);
    await page.goto('/start');
    await page.fill('#problem', 'We re-enter every Shopify order into QuickBooks by hand.');
    await buildOutline(page);
    await expect(page.locator('#outline')).toBeVisible();
    await page.goto('/start?for=leads');
    await expect(page.locator('#stepDescribe')).toBeVisible();
    await expect(page.locator('#problem')).not.toHaveValue(/Shopify/);
  });

  test('"Not now" finishes the flow, and booking stays one tap away', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await useServices(page);
    await toBooking(page, 'later@example.com');
    await page.getByRole('button', { name: /Not now/ }).click();
    await expect(page.locator('#doneTitle')).toHaveText('Your outline is on its way.');
    await expect(page.locator('#doneText')).toContainText('Sent to later@example.com');
    await expect(page.locator('#doneNext')).toContainText('use the link in it to pick a time');
    await page.getByRole('button', { name: 'Pick a time after all' }).click();
    await expect(page.locator('#bookTitle')).toBeFocused();
    await expect(page.locator('#bookForm')).toBeVisible();
  });

  test('the delete link in the email asks first, then deletes the saved details', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const services = await useServices(page);
    const errors = watchForErrors(page);
    await toBooking(page, 'forget@example.com');
    const { emails } = await services.state();
    const link = emails[0].text.match(/Delete my details: (\S+)/)[1];
    expect(new URL(link).pathname).toBe('/forget');

    await page.goto(link);
    await expect(page.locator('h1')).toHaveText('Delete your details?');
    await page.getByRole('button', { name: 'Delete my details' }).click();
    await expect(page.locator('h1')).toHaveText('Your details are deleted');
    await page.goto(link);
    await expect(page.locator('h1')).toHaveText('Already deleted');
    expect(errors).toEqual([]);
  });

  test('the leads list asks for the password, then shows the saved outline and the counts', async ({ page, browser }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const services = await useServices(page);
    await toBooking(page, 'listed@example.com', '/start?for=reports&utm_source=meta');

    const denied = await page.request.get('/admin', { headers: { 'x-test-env': services.mode } });
    expect(denied.status()).toBe(401);
    expect(denied.headers()['www-authenticate']).toMatch(/^Basic /);

    const context = await browser.newContext({
      httpCredentials: { username: 'thomas', password: 'local-demo-password' },
      extraHTTPHeaders: { 'x-test-env': services.mode },
    });
    const admin = await context.newPage();
    const errors = watchForErrors(admin);
    await admin.goto('/admin');
    await expect(admin.locator('main')).toContainText('listed@example.com');
    await expect(admin.locator('main')).toContainText('pipeline');
    await expect(admin.locator('table').first()).toContainText('reports');
    await expect(admin.locator('table').first()).toContainText('meta');

    // Deleting works from the page itself, the way a browser really sends it.
    await admin.getByRole('button', { name: 'Delete this lead' }).click();
    await expect(admin.locator('main')).toContainText('No leads yet.');
    await expect(admin.locator('main')).not.toContainText('listed@example.com');
    const left = await page.request.post(`/__test/sql?mode=${encodeURIComponent(services.mode)}`, { data: { sql: 'SELECT COUNT(*) AS n FROM leads' } });
    expect(await left.json()).toEqual([{ n: 0 }]);
    expect(errors).toEqual([]);
    await context.close();
  });

  test('the bot check runs before the outline is written, and passing it lets the visitor save', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const services = await useServices(page, 'turnstile');
    await page.route('https://challenges.cloudflare.com/**', route => route.fulfill({ contentType: 'text/javascript', body: fakeTurnstile('pass-token') }));
    const errors = watchForErrors(page);
    await page.goto('/start?for=leads');
    await buildOutline(page);
    await expect(page.locator('#outline')).toBeVisible();
    await expect(page.locator('#saveLive')).toBeVisible();
    expect(await page.evaluate(() => window.turnstileOptions)).toEqual({ sitekey: '1x00000000000000000000AA', action: 'outline', appearance: 'interaction-only' });
    const { botChecks } = await services.state();
    expect(botChecks).toEqual([expect.objectContaining({ response: 'pass-token', secret: 'test-turnstile-secret' })]);
    expect(await page.evaluate(() => window.turnstileResets)).toBe(1);
    expect(errors).toEqual([]);
  });

  test('a visitor who fails the bot check still sees an outline, with email and phone instead of saving', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await useServices(page, 'turnstile');
    await page.route('https://challenges.cloudflare.com/**', route => route.fulfill({ contentType: 'text/javascript', body: fakeTurnstile('bot-token') }));
    await page.goto('/start?for=leads');
    await buildOutline(page);
    await expect(page.locator('#outlineTitle')).toContainText('leads');
    await expect(page.locator('#saveOff')).toBeVisible();
    await expect(page.locator('#saveLive')).toBeHidden();
  });

  test('when the bot check wants a tick, the page says so and waits for it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await useServices(page, 'turnstile');
    await page.route('https://challenges.cloudflare.com/**', route => route.fulfill({ contentType: 'text/javascript', body: fakeTurnstile('pass-token', { interactive: true }) }));
    await page.goto('/start?for=leads');
    await page.waitForFunction(() => typeof window.tickTheBox === 'function');
    await buildOutline(page);
    await expect(page.locator('#outlineBusy')).toHaveText('Tick the box above so I know you\'re not a bot.');
    await expect(page.locator('#stepOutline')).toBeHidden();
    await page.evaluate(() => window.tickTheBox());
    await expect(page.locator('#outline')).toBeVisible();
    await expect(page.locator('#saveLive')).toBeVisible();
    await expect(page.locator('#outlineBusy')).toBeEmpty();
  });

  test('the outline matches whole words in what the visitor wrote', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const cases = [
      ['/start', 'Clients book appointments by phone and when we miss the call they go elsewhere.', /leads/],
      ['/start', 'Our sales team spends hours entering data into Excel.', /pipeline/],
      ['/start', 'It is important that we reply to customers quickly and we are happy to try anything.', /custom tool/],
      ['/start?for=app', 'We copy invoices from email into QuickBooks by hand every week.', /pipeline/],
      ['/start', 'Our website is old and customers can\'t find our services on it.', /website/],
    ];
    for (const [path, text, title] of cases) {
      await page.goto(path);
      await page.fill('#problem', text);
      await buildOutline(page);
      await expect(page.locator('#outlineTitle'), text).toContainText(title);
    }
  });

  test('odd ?for= values fall back to the plain page without breaking it', async ({ page }) => {
    const errors = watchForErrors(page);
    for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      await page.goto(`/start?for=${key}`);
      await expect(page.locator('h1')).toContainText('slowing your business down');
      await page.fill('#problem', 'Customers keep asking the same questions.');
      await buildOutline(page);
      await expect(page).toHaveURL(new RegExp(`for=${key}$`));
      await expect(page.locator('#stepOutline')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('"Change what I wrote" goes back with the answer kept', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/start');
    await page.fill('#problem', 'Customers keep asking the same questions by email.');
    await buildOutline(page);
    await page.getByRole('button', { name: 'Change what I wrote' }).click();
    await expect(page.locator('#problem')).toBeFocused();
    await expect(page.locator('#problem')).toHaveValue('Customers keep asking the same questions by email.');
    await expect(page.locator('#stepOutline')).toBeHidden();
  });

  test('the page says an AI writes the outline, links to that part of the privacy notice, and can be found in search', async ({ page }) => {
    await page.goto('/start');
    const fineprint = page.locator('.start-fineprint');
    await expect(fineprint).toContainText('An AI model run by Cloudflare writes your outline from what you type.');
    await expect(fineprint).toContainText('Nothing is kept unless you choose to save it.');
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    await fineprint.getByRole('link', { name: 'Privacy notice' }).click();
    await expect(page).toHaveURL(/\/privacy#start$/);
    await expect(page.locator('#start')).toHaveText('The Start a project page');
    await expect(page.locator('#start')).toBeInViewport();
  });

  // A stand-in for the browser's speech recognition, driven from the test.
  const fakeSpeech = () => {
    window.SpeechRecognition = class {
      // Starts at once, so a test's next step can't overtake it.
      start() { window.fakeRecognition = this; this.onstart?.(); }
      stop() { setTimeout(() => this.onend?.(), 0); }
    };
    window.speak = (...phrases) => window.fakeRecognition.onresult({
      results: phrases.map(p => Object.assign([{ transcript: p }], { isFinal: true })),
    });
    window.speechError = error => { window.fakeRecognition.onerror({ error }); window.fakeRecognition.onend(); };
  };

  test('"Talk instead" types what the visitor says into the box, replacing the ad example', async ({ page }) => {
    await page.addInitScript(fakeSpeech);
    await page.goto('/start?for=leads');
    const talk = page.getByRole('button', { name: 'Talk instead' });
    await expect(talk).toBeVisible();
    await talk.click();
    await expect(page.locator('#talkStatus')).toContainText('Listening');
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();

    await page.evaluate(() => window.speak('We run a dental office', ' and miss calls at lunch'));
    await expect(page.locator('#problem')).toHaveValue('We run a dental office and miss calls at lunch');

    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(talk).toBeVisible();
    await expect(page.locator('#problem')).toBeFocused();
    await expect(page.locator('#talkStatus')).toContainText('Got it');
  });

  test('talking adds to what the visitor already typed, and errors say what to do', async ({ page }) => {
    await page.addInitScript(fakeSpeech);
    await page.goto('/start');
    await page.fill('#problem', 'Our shop is busy.');
    await page.getByRole('button', { name: 'Talk instead' }).click();
    await page.evaluate(() => window.speak('We never answer the phone'));
    await expect(page.locator('#problem')).toHaveValue('Our shop is busy. We never answer the phone');
    await page.getByRole('button', { name: 'Stop' }).click();

    await page.getByRole('button', { name: 'Talk instead' }).click();
    await page.evaluate(() => window.speechError('not-allowed'));
    await expect(page.locator('#talkStatus')).toContainText('microphone is blocked');
    await expect(page.locator('#talkStatus')).toHaveClass(/is-error/);
    await expect(page.getByRole('button', { name: 'Talk instead' })).toBeVisible();
  });

  test('building the outline while listening stops the microphone', async ({ page }) => {
    await page.addInitScript(fakeSpeech);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/start');
    await page.getByRole('button', { name: 'Talk instead' }).click();
    await page.evaluate(() => window.speak('Customers ask the same questions all day'));
    await buildOutline(page);
    await expect(page.locator('#outlineTitle')).toContainText('repeat questions');
    await expect(page.locator('#talkLabel')).toHaveText('Talk instead');
  });

  test('without speech recognition there is no talk button', async ({ page }) => {
    await page.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
    await page.goto('/start');
    await expect(page.locator('#talkButton')).toBeHidden();
    await expect(page.locator('#problemHint')).toHaveText('Plain words are fine. No need to know what the fix is.');
  });

  test('the outline the AI writes is shown, labelled as AI, with past work from the fixed text', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let posted;
    await page.route('**/api/outline', async route => {
      posted = route.request().postDataJSON();
      await route.fulfill({ json: { source: 'ai', outline: AI_OUTLINE } });
    });
    await page.goto('/start?for=leads');
    await page.fill('#problem', 'We run a dental office and miss calls at lunch.');
    await buildOutline(page);

    await expect(page.locator('#outlineTitle')).toHaveText(AI_OUTLINE.title);
    await expect(page.locator('#outlineDraft')).toContainText('Written by AI');
    await expect(page.locator('#outlineSteps li')).toHaveCount(4);
    await expect(page.locator('#outlineMilestone')).toHaveText(AI_OUTLINE.milestone);
    await expect(page.locator('#outlineShipped')).toContainText('AI Lead Response Agent');
    expect(posted).toEqual({ problem: 'We run a dental office and miss calls at lunch.', ad: 'leads', src: null, turnstile: null });
  });

  test('if the AI fails, is rate limited or sends junk, the template outline is shown', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const replies = [
      { status: 500, json: { error: 'x' } },
      { status: 429, json: { error: 'rate_limited' } },
      { status: 200, json: { source: 'template' } },
      { status: 200, json: { source: 'ai', outline: { kind: 'nonsense' } } },
    ];
    for (const reply of replies) {
      await page.unrouteAll();
      await page.route('**/api/outline', route => route.fulfill(reply));
      await page.goto('/start?for=spreadsheets');
      await buildOutline(page);
      await expect(page.locator('#outlineTitle'), JSON.stringify(reply)).toContainText('pipeline');
      await expect(page.locator('#outlineDraft')).not.toContainText('AI');
      // Without the server's signed copy there's nothing to save, so it offers email and phone.
      await expect(page.locator('#saveOff')).toBeVisible();
    }
  });

  test('going back while the outline is being written drops the late reply', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let release;
    await page.route('**/api/outline', async route => {
      await new Promise(resolve => { release = resolve; });
      await route.fulfill({ json: { source: 'ai', outline: AI_OUTLINE } });
    });
    await page.goto('/start?for=leads');
    await buildOutline(page);
    await expect(page.locator('#outlineLoading')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#stepDescribe')).toBeVisible();
    release();
    await page.waitForTimeout(500);
    await expect(page.locator('#stepDescribe')).toBeVisible();
    await expect(page.locator('#stepOutline')).toBeHidden();
  });
});

test.describe('project cards', () => {
  test('every project card has a Problem and a Solution heading, and maybe a Result, each followed by text', async ({ page }) => {
    await page.goto('/');
    const cards = await page.locator('.work-item').all();
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const title = (await card.locator('h3').textContent()).trim();
      const parts = await card.locator('h4').evaluateAll(headings => headings.map(h => {
        const next = h.nextElementSibling;
        return { label: h.textContent.trim(), text: next?.tagName === 'P' ? next.textContent.trim() : '' };
      }));
      expect(['Problem,Solution', 'Problem,Solution,Result'], `${title}: h4 headings`).toContain(parts.map(p => p.label).join());
      for (const { label, text } of parts) expect(text, `${title}: text after "${label}"`).not.toBe('');
    }
  });

  test('the lead agent\'s revenue is its contracts at $70 each, and the hero shows the same figure', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('.work-item', { has: page.locator('h3', { hasText: 'AI Lead Response Agent' }) });
    const result = await card.locator('h4:text-is("Result") + p').textContent();
    const contracts = Number(result.match(/signed (\d+) contracts/)[1]);
    const dollars = result.match(/\$(\d[\d,]*) in revenue/)[1];
    expect(Number(dollars.replace(/,/g, '')), result).toBe(contracts * 70);
    await expect(page.locator('.hero-stats strong').first()).toHaveText(`$${dollars}`);
  });
});
