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

### Open item

Commits `8f395ac` and `651fb5f` contain a dashboard credential for a separate lead-responder system. As of 2026-09-23 it has **not been rotated**, so `secret-scan` fails on every run. Thomas needs to do steps 1–4 above.

## What the site does to stay safe

- **No server code:** the site is static files only, with no forms, accounts, database or runtime dependencies.
- **Response headers:** `_headers` sets a self-only Content-Security-Policy, HSTS, `nosniff`, a strict referrer policy and a restrictive permissions policy. The browser tests check that every response carries them.
- **CI:**
  - Every GitHub Action is pinned to a commit SHA.
  - The workflow token is read-only.
  - gitleaks is pinned and verified by checksum.
  - Dev tooling is pinned in `package-lock.json` and never shipped to visitors.
- **Deploys:** `.github/workflows/deploy-check.yml` confirms that production serves the latest `main` commit.
