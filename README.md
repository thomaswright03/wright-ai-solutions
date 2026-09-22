# Wright AI Solutions

Marketing site for Wright AI Solutions, LLC — plain HTML/CSS/JS, no build step, no framework, no backend.

Live at [wright-ai-solutions.com](https://wright-ai-solutions.com).

## Running locally

```bash
python3 -m http.server 5050
```

Then open `http://localhost:5050`. Any static file server works — there's no build step to run first.

## Deploying

Deploys via Cloudflare Pages, connected to this GitHub repo. Pushing to `main` triggers an automatic production build and deploy — no manual steps.

`404.html` at the repo root is served automatically by Cloudflare Pages for any unmatched route.

## Project structure

- `index.html` — the entire site (single page, anchor-linked sections)
- `styles.css`, `script.js` — shared styles/behavior, also used by `404.html`
- `404.html` — custom not-found page
- `assets/work/` — screenshots and photos used in the Work section

## Known limitations

- **No automated tests or CI.** This is a static marketing page with no application logic to test; verification is manual (visual check + a mobile-width pass) before pushing.
- **The AI Lead Response Agent card links directly to a dashboard URL containing an auth secret in the query string** (`?secret=...`). This was a deliberate choice by the site owner to link the real dashboard rather than a mockup — see git history for the security tradeoff discussion. If that secret is ever rotated, the link in `index.html` needs updating to match.
- **The Data→Lead→Sell and AI Lead Response Agent cards display real business data** (a live dashboard screenshot and a product demo video) rather than synthetic placeholders — also a deliberate choice by the site owner to showcase real results.
- **No dependency-audit step**, since the site has no `package.json` or third-party JS dependencies to audit — only Google Fonts is loaded externally.
