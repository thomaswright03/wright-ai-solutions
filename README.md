# Wright AI Solutions

Marketing site for Wright AI Solutions LLC — plain HTML/CSS/JS, no build step, no framework, no backend. What the site is for and how it's judged: [`docs/SITE-BRIEF.md`](docs/SITE-BRIEF.md).

Live at [wright-ai-solutions.com](https://wright-ai-solutions.com).

## Running locally

```bash
python3 -m http.server 5050
```

Then open `http://localhost:5050`. Any static file server works — there's no build step to run first. A plain file server serves its own error page for unknown routes, though; `npm run serve` (after `npm ci`) serves the site the way Cloudflare does, with `/privacy`, the custom 404 and the `_headers` rules, on `http://localhost:4173`.

## Testing

```bash
npm ci                                   # dev tooling only; the site has no runtime dependencies
npx playwright install chromium          # once
npm test                                 # browser tests (tests/site.spec.mjs)
npm run validate                         # html-validate on every page
```

The browser tests load every page at 375, 390, 768 and 1440px in both themes and fail on horizontal overflow, console errors, failed requests or a missing header/footer. They also cover the mobile menu, skip link, theme toggle and its persistence, palette contrast, heading order, new-tab link labels and the copy-to-clipboard fallback. CI runs them on every push and PR, alongside link, secret, HTML, header/footer-drift, cache-version and type/spacing-scale checks (`.github/workflows/ci.yml`).

## Deploying

Deploys via Cloudflare Workers Builds (static assets), connected to this GitHub repo and configured by `wrangler.jsonc`. Pushing to `main` triggers an automatic production build and deploy; other branches upload a preview version. No manual steps. Cloudflare's build runs `scripts/write-version.sh` first, which publishes the deployed commit at `/version.txt`; after each push to `main`, `.github/workflows/deploy-check.yml` waits for production to report that commit and fails visibly if it doesn't within 15 minutes.

The repo root is the assets directory. `.assetsignore` keeps repo-only files (`.git`, `.github`, `README.md`, config) out of the upload, so add any new repo-only file there. `404.html` is served with a 404 status for any unmatched route, `_headers` sets the security and cache headers, and `/privacy` serves `privacy.html`.

**Caching:** every page loads its CSS and JS with the same `?v=` number (CI enforces it); bump it on all three pages whenever `styles.css`, `script.js`, `theme-init.js`, `noscript.css` or `fonts/fonts.css` changes. Files under `/fonts/` are cached for a year as immutable, so a changed font file needs a new file name; `/assets/` images are cached for 30 days.

**Rollback:** in the Cloudflare dashboard, Workers & Pages → `wright-ai-solutions` → Deployments, pick the last good version and roll back to it.

## Project structure

- `index.html` — the entire site (single page, anchor-linked sections)
- `styles.css` — shared styles. Colours, font sizes and spacing come from the tokens at the top (dark default, light palette for `prefers-color-scheme: light` or a saved choice); CI rejects raw px font sizes and spacing outside them
- `script.js` — shared behaviour: mobile menu, theme toggle, contact copy fallback, scroll reveal
- `theme-init.js` — applies a saved light/dark choice in `<head>` before first paint
- The `<header>` and `<footer>` are repeated in `index.html`, `404.html` and `privacy.html`; CI fails if they drift apart
- `404.html` — custom not-found page
- `privacy.html` — privacy notice, served at `/privacy` and linked from every page's footer. If the site ever adds a form, analytics, cookies or a third-party embed, update this page in the same change.
- `assets/work/` — screenshots and photos used in the Work section
- `docs/PRIVACY-ROUTINE.md` — how the privacy notice's promises (retention, requests, takedowns) are kept
- `docs/COMPLIANCE-NOTES.md` — dated list of laws and licences that may apply, with sources and open items
- `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` — icons (the PNGs are rendered from the SVG)
- `tests/` — Playwright browser tests and the local server that mimics Cloudflare's routing
- `SECURITY.md` — how to report a problem, and the procedure for rotating a leaked credential
- `docs/SITE-BRIEF.md` — who the site is for, what each section does, and how success is judged
- `fonts/` — self-hosted Inter and Space Grotesk (latin subset), each with its SIL Open Font License text (`LICENSE-Inter.txt`, `LICENSE-SpaceGrotesk.txt`), which the licence requires to ship alongside the font files

## Known limitations

- **No visual-regression screenshots.** The browser tests check layout rules (overflow, presence, behaviour), not pixels.
- **CI gates the deploy only once `main` is protected.** Cloudflare deploys whatever lands on `main`. To make CI a gate, turn on branch protection for `main` in GitHub (Settings → Branches → Add rule): require a pull request, require the CI status checks to pass (`link-check`, `secret-scan`, `html-validate`, `browser-tests`, `static-checks`), and don't allow bypassing. Until then a direct push can go live with red CI.
- **The AI Lead Response Agent card describes how the agent works in three plain steps, with no figures and no link to the real dashboard.** It previously linked directly to a client's real dashboard with its only auth secret in the URL, and separately showed that client's real name and exact figures in a screenshot, and later a mockup with sample figures. None of that is on the page now: there's no link, no client name and no numbers. Real, client-approved results can replace the illustration once permission is on file. The underlying secret is a separate system's credential (a different project's Vercel/GHL setup, not this repo), gates more than just the dashboard, and **has not been rotated** — it remains a live, valid, unrotated credential sitting in this repo's public git history (commits `8f395ac`, `651fb5f`). Fixing that requires action in that other project; `SECURITY.md` has the rotation steps. Until it's done, the `secret-scan` CI job (gitleaks over the full history) fails on purpose. The real (non-anonymized) dashboard screenshot that used to be committed here (`assets/work/lead-dashboard.jpg`) has been removed from the working tree, though it still exists in this repo's git history.
- **The Data→Lead→Sell card no longer embeds its real product-walkthrough video.** The video showed real obituary-derived leads (a real deceased person's name and property details), which isn't something this repo has any recorded basis to publish. The card now shows a screenshot of dataleadsell.com's own public homepage instead, whose "How a match works" example is explicitly labeled by the product itself as invented for illustration — no real personal data.
- **No dependency-audit step.** `package.json` holds dev tooling only (Playwright, html-validate, pinned in `package-lock.json`), none of which ships to visitors. There are no third-party runtime dependencies: fonts are self-hosted (`fonts/`) and no external embeds remain.
- **ParkLess shows an illustration, not a screenshot.** The card's map is a drawn SVG; swap in a real screenshot of park-less.vercel.app (WebP + JPEG, width/height set, lazy-loaded, in the same browser frame) when one is taken.
- **English only.**
