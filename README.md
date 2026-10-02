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
```

The tests need Node 22.13 or later too, for the local database.

- `tests/site.spec.mjs` loads every page at 375, 390, 768 and 1440px in both themes and fails on horizontal overflow, console errors, failed requests or a missing header/footer. It also covers the mobile menu, skip link, theme toggle and its persistence, palette contrast, heading order, new-tab link labels, the copy-to-clipboard fallback, the security headers, and the whole `/start` flow in a browser against the stand-ins: the outline, saving, booking, the bot check, the delete link and the leads list.
- `tests/worker.spec.mjs` calls the Worker directly: outlines and their template fallback, saving, booking (including a lost reply from Cal.com and settling it from the leads list), the delete link, the leads list, the counts, the hourly job, adding a column to an existing database, and the AI eval the site runs on itself.
- `tests/site.spec.mjs` also runs `scripts/smoke-test.mjs`, the live check below, against the local server, so it's known to pass on a working site and to catch a broken one.
- `tests/ads.spec.mjs` opens each ad page (`/start?for=<key>`) and checks `docs/ADS.md` against them.

**Checking the AI outlines.** `worker/eval-cases.js` holds 38 sample visitor problems (real requests in three languages, real requests that start like an instruction to the AI, spam and prompt-injection attempts), each marked as one the AI should write an outline for or turn down, and most with the kind of work it is. Text that tries to talk to the AI (fake end-of-text markers, "ignore the instructions", a claimed system message) is stopped by a guard in `worker/outline.js` before it reaches the model, and gets the template outline. The guard takes only the unmistakable forms, so an owner writing "System: QuickBooks" or "You are now part of our team" still gets an AI outline; subtler attempts are left to the prompt, which refuses them too. The model's kind is checked against the visitor's own words (`settleKind`), so a clear missed-calls problem isn't filed as support. `scripts/eval-outlines.mjs` sends the cases to the live model with exactly the prompt and checks the site uses, and scores each one twice: as the site runs it, guard first, and by the model alone, so the prompt has to hold up without the guard. It exits with an error if either score is below 90%. Run it before and after changing the prompt, the guard or the model. New cases go in a commit of their own before the change they check; [`docs/EVAL-CASES.md`](docs/EVAL-CASES.md) has the rule and where each case came from:

```bash
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node scripts/eval-outlines.mjs   # token needs "Workers AI: Read"
node scripts/eval-outlines.mjs --out=docs/EVAL-RESULTS.md                            # also writes the result, to commit with the prompt
node scripts/eval-outlines.mjs --dry-run                                             # checks the cases without calling the AI
```

The site also runs the same cases on itself (`worker/eval.js`): a batch of 12 in each hourly run until all 38 are done, then again a week later, and straight away whenever the model, the prompt, the guard or the cases change. It counts toward the daily AI cap and only runs while fewer than 40 outlines have been written that day, so visitors keep most of the free allowance. The latest result and the last six runs are public at `https://wright-ai-solutions.com/api/eval` and on `/admin`. A phone alert goes out if a run falls below 90%, or scores lower than the run before it. No visitor's text is involved.

`.github/workflows/eval-outlines.yml` runs the eval on GitHub whenever the prompt, checks or cases change on `main`, and on demand from the Actions tab. Its summary page shows both scores and every case. It needs the `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` repository secrets; until they're set, its "Run the eval" job shows as skipped and the run summary says "Not run", after checking the cases without calling the AI.

