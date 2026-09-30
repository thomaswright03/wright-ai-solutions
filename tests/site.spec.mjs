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
  for (const path of ['/', '/privacy', '/no/such/page', '/styles.css?v=0']) {
    const res = await request.get(path);
    const headers = res.headers();
    expect(headers['strict-transport-security'], path).toMatch(/max-age=31536000/);
    expect(headers['content-security-policy'], path).toContain("default-src 'self'");
    expect(headers['x-content-type-options'], path).toBe('nosniff');
    expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
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
  // The only thing the page may send is the visitor's answer to this site's own
  // /api/outline; every other request is a GET for a file on this site.
  function watchRequests(page) {
    const sent = [];
    page.on('request', req => {
      const url = new URL(req.url());
      const outlineCall = req.method() === 'POST' && url.pathname === '/api/outline';
      if (url.host !== 'localhost:4173' || (req.method() !== 'GET' && !outlineCall)) sent.push(`${req.method()} ${req.url()}`);
    });
    return sent;
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
    await page.getByRole('button', { name: /Build my outline/ }).click();
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
    await page.getByRole('button', { name: /Build my outline/ }).click();
    await expect(page.locator('#outlineProblem')).toHaveText(typed);
    expect(await page.evaluate(() => window.pwned)).toBeUndefined();
    await expect(page.locator('#outlineProblem img')).toHaveCount(0);
  });

  test('a visitor goes from one answer to a booked call, and only their answer leaves the browser', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const sent = watchRequests(page);
    const errors = watchForErrors(page);
    await page.goto('/start?for=spreadsheets');
    await page.getByRole('button', { name: /Build my outline/ }).click();

    await expect(page.locator('#outline')).toBeVisible();
    await expect(page.locator('#outlineTitle')).toBeFocused();
    await expect(page.locator('#outlineTitle')).toContainText('pipeline');
    await expect(page.locator('.start-progress [aria-current="step"]')).toHaveText('Your outline');

    await page.fill('#email', 'not-an-email');
    await page.getByRole('button', { name: 'Save my outline' }).click();
    await expect(page.locator('#emailError')).not.toBeEmpty();
    await page.fill('#email', 'jane@example.com');
    await page.getByRole('button', { name: 'Save my outline' }).click();

    await expect(page.locator('#bookTitle')).toBeFocused();
    await expect(page.locator('#sentNote')).toContainText('jane@example.com');
    await expect(page.locator('#stepBook .start-prototype')).toBeVisible();
    await page.getByRole('button', { name: 'Book the call' }).click();
    await expect(page.locator('#bookError')).toHaveText('Pick a day first.');

    const days = page.locator('#bookDays input');
    await expect(days).toHaveCount(10);
    await days.nth(1).check();
    await page.getByRole('button', { name: 'Book the call' }).click();
    await expect(page.locator('#bookError')).toHaveText('Pick a time that works.');
    await page.locator('#bookTimes input').first().check();
    await expect(page.locator('#bookButton')).toHaveText(/^Book .+ at .+/);
    await page.locator('#bookButton').click();

    await expect(page.locator('#doneTitle')).toHaveText("You're booked.");
    await expect(page.locator('#doneNext')).toContainText('jane@example.com');
    await expect(page.locator('#doneProto')).toBeVisible();
    await expect(page.locator('#icsLink')).toHaveAttribute('href', /^blob:/);
    expect(sent).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('the booking step fits a phone screen, even after picking the last day', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/start?for=leads');
    await page.getByRole('button', { name: /Build my outline/ }).click();
    await page.getByRole('button', { name: 'Continue with Apple' }).click();
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
    await page.goto('/start');
    await page.fill('#problem', 'We re-enter every Shopify order into QuickBooks by hand.');
    await page.getByRole('button', { name: /Build my outline/ }).click();
    await expect(page.locator('#outline')).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/start$/);
    await expect(page.locator('#stepDescribe')).toBeVisible();
    await expect(page.locator('#problem')).toHaveValue('We re-enter every Shopify order into QuickBooks by hand.');

    await page.goForward();
    await expect(page.locator('#outline')).toBeVisible();
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await page.getByRole('button', { name: 'See my outline again' }).click();
    await expect(page.locator('#outlineTitle')).toBeFocused();
    await expect(page.locator('#outlineTitle')).toContainText('pipeline');
  });

  test('the one-tap buttons and "not now" both finish the flow, and booking stays one tap away', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/start?for=leads');
    await page.getByRole('button', { name: /Build my outline/ }).click();
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.locator('#sentNote')).toContainText('Google');
    await page.getByRole('button', { name: /Not now/ }).click();
    await expect(page.locator('#doneTitle')).toHaveText('Your outline is on its way.');
    await expect(page.locator('#icsLink')).toBeHidden();
    await expect(page.locator('#doneProto')).toBeVisible();
    await page.getByRole('button', { name: 'Pick a time after all' }).click();
    await expect(page.locator('#bookTitle')).toBeFocused();
  });

  test('the outline matches whole words in what the visitor wrote', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const cases = [
      ['/start', 'Clients book appointments by phone and when we miss the call they go elsewhere.', /leads/],
      ['/start', 'Our sales team spends hours entering data into Excel.', /pipeline/],
      ['/start', 'It is important that we reply to customers quickly and we are happy to try anything.', /custom tool/],
      ['/start?for=app', 'We copy invoices from email into QuickBooks by hand every week.', /pipeline/],
    ];
    for (const [path, text, title] of cases) {
      await page.goto(path);
      await page.fill('#problem', text);
      await page.getByRole('button', { name: /Build my outline/ }).click();
      await expect(page.locator('#outlineTitle'), text).toContainText(title);
    }
  });

  test('odd ?for= values fall back to the plain page without breaking it', async ({ page }) => {
    const errors = watchForErrors(page);
    for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      await page.goto(`/start?for=${key}`);
      await expect(page.locator('h1')).toContainText('slowing your business down');
      await page.fill('#problem', 'Customers keep asking the same questions.');
      await page.getByRole('button', { name: /Build my outline/ }).click();
      await expect(page).toHaveURL(new RegExp(`for=${key}$`));
      await expect(page.locator('#stepOutline')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('"Change what I wrote" goes back with the answer kept', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/start');
    await page.fill('#problem', 'Customers keep asking the same questions by email.');
    await page.getByRole('button', { name: /Build my outline/ }).click();
    await page.getByRole('button', { name: 'Change what I wrote' }).click();
    await expect(page.locator('#problem')).toBeFocused();
    await expect(page.locator('#problem')).toHaveValue('Customers keep asking the same questions by email.');
    await expect(page.locator('#stepOutline')).toBeHidden();
  });

  test('the page says it is a prototype and is kept out of search', async ({ page }) => {
    await page.goto('/start');
    await expect(page.locator('#prototypeNote')).toContainText('sent to an AI model run by Cloudflare');
    await expect(page.locator('#prototypeNote')).toContainText('We don\'t store it');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  });

  // A stand-in for the browser's speech recognition, driven from the test.
  const fakeSpeech = () => {
    window.SpeechRecognition = class {
      start() { window.fakeRecognition = this; setTimeout(() => this.onstart?.(), 0); }
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
    await page.getByRole('button', { name: /Build my outline/ }).click();
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
    await page.getByRole('button', { name: /Build my outline/ }).click();

    await expect(page.locator('#outlineTitle')).toHaveText(AI_OUTLINE.title);
    await expect(page.locator('#outlineDraft')).toContainText('Written by AI');
    await expect(page.locator('#outlineSteps li')).toHaveCount(4);
    await expect(page.locator('#outlineMilestone')).toHaveText(AI_OUTLINE.milestone);
    await expect(page.locator('#outlineShipped')).toContainText('AI Lead Response Agent');
    expect(posted).toEqual({ problem: 'We run a dental office and miss calls at lunch.', hint: 'leads' });
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
      await page.getByRole('button', { name: /Build my outline/ }).click();
      await expect(page.locator('#outlineTitle'), JSON.stringify(reply)).toContainText('pipeline');
      await expect(page.locator('#outlineDraft')).not.toContainText('AI');
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
    await page.getByRole('button', { name: /Build my outline/ }).click();
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
  test('every project card has a Problem and a Solution heading, each followed by text', async ({ page }) => {
    await page.goto('/');
    const cards = await page.locator('.work-item').all();
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const title = (await card.locator('h3').textContent()).trim();
      const parts = await card.locator('h4').evaluateAll(headings => headings.map(h => {
        const next = h.nextElementSibling;
        return { label: h.textContent.trim(), text: next?.tagName === 'P' ? next.textContent.trim() : '' };
      }));
      expect(parts.map(p => p.label), `${title}: h4 headings`).toEqual(['Problem', 'Solution']);
      for (const { label, text } of parts) expect(text, `${title}: text after "${label}"`).not.toBe('');
    }
  });
});
