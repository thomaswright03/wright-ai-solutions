# Security

## Reporting a problem

Email **t@thomasewright.com** with "Security" in the subject. Include what you found, where (a URL or file), and how to reproduce it. Please don't open a public GitHub issue for anything that could be exploited.

You'll get a reply within two business days. A confirmed problem gets a fix or a plan within 14 days, and we'll tell you when it's done.

Only the live site and this repository are covered. The products linked from the Work section (dataleadsell.com, kenna-art.onrender.com, park-less.vercel.app) are separate systems with their own code, but reports about them to the same address are welcome.

## If a secret is committed or leaked

A secret that has been pushed to this public repository is compromised, even if it's deleted in the next commit: git history keeps it, and anyone may already have a copy. Deleting the line is not a fix. Rotating the secret is.

1. **Rotate it first.** In the system the secret belongs to, issue a new one and revoke the old one. Check that the old value is refused (for example, a request with it returns 401).
2. **Update everything that uses it** to the new value. Keep it in that system's secret store (Vercel or Cloudflare environment variables, for instance), never in this repo or in a URL.
3. **Check for misuse.** Look through that system's access logs from the date of the leak onward, and follow `docs/PRIVACY-ROUTINE.md` if anyone's data may have been reached.
4. **Clear the CI finding.** The `secret-scan` CI job runs gitleaks over the whole history and fails on every secret it finds, including ones already rotated. After step 1, add the finding's fingerprint (printed in the job log, like `<commit>:<file>:<rule>:<line>`) to `.gitleaksignore` with a comment saying when it was rotated. Only rotated secrets go in that file.
5. **Optionally, remove it from history.** `docs/PRIVACY-ROUTINE.md` ("Removal from git history") has the steps. It isn't a substitute for rotating.

For this site's own secrets (listed under "Secrets" below), `docs/SIGNUP-SETUP.md` says where each one comes from and where it's set.

### Past leak

Commits `8f395ac` and `651fb5f` contain a dashboard credential for a separate lead-responder system. Thomas rotated it on 2026-10-03, so the value in history is dead, and both findings are recorded in `.gitleaksignore`.

## What the site does to stay safe

- **Server code:** most of the site is static files. A small Worker (`worker/`, with no npm dependencies) runs only for these routes, plus an hourly job that sends due reminder emails and deletes old leads and counts:
  - `POST /api/outline`, `GET /api/config`, `POST /api/event`, `POST /api/save`, `GET /api/slots` and `POST /api/book`, behind `/start`
  - `/forget`, the "delete my details" link in every email
  - `/admin`, Thomas's private leads list, with its CSV export and delete button
