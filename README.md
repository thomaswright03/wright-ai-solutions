# Wright AI Solutions

Marketing site for Wright AI Solutions, LLC — plain HTML/CSS/JS, no build step, no framework, no backend.

Live at [wright-ai-solutions.com](https://wright-ai-solutions.com).

## Running locally

```bash
python3 -m http.server 5050
```

Then open `http://localhost:5050`. Any static file server works — there's no build step to run first. Note: a plain file server like this serves its own generic error page for unknown routes, not `404.html` — to see the actual custom 404 locally, run `npx wrangler pages dev .` instead, which matches Cloudflare Pages' routing.

## Deploying

Deploys via Cloudflare Pages, connected to this GitHub repo. Pushing to `main` triggers an automatic production build and deploy — no manual steps, and no CI gate (CI runs in parallel, it doesn't block the deploy).

`404.html` at the repo root is served automatically by Cloudflare Pages for any unmatched route.

**Rollback:** in the Cloudflare dashboard, Workers & Pages → this project → Deployments, find the last good deployment and use "Rollback to this deployment."

## Project structure

- `index.html` — the entire site (single page, anchor-linked sections)
- `styles.css`, `script.js` — shared styles/behavior, also used by `404.html`
- `404.html` — custom not-found page
- `assets/work/` — screenshots and photos used in the Work section

## Known limitations

- **No end-to-end or visual-regression tests.** CI covers broken links and committed secrets (see `.github/workflows/ci.yml`); layout and mobile-width verification is still manual before pushing.
- **CI doesn't gate the deploy.** It runs in parallel with Cloudflare's auto-deploy on push to `main`, so a red CI run doesn't stop a bad push from going live.
- **The AI Lead Response Agent card shows only a static screenshot, with no live link.** It previously linked directly to a client dashboard with its only auth secret in the URL. That secret is a separate system's credential (a different project's Vercel/GHL setup, not this repo), gates more than just the dashboard, and **has not been rotated** — it remains a live, valid, unrotated credential sitting in this repo's public git history (commits `8f395ac`, `651fb5f`) even though the link is now removed from the page itself. Fixing that requires action in that other project, out of scope for this repo; this repo's fix is limited to no longer publishing or linking the value. If a live, linkable proof is wanted here again, it needs a separate public read-only endpoint on that app that doesn't require a secret.
- **The Data→Lead→Sell and AI Lead Response Agent cards display real business data** (a live dashboard screenshot and a product demo video) rather than synthetic placeholders. Whether the featured client (named in the dashboard screenshot) has agreed to be named and to have its figures shown publicly is not recorded anywhere in this repo.
- **No dependency-audit step**, since the site has no `package.json` or third-party JS dependencies to audit — only Google Fonts and a Loom embed are loaded externally.
