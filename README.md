# Wright AI Solutions

Marketing site for Wright AI Solutions LLC — plain HTML/CSS/JS, no build step, no framework, no backend.

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
- `privacy.html` — privacy notice, served at `/privacy` and linked from every page's footer. If the site ever adds a form, analytics, cookies or a third-party embed, update this page in the same change.
- `assets/work/` — screenshots and photos used in the Work section
- `fonts/` — self-hosted Inter and Space Grotesk (latin subset), each with its SIL Open Font License text (`LICENSE-Inter.txt`, `LICENSE-SpaceGrotesk.txt`), which the licence requires to ship alongside the font files

## Known limitations

- **No end-to-end or visual-regression tests.** CI covers broken links, committed secrets, HTML validity, legal-name/copyright consistency, footer drift across pages, the footer privacy link, font licence files, and a page-weight budget (see `.github/workflows/ci.yml`); layout and mobile-width verification is still manual before pushing.
- **CI doesn't gate the deploy.** It runs in parallel with Cloudflare's auto-deploy on push to `main`, so a red CI run doesn't stop a bad push from going live.
- **The AI Lead Response Agent card shows a mockup filled with sample data, not a link to the real dashboard.** It previously linked directly to a client's real dashboard with its only auth secret in the URL, and separately showed that client's real name and exact figures in a screenshot. Neither is true anymore: there's no link at all, the client isn't named, and the numbers shown are sample data, labeled "Sample data — not this client's real results" on the mockup and in the card body. The underlying secret is a separate system's credential (a different project's Vercel/GHL setup, not this repo), gates more than just the dashboard, and **has not been rotated** — it remains a live, valid, unrotated credential sitting in this repo's public git history (commits `8f395ac`, `651fb5f`). Fixing that requires action in that other project, out of scope for this repo. The real (non-anonymized) dashboard screenshot that used to be committed here (`assets/work/lead-dashboard.jpg`) has been removed from the working tree, though it still exists in this repo's git history.
- **The Data→Lead→Sell card no longer embeds its real product-walkthrough video.** The video showed real obituary-derived leads (a real deceased person's name and property details), which isn't something this repo has any recorded basis to publish. The card now shows a screenshot of dataleadsell.com's own public homepage instead, whose "How a match works" example is explicitly labeled by the product itself as invented for illustration — no real personal data.
- **No dependency-audit step**, since the site has no `package.json` or third-party JS dependencies to audit. There are no third-party runtime dependencies either: fonts are self-hosted (`fonts/`) and no external embeds remain.
