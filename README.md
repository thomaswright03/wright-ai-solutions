# Wright AI Solutions

Marketing site for Wright AI Solutions LLC: static HTML/CSS/JS with no build step and no framework, plus a small Cloudflare Worker (`worker/`) for the ad landing page `/start`. What the site is for and how it's judged: [`docs/SITE-BRIEF.md`](docs/SITE-BRIEF.md).

Live at [wright-ai-solutions.com](https://wright-ai-solutions.com).

## Running locally

```bash
npm ci          # dev tooling only
npm run serve
```

Then open `http://localhost:4173` (`PORT=5050 npm run serve` picks another port). This serves the site the way Cloudflare does, with `/privacy`, the custom 404 and the `_headers` rules, and runs the Worker for `/api/*`, `/admin` and `/forget`. Instead of real accounts, the Worker gets the stand-in services in `tests/fakes.mjs`: an in-memory SQLite database (Node's built-in `node:sqlite`, so Node 22.13 or later; on an older Node the page behaves as if saving isn't set up), and emails, bookings and phone alerts kept in memory. `http://localhost:4173/__outbox` shows what would have been sent. Everything but the bot check is switched on, the local leads list at `/admin` takes the password `local-demo-password`, and nothing is kept after the server stops. There's no AI locally, so outlines come from the templates in `outlines.js`.

A plain static file server (`python3 -m http.server`) also shows the pages, but not `/privacy`, the 404, the headers or anything `/start` needs from the Worker.

## Testing

```bash
npm ci                                   # dev tooling only; the site has no runtime dependencies
npx playwright install chromium          # once
npm test                                 # every test in tests/ (Playwright starts the local server)
npm run validate                         # html-validate on every page
npm run lint                             # ESLint, strict, no warnings allowed
npm run typecheck                        # strict type check of the Worker and the page scripts (JSDoc types)
npm run deadcode                         # no unused files, exports or dependencies (knip)
node scripts/mutation-check.mjs          # proves each risk's tests catch it (a few minutes)
```

The tests need Node 22.13 or later too, for the local database.

- `tests/site.spec.mjs` loads every page at 375, 390, 768 and 1440px in both themes and fails on horizontal overflow, console errors, failed requests or a missing header/footer. It also covers the mobile menu, skip link, theme toggle and its persistence, palette contrast, heading order, new-tab link labels, the copy-to-clipboard fallback, the security headers, and the whole `/start` flow in a browser against the stand-ins: the outline, saving, booking, the bot check, the delete link and the leads list.
- `tests/worker.spec.mjs` calls the Worker directly: outlines and their template fallback, saving, booking (including a lost reply from Cal.com and settling it from the leads list), the delete link, the leads list, the counts, the hourly job, adding a column to an existing database, and the AI eval the site runs on itself.
- `tests/site.spec.mjs` also runs `scripts/smoke-test.mjs`, the live check below, against the local server, so it's known to pass on a working site and to catch a broken one.
- `tests/ads.spec.mjs` opens each ad page (`/start?for=<key>`) and checks `docs/ADS.md` against them.

**Checking the AI outlines.** `worker/eval-cases.js` holds 44 sample visitor problems (real requests in several languages, four of them typed on a translated `/start` whose outline must come back in that language, two injection attempts in Spanish and Chinese that the English-only guard lets through, real requests that start like an instruction to the AI, spam and prompt-injection attempts), each marked as one the AI should write an outline for or turn down, and most with the kind of work it is. Text that tries to talk to the AI (fake end-of-text markers, "ignore the instructions", a claimed system message) is stopped by a guard in `worker/outline.js` before it reaches the model, and gets the template outline. The guard takes only the unmistakable forms, so an owner writing "System: QuickBooks" or "You are now part of our team" still gets an AI outline; subtler attempts are left to the prompt, which refuses them too. The model's kind is checked against the visitor's own words (`settleKind`), so a clear missed-calls problem isn't filed as support. `scripts/eval-outlines.mjs` sends the cases to the live model with exactly the prompt and checks the site uses, and scores each one twice: as the site runs it, guard first, and by the model alone, so the prompt has to hold up without the guard. It exits with an error if either score is below 90%. A run where the AI didn't answer every case (an outage, or the day's free Workers AI allowance used up) isn't scored or recorded, since it says nothing about the prompt; each run uses about 40 outlines of that allowance, so run it at most once or twice a day. Run it before and after changing the prompt, the guard or the model. New cases go in a commit of their own before the change they check; [`docs/EVAL-CASES.md`](docs/EVAL-CASES.md) has the rule and where each case came from:

```bash
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node scripts/eval-outlines.mjs   # token needs "Workers AI: Read"
node scripts/eval-outlines.mjs --out=docs/EVAL-RESULTS.md                            # also writes the result, to commit with the prompt
node scripts/eval-outlines.mjs --dry-run                                             # checks the cases without calling the AI
```

The site also runs the same cases on itself (`worker/eval.js`): a batch of 12 in each hourly run until all 44 are done, then again a week later, and straight away whenever the model, the prompt, the guard or the cases change. It counts toward the AI cap and only runs while fewer than 50 outlines have been written in the last 24 hours (the window Workers AI's free allowance counts), so visitors keep at least 40 of the free allowance of about 90. The latest result and the last six runs are public at `https://wright-ai-solutions.com/api/eval` and on `/admin`. A phone alert goes out if a run falls below 90%, or scores lower than the run before it. No visitor's text is involved.

`.github/workflows/eval-outlines.yml` runs the eval on GitHub on demand from the Actions tab (it no longer runs on every merge, because it spends the same free AI allowance visitors use; see [`docs/COST.md`](docs/COST.md)). Its "model" box tries another Workers AI model with the site's prompt and checks. Its summary page shows both scores and every case. Every result is also committed, with its date, commit and the cases it missed, to `eval-history.csv` on the `eval-results` branch (`scripts/record-eval.mjs`, pushed by `scripts/push-eval-record.sh`), and `.github/workflows/eval-history.yml` adds the site's own runs there each day from `/api/eval`. That branch holds only the record, so it never deploys anything, and a run that scores lower than the one before is flagged on the run's summary page. It needs the `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` repository secrets; until they're set, its "Run the eval" job shows as skipped and the run summary says "Not run", after checking the cases without calling the AI.

In production, `/admin` shows how every outline of the last 30 days was written: by the AI, or from a template and why (daily limit, timeout, a reply that broke a rule, or text that wasn't a business problem).

CI runs them on every push and PR, alongside link, secret, HTML, header/footer-drift, cache-version and type/spacing-scale checks, the lint, type and dead-code checks, and the mutation check (`.github/workflows/ci.yml`).

**Proving the tests catch what matters.** `tests/rules.spec.mjs` checks each business rule exactly at its limit (one step inside and one past). `scripts/mutation-check.mjs` takes each of the 20 risks in `docs/RISKS.md`, breaks the code that guards it (the breaks are listed in `tests/mutations.mjs`) in a copy of the repo, and runs only the tests that risk names; it fails if any break goes unnoticed. `tests/risks.spec.mjs` keeps `docs/RISKS.md`, `docs/RULES.md`, `docs/FAILURES.md` and `tests/mutations.mjs` pointed at tests and code that exist.

**Types.** The code stays plain JavaScript with no build step; types are JSDoc comments, checked by TypeScript in strict mode: `tsconfig.json` for the Worker (with Cloudflare's types; shared shapes such as `Env` are in `worker/types.d.ts`) and `tsconfig.browser.json` for the page scripts (`browser.d.ts` covers Turnstile, speech recognition and the versioned `outlines.js` import).

## Deploying

Deploys via Cloudflare Workers Builds, connected to this GitHub repo and configured by `wrangler.jsonc`. Pushing to `main` triggers an automatic production build and deploy; other branches upload a preview version. Preview versions share production's secrets and bindings, so `/start` on a preview link uses the real leads list, email and calendar once they're connected. There are no manual steps per deploy. Switching on each part of `/start` is a one-time setup, in [`docs/SIGNUP-SETUP.md`](docs/SIGNUP-SETUP.md). Cloudflare's build runs `scripts/write-version.sh` first, which publishes the deployed commit at `/version.txt`; after each push to `main`, `.github/workflows/deploy-check.yml` waits for production to report that commit and fails visibly if it doesn't within 15 minutes. Then, in a job of its own so each fails only for its own reason, it runs `scripts/smoke-test.mjs` against the live site: the pages and their security headers, `/api/config`, open times from Cal.com, the AI eval result, the Worker's own check of each outside service (a used-up AI allowance is a warning, not a failure), another site's request being refused, and `/admin` asking for its password. It only reads; nothing is saved, emailed or booked. The same check runs each morning, which also catches a dashboard change that deployed something other than `main`. Run it yourself with `node scripts/smoke-test.mjs` (add `--base=http://localhost:4173` for the local server).

The repo root is the assets directory. `.assetsignore` keeps repo-only files (`.git`, `.github`, `README.md`, `worker/`, config) out of the upload, so add any new repo-only file there. Only `/api/*`, `/admin`, `/admin/*` and `/forget` run the Worker (`run_worker_first` in `wrangler.jsonc`); every other path is served as a static file without it. `404.html` is served with a 404 status for any unmatched route, `_headers` sets the security and cache headers for the static files (the Worker sets its own, in `worker/http.js`), and `/privacy` serves `privacy.html`. An hourly cron (`17 * * * *`) runs the Worker's scheduled job, which sends any reminder emails that are due, deletes old leads and counts, and runs the next batch of the AI eval. Once a day it also checks each outside service with the Worker's own keys (`worker/health.js`): the email key and sending domain (Resend), open times (Cal.com), a few words from the AI, the bot check's secret (Turnstile) and the phone alert service (ntfy). A service that failed is checked again every hour until it passes, so a short outage clears the same day, and the AI's free daily allowance being used up (Workers AI error 4006) is reported as that, not as an outage. Nothing is sent. The result is on `/admin`, a phone alert goes out when the daily check finds a failure, and `/api/health` publishes which passed (no details) for the live check above. Calls to Resend and Cal.com are tried up to three times after a quick failure that is safe to repeat (`withRetries` in `worker/http.js`): a dropped connection, a 429 or a server error for reads and for emails (Resend drops a repeat with the same key), but for a booking only a 429 or 503, the answers that say Cal.com booked nothing.

**Secrets** (`RESEND_API_KEY`, `TURNSTILE_SECRET`, `ADMIN_PASSWORD`, `NTFY_TOPIC`, optionally `CAL_API_KEY`) are set as Cloudflare Worker secrets, never in this repo. Settings that aren't secret go in `wrangler.jsonc`. `docs/SIGNUP-SETUP.md` says which goes where.

**Caching:** every page loads its CSS and JS with the same `?v=` number, and so do `start.js`'s import of `outlines.js` (typed for the type check in `browser.d.ts`) and the pages the Worker writes (`ASSET_VERSION` in `worker/pages.js`); CI enforces it. Bump it in all of them whenever `styles.css`, `script.js`, `theme-init.js`, `noscript.css`, `fonts/fonts.css`, `start.js`, `outlines.js` or `admin.css` changes. Files under `/fonts/` are cached for a year as immutable, so a changed font file needs a new file name; `/assets/` images are cached for 30 days.

**Rollback:** in the Cloudflare dashboard, Workers & Pages → `wright-ai-solutions` → Deployments, pick the last good version and roll back to it. The leads database isn't rolled back with it.

## Languages

The site is in English, Spanish, French, Brazilian Portuguese, Simplified Chinese, Tagalog, Vietnamese, Arabic (right to left), Korean, Russian and Haitian Creole. English is the source: `index.html`, `privacy.html`, `start.html` and `404.html` are written by hand, and `scripts/i18n.mjs` generates each other language's copy in its own folder (`/es/`, `/es/privacy`, `/es/start`, and `/es/404.html` for unknown `/es/` paths), from the English page and the translations in `i18n/<code>.json`. Each translation maps an English text (a paragraph with its links and markup, a heading, an alt text, a message from `start.js`, an outline template, an email line) to its translation. The language list is `languages.js`.

```bash
npm run i18n                                  # rebuild every translated page and worker/strings.js
node scripts/i18n.mjs --missing --lang=es     # English that has no Spanish yet, as JSON
node scripts/i18n.mjs --check                 # what CI runs: everything translated and up to date
```

**Changing English text:** edit the English page (or `start.js`, `outlines.js`, `worker/emails.js`), run `npm run i18n`, add the new texts that `--missing` lists to each `i18n/<code>.json`, and run it again. Until then CI fails, and the translated pages show those texts in English. Commit the generated folders, `worker/strings.js` and `sitemap.xml` with the change. Don't edit the generated pages by hand. The generator also keeps each English page's language menu (`<!-- i18n:switcher -->`), its hreflang links (`<!-- i18n:alternates -->`) and the translated pages' footer note (`<!-- i18n:note -->`) up to date.

Every page has a language menu in the header (a plain `<details>` list, so it works without JavaScript) linking to the same page in each language, and `hreflang` links for search engines. The language picked from the menu is remembered in the browser (`localStorage`); an English page then offers the same page in that language, in a line written in it (`offer` in `languages.js`), rather than redirecting, until the visitor takes it or keeps English. A figure such as the hero's "$11,760" is translated too, so each language writes it its own way ("11 760 $" in French). The page scripts take their words from a JSON block the generator puts in each translated page; dates and times on `/start` use the page's language. On a translated `/start` the AI is asked to write the outline in that language (and a reply in another language gets the template instead), the templates are translated, the visitor's emails, delete page and Cal.com invite are in it, and Thomas's copy stays in English with the language noted. Chinese, Arabic and Korean use the visitor's system fonts; Russian and Vietnamese load extra subsets of Inter only on pages that need them.

## Project structure

- `index.html`: the home page (one page, anchor-linked sections)
- `start.html`, `start.js`: `/start`, the ad landing page. One question, a project outline on the page (written by AI, or from a template), then saving it by email and booking a 30-minute call. `?for=<key>` opens it on the problem a given ad named
- `languages.js`: the site's languages, shared by the pages, the Worker and the generator
- `i18n/<code>.json`, `scripts/i18n.mjs`, and the generated `es/`, `fr/`, `pt/`, `zh/`, `tl/`, `vi/`, `ar/`, `ko/`, `ru/`, `ht/` folders and `worker/strings.js`: the translations (see Languages)
- `outlines.js`: the words behind `/start` (the ad-matched openings and the fixed outline templates), shared by the page and the Worker
- `worker/`: the server code for `/start`, the "delete my details" link (`/forget`) and Thomas's private leads list (`/admin`). `index.js` lists the routes, and `config.js` says which parts are switched on
- `admin.css`: styles for the leads list
- `styles.css`: shared styles. Colours, font sizes and spacing come from the tokens at the top (dark default, light palette for `prefers-color-scheme: light` or a saved choice); CI rejects raw px font sizes and spacing outside them
- `script.js`: shared behaviour (mobile menu, theme toggle, contact copy fallback, scroll reveal)
- `theme-init.js`: applies a saved light/dark choice in `<head>` before first paint
- The `<footer>` is repeated in `index.html`, `404.html`, `privacy.html` and `start.html`, and the `<header>` in the first three (`start.html`'s header has only the logo and theme toggle). CI fails if they drift apart
- `404.html`: custom not-found page
- `privacy.html`: privacy notice, served at `/privacy` and linked from every page's footer. Its "The Start a project page" section says what `/start` collects and which services it uses. Any change to what `/start` collects or which services it uses must update `privacy.html` in the same change, and so must adding analytics, cookies or a third-party embed anywhere on the site.
- `assets/work/`: screenshots and photos used in the Work section
- `docs/SIGNUP-SETUP.md`: the checklist for switching on each part of `/start` (leads database, bot check, email, booking, phone alerts, reminder email)
- `docs/ADS.md`: ready-to-paste ad copy for the eight ad pages of `/start`, with tagged links. Run the ads only once parts 1 to 4 of `docs/SIGNUP-SETUP.md` are done
- `docs/PRIVACY-ROUTINE.md`: how the privacy notice's promises (retention, requests, takedowns, the leads list) are kept
- `docs/COMPLIANCE-NOTES.md`: dated list of laws and licences that may apply, with sources and open items
- [`docs/RISKS.md`](docs/RISKS.md): the top 20 business risks, each with the tests that catch it (`tests/risks.spec.mjs` keeps the names in step)
- [`docs/RULES.md`](docs/RULES.md): every business rule, where it was promised, the code that enforces it and the tests that check it
- [`docs/FAILURES.md`](docs/FAILURES.md): every realistic failure, what the visitor sees, what's retried and logged, and its tests
- [`docs/COST.md`](docs/COST.md): spend caps, model choice and how to test a cheaper model, and what is cached and why
- [`docs/EVAL-CASES.md`](docs/EVAL-CASES.md): where each AI eval case came from, and the rule that new cases go in before the change they check
- `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`: icons (the PNGs are rendered from the SVG)
- `tests/`: Playwright tests (`site.spec.mjs` in a browser, `worker.spec.mjs` for the Worker, `ads.spec.mjs` for the ad pages and `docs/ADS.md`, `risks.spec.mjs` for `docs/RISKS.md`), the local server that mimics Cloudflare (`serve.mjs`) and its stand-in services (`fakes.mjs`)
- `SECURITY.md`: how to report a problem, what the site and the Worker do to stay safe, and the procedure for rotating a leaked credential
- `scripts/`: `write-version.sh` (run by Cloudflare's build), the AI outline eval (`eval-outlines.mjs`; the cases are in `worker/eval-cases.js`), its dated record (`record-eval.mjs`, `push-eval-record.sh`) and the live check (`smoke-test.mjs`)
- `docs/SITE-BRIEF.md`: who the site is for, what each section does, and how success is judged
- `fonts/`: self-hosted Inter and Space Grotesk (latin, plus Cyrillic and Vietnamese subsets that load only where needed), each with its SIL Open Font License text (`LICENSE-Inter.txt`, `LICENSE-SpaceGrotesk.txt`), which the licence requires to ship alongside the font files

## Known limitations

- **No visual-regression screenshots.** The browser tests check layout rules (overflow, presence, behaviour), not pixels.
- **`secret-scan` isn't a required check.** `main` is protected: `browser-tests`, `html-validate`, `link-check`, `static-checks`, `lint` and `mutation-check` must pass and the branch must be up to date before merging, and since 2026-10-03 nobody can bypass that, admins included ("Do not allow bypassing the above settings" in Settings → Branches). `secret-scan` was left out of the required checks while it couldn't pass; since the old credential was rotated on 2026-10-03 it passes and can be made required.
- **The AI Lead Response Agent card describes how the agent works in three plain steps, with no figures and no link to the real dashboard.** It previously linked directly to a client's real dashboard with its only auth secret in the URL, and separately showed that client's real name and exact figures in a screenshot, and later a mockup with sample figures. None of that is on the page now: there's no link, no client name and no numbers. Real, client-approved results can replace the illustration once permission is on file. The underlying secret is a separate system's credential (a different project's Vercel/GHL setup, not this repo), gates more than just the dashboard, and was still in this repo's public git history (commits `8f395ac`, `651fb5f`). Thomas rotated it on 2026-10-03, so the value in history is dead; its findings are recorded in `.gitleaksignore` and the `secret-scan` CI job (gitleaks over the full history) passes. The real (non-anonymized) dashboard screenshot that used to be committed here (`assets/work/lead-dashboard.jpg`) has been removed from the working tree, though it still exists in this repo's git history.
- **The Data→Lead→Sell card no longer embeds its real product-walkthrough video.** The video showed real obituary-derived leads (a real deceased person's name and property details), which isn't something this repo has any recorded basis to publish. The card now shows a screenshot of dataleadsell.com's own public homepage instead, whose "How a match works" example is explicitly labeled by the product itself as invented for illustration — no real personal data.
- **No dependency-audit step.** `package.json` holds dev tooling only (Playwright, html-validate, pinned in `package-lock.json`), none of which ships to visitors. There are no third-party runtime dependencies: the Worker imports nothing from npm, fonts are self-hosted (`fonts/`) and no external embeds remain. The one outside script is Cloudflare's Turnstile bot check, which `/start` loads from `challenges.cloudflare.com` once it's switched on.
- **ParkLess shows an illustration, not a screenshot.** The card's map is a drawn SVG; swap in a real screenshot of park-less.vercel.app (WebP + JPEG, width/height set, lazy-loaded, in the same browser frame) when one is taken.
- **The translations are by AI, not checked by native speakers.** Every page says so in its footer and links to the English, and the translated privacy notice says the English one applies if they differ. A native speaker's read of each language, the privacy notice first, would catch anything awkward or wrong.
- **Root 404 is English.** An unknown address inside a language folder (`/es/nada`) gets that language's 404 page; one outside them (`/nada`) gets the English one.