In production, `/admin` shows how every outline of the last 30 days was written: by the AI, or from a template and why (daily limit, timeout, a reply that broke a rule, or text that wasn't a business problem).

CI runs them on every push and PR, alongside link, secret, HTML, header/footer-drift, cache-version and type/spacing-scale checks (`.github/workflows/ci.yml`).

## Deploying

Deploys via Cloudflare Workers Builds, connected to this GitHub repo and configured by `wrangler.jsonc`. Pushing to `main` triggers an automatic production build and deploy; other branches upload a preview version. Preview versions share production's secrets and bindings, so `/start` on a preview link uses the real leads list, email and calendar once they're connected. There are no manual steps per deploy. Switching on each part of `/start` is a one-time setup, in [`docs/SIGNUP-SETUP.md`](docs/SIGNUP-SETUP.md). Cloudflare's build runs `scripts/write-version.sh` first, which publishes the deployed commit at `/version.txt`; after each push to `main`, `.github/workflows/deploy-check.yml` waits for production to report that commit and fails visibly if it doesn't within 15 minutes. Then it runs `scripts/smoke-test.mjs` against the live site: the pages and their security headers, `/api/config`, open times from Cal.com, the AI eval result, the Worker's own daily check of each outside service, another site's request being refused, and `/admin` asking for its password. It only reads; nothing is saved, emailed or booked. The same check runs each morning, which also catches a dashboard change that deployed something other than `main`. Run it yourself with `node scripts/smoke-test.mjs` (add `--base=http://localhost:4173` for the local server).

The repo root is the assets directory. `.assetsignore` keeps repo-only files (`.git`, `.github`, `README.md`, `worker/`, config) out of the upload, so add any new repo-only file there. Only `/api/*`, `/admin`, `/admin/*` and `/forget` run the Worker (`run_worker_first` in `wrangler.jsonc`); every other path is served as a static file without it. `404.html` is served with a 404 status for any unmatched route, `_headers` sets the security and cache headers for the static files (the Worker sets its own, in `worker/http.js`), and `/privacy` serves `privacy.html`. An hourly cron (`17 * * * *`) runs the Worker's scheduled job, which sends any reminder emails that are due, deletes old leads and counts, and runs the next batch of the AI eval. Once a day it also checks each outside service with the Worker's own keys (`worker/health.js`): the email key and sending domain (Resend), open times (Cal.com), a few words from the AI, the bot check's secret (Turnstile) and the phone alert service (ntfy). Nothing is sent. The result is on `/admin`, a phone alert goes out when one fails, and `/api/health` publishes which passed (no details) for the live check above. Calls to Resend and Cal.com are tried up to three times after a quick failure that is safe to repeat (`withRetries` in `worker/http.js`): a dropped connection, a 429 or a server error for reads and for emails (Resend drops a repeat with the same key), but for a booking only a 429 or 503, the answers that say Cal.com booked nothing.

**Secrets** (`RESEND_API_KEY`, `TURNSTILE_SECRET`, `ADMIN_PASSWORD`, `NTFY_TOPIC`, optionally `CAL_API_KEY`) are set as Cloudflare Worker secrets, never in this repo. Settings that aren't secret go in `wrangler.jsonc`. `docs/SIGNUP-SETUP.md` says which goes where.

**Caching:** every page loads its CSS and JS with the same `?v=` number, and so do `start.js`'s import of `outlines.js` and the pages the Worker writes (`ASSET_VERSION` in `worker/pages.js`); CI enforces it. Bump it in all of them whenever `styles.css`, `script.js`, `theme-init.js`, `noscript.css`, `fonts/fonts.css`, `start.js`, `outlines.js` or `admin.css` changes. Files under `/fonts/` are cached for a year as immutable, so a changed font file needs a new file name; `/assets/` images are cached for 30 days.

**Rollback:** in the Cloudflare dashboard, Workers & Pages → `wright-ai-solutions` → Deployments, pick the last good version and roll back to it. The leads database isn't rolled back with it.

## Project structure

- `index.html`: the home page (one page, anchor-linked sections)
- `start.html`, `start.js`: `/start`, the ad landing page. One question, a project outline on the page (written by AI, or from a template), then saving it by email and booking a 30-minute call. `?for=<key>` opens it on the problem a given ad named
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
- `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`: icons (the PNGs are rendered from the SVG)
- `tests/`: Playwright tests (`site.spec.mjs` in a browser, `worker.spec.mjs` for the Worker, `ads.spec.mjs` for the ad pages and `docs/ADS.md`), the local server that mimics Cloudflare (`serve.mjs`) and its stand-in services (`fakes.mjs`)
- `SECURITY.md`: how to report a problem, what the site and the Worker do to stay safe, and the procedure for rotating a leaked credential
- `scripts/`: `write-version.sh` (run by Cloudflare's build), the AI outline eval (`eval-outlines.mjs`; the cases are in `worker/eval-cases.js`) and the live check (`smoke-test.mjs`)
- `docs/SITE-BRIEF.md`: who the site is for, what each section does, and how success is judged
- `fonts/`: self-hosted Inter and Space Grotesk (latin subset), each with its SIL Open Font License text (`LICENSE-Inter.txt`, `LICENSE-SpaceGrotesk.txt`), which the licence requires to ship alongside the font files

## Known limitations

- **No visual-regression screenshots.** The browser tests check layout rules (overflow, presence, behaviour), not pixels.
- **CI gates the deploy only once `main` is protected.** Cloudflare deploys whatever lands on `main`. To make CI a gate, turn on branch protection for `main` in GitHub (Settings → Branches → Add rule): require a pull request, require the CI status checks to pass (`link-check`, `secret-scan`, `html-validate`, `browser-tests`, `static-checks`), and don't allow bypassing. Until then a direct push can go live with red CI.
- **The AI Lead Response Agent card describes how the agent works in three plain steps, with no figures and no link to the real dashboard.** It previously linked directly to a client's real dashboard with its only auth secret in the URL, and separately showed that client's real name and exact figures in a screenshot, and later a mockup with sample figures. None of that is on the page now: there's no link, no client name and no numbers. Real, client-approved results can replace the illustration once permission is on file. The underlying secret is a separate system's credential (a different project's Vercel/GHL setup, not this repo), gates more than just the dashboard, and **has not been rotated** — it remains a live, valid, unrotated credential sitting in this repo's public git history (commits `8f395ac`, `651fb5f`). Fixing that requires action in that other project; `SECURITY.md` has the rotation steps. Until it's done, the `secret-scan` CI job (gitleaks over the full history) fails on purpose. The real (non-anonymized) dashboard screenshot that used to be committed here (`assets/work/lead-dashboard.jpg`) has been removed from the working tree, though it still exists in this repo's git history.
- **The Data→Lead→Sell card no longer embeds its real product-walkthrough video.** The video showed real obituary-derived leads (a real deceased person's name and property details), which isn't something this repo has any recorded basis to publish. The card now shows a screenshot of dataleadsell.com's own public homepage instead, whose "How a match works" example is explicitly labeled by the product itself as invented for illustration — no real personal data.
- **No dependency-audit step.** `package.json` holds dev tooling only (Playwright, html-validate, pinned in `package-lock.json`), none of which ships to visitors. There are no third-party runtime dependencies: the Worker imports nothing from npm, fonts are self-hosted (`fonts/`) and no external embeds remain. The one outside script is Cloudflare's Turnstile bot check, which `/start` loads from `challenges.cloudflare.com` once it's switched on.
- **ParkLess shows an illustration, not a screenshot.** The card's map is a drawn SVG; swap in a real screenshot of park-less.vercel.app (WebP + JPEG, width/height set, lazy-loaded, in the same browser frame) when one is taken.
- **English only.**