- **Same-site JSON only:** every `POST` to `/api/*` must carry this site's own `Origin` and a JSON content type, and stay under that route's size limit (1,000 to 24,000 bytes). Anything else is refused before any other work.
- **Rate limits:** per visitor IP per minute, through Cloudflare's rate limiting (counted per Cloudflare location): 5 outlines; 5 saves, bookings or delete-link requests; 30 page-view counts or open-times lookups; 30 requests to the leads list. If a limit's binding is ever missing, the route refuses with a 429 and logs an error rather than running unlimited. The live check after every deploy sends 60 requests in a row from the GitHub runner and fails unless one is refused. On top of that, at most 300 outlines in any 24 hours are written by AI (`AI_DAILY_LIMIT`); past that, visitors get the template outlines, so a flood of requests can't run up a Workers AI bill.
- **Bot check:** once Turnstile is switched on, `/api/outline` writes nothing until Cloudflare's siteverify confirms the visitor's token.
- **Signed steps:** each step hands the next one an HMAC-SHA256-signed token, bound to that step. The outline token (valid 3 hours) carries the outline to `/api/save`, so the email can only contain an outline this site wrote, never text someone posted, plus a random ID that makes it one lead however often it's saved. The booking token (12 hours) ties `/api/book` to one saved lead. The delete link's token names one lead and doesn't expire, so the link keeps working. A token is accepted only spelled exactly as it was signed (base64 decoding would otherwise forgive spaces, padding and unused bits). The signing key is made at random on first use and kept in the database.
- **Nothing to send strangers:** emails to the address a visitor types carry only the outline, never the visitor's own words, and an AI outline containing anything like a web address (including a spelled-out "dot com"), an `@`, or a phone number is replaced by a template. So a visitor can't put their own words, links or contact details in an email to someone else.
- **No flooding an inbox:** one inbox gets at most 3 outline emails a day, however the address is written (case, a `+tag` and Gmail's dots don't count as different). Each email sent counts, so moving a saved outline to another address doesn't free up the first one. The count is kept as a keyed hash of the inbox, never the address, and deleted after two days; checking and counting are one database statement, so parallel requests can't slip past. Each saved outline is emailed at most 3 times (the first address plus corrections).
- **Leads list:** off entirely (a 404) until the database and an `ADMIN_PASSWORD` of 16 or more characters exist. It asks for the password with HTTP Basic auth and compares SHA-256 hashes in constant time, behind the rate limit above. A second limit is kept in the database: after 10 wrong passwords from one address in an hour, that address is refused for the rest of the hour. The address is kept only as a keyed hash, deleted after two days. Each wrong password is logged (`admin_sign_in_failed`, with the path and a short request ID, never the password), and the 20th wrong password in any hour, from any addresses, sends Thomas an alert. Deleting a lead needs a `POST` that the browser marks as coming from this site (`Origin`, or `Sec-Fetch-Site: same-origin`), so another site can't delete through the browser's saved sign-in. The list sends its referrer within this site only, so a browser's `Origin` on that form is real rather than `null`. The CSV export puts `'` before any cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return, so a spreadsheet won't run it as a formula.
- **Delete link:** opening it only asks. Deleting takes a `POST` (the button, or a mail app's one-click unsubscribe), so a mail scanner that opens links deletes nothing.
- **Escaping:** visitor and AI text is HTML-escaped in every email and page the Worker writes.
- **Phone alerts** say only the kind of project, the ad and platform and, for a call, the time: never a visitor's name, email address or words.
- **Errors** return a generic `server_error`, never details, and the Worker doesn't log visitor text. Worker logs are on (`observability` in `wrangler.jsonc`), so errors and failed sign-ins can be read in the Cloudflare dashboard.
- **Bot check host:** a Turnstile pass counts only if Cloudflare says it was solved on this site's own hostname, so a token from another site using the same key is refused.
- **Secrets** (`RESEND_API_KEY`, `TURNSTILE_SECRET`, `ADMIN_PASSWORD`, `NTFY_TOPIC`, optionally `CAL_API_KEY` and `NTFY_TOKEN`) live only as Cloudflare Worker secrets, never in this repo. `GET /api/config` reports only which parts are on, plus the public Turnstile site key and Cal.com link. Preview versions from other branches are uploaded to the same Worker, but a request on a preview link (`*.workers.dev`) gets none of the secrets, the database or the AI (`envFor` in `worker/index.js`), so a preview can't reach a real lead, inbox, calendar or phone. `npm run deploy:preview` deploys a branch to a separate Worker, `wright-ai-solutions-preview`, that has none of them at all. One gap remains: saving a secret in the Cloudflare dashboard deploys the newest uploaded version, which can be a branch's, so only push Worker code you'd deploy.
- **Response headers:** `_headers` gives every static file a self-only Content-Security-Policy, HSTS, `nosniff`, a strict referrer policy and a restrictive permissions policy. `/start` alone widens two of them: its CSP also allows Cloudflare's Turnstile script and frame from `https://challenges.cloudflare.com`, and its permissions policy lets the page use the microphone for "Talk instead". The Worker sets its own (`worker/http.js`): `no-store`, HSTS and `nosniff`, plus a CSP that allows nothing for JSON and only this site for its pages. The browser tests check the static headers, and `tests/worker.spec.mjs` checks the Worker's.
- **CI:**
  - Every GitHub Action is pinned to a commit SHA.
  - The workflow token is read-only.
  - gitleaks is pinned and verified by checksum.
  - Dev tooling, including `wrangler`, is pinned in `package-lock.json` and never shipped to visitors. Dependabot (`.github/dependabot.yml`) opens a weekly pull request for npm and GitHub Actions updates, which must pass the same checks.
- **Deploys:** `.github/workflows/deploy-check.yml` confirms that production serves the latest `main` commit.
