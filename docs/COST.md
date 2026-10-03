# What the site costs to run, and why each choice is the cheap one that's good enough

Last reviewed 2026-10-02. Prices are from Cloudflare's and each service's public price lists at that date; check them again before relying on a figure.

## Spend caps

| What | Cap | Where |
|---|---|---|
| AI outlines written by the site | 300 a day (UTC), then templates | `AI_DAILY_LIMIT`, `worker/outline.js` `underDailyCap` |
| AI outlines per visitor | 5 a minute per IP per Cloudflare location | `OUTLINE_LIMIT` in `wrangler.jsonc` |
| The site's own AI eval | only on a day with fewer than 40 outlines so far, 12 cases an hour | `EVAL_ROOM`, `EVAL_BATCH` in `worker/eval.js` |
| The daily service check | 5 tokens of AI a day | `worker/health.js` |
| The GitHub AI eval | on demand only (about 40 outlines a run) | `.github/workflows/eval-outlines.yml` |
| Outline emails | 3 per saved outline, 3 per inbox per day | `worker/leads.js` |
| Reminder emails | at most 50 per hourly run, one per lead | `worker/leads.js` |

On the Workers Free plan nothing can be billed: past Workers AI's free 10,000 neurons a day the AI stops answering and visitors get template outlines. On the Paid plan the 300-a-day cap bounds the AI at roughly 300 × 110 neurons ≈ 33,000 neurons, about $0.25 a day at $0.011 per 1,000 neurons beyond the free allowance (inferred from Cloudflare's price list, not measured on a bill).

**The free allowance is shared.** Visitors, the site's own eval, the daily check and the GitHub eval all draw on the same 10,000 neurons, about 90 outlines. The GitHub eval spends outside the site's budget, which is why it no longer runs on every merge: on 2026-10-02 two runs used the whole day's allowance by 17:51 UTC and visitors got templates for the rest of the day. Run it at most once a day, or give it its own Cloudflare account. The allowance also seems to count the last 24 hours rather than reset at midnight UTC: on 2026-10-03 the dashboard showed 0 of 10,000 used "today", yet Workers AI kept refusing until the previous day's runs were 24 hours old.

## Model choice

| Job | Model | Why |
|---|---|---|
| The `/start` outline | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (Workers AI) | Follows the JSON schema and the refusal rules; 38/38 on the eval (run 37040448464). Runs inside Cloudflare, so what visitors type never goes to another company |
| Speech to text | the visitor's browser | Free, and the site never receives audio |
| Everything else (validation, kind, guard, templates) | no model | Plain code: free, instant and exact |

**Is a cheaper model good enough?** `scripts/eval-outlines.mjs --model=<id>` (or the GitHub eval's "model" box) runs the same 38 cases, with the site's prompt and checks, against another model, and records the result with that model's name. A model replaces the 70B one only if it scores 90% or more both ways, as the site runs it and by the model alone. Record each comparison in the table below.

The 8B model, about 5 times the free outlines a day, fell well short: it turned away real requests as unusable (a vague one, a typo, a salon's phone problem, two near-misses) and broke the site's rules on others (rejected). The 70B model stays.

| Date | Model | Site | Model alone | Kind right | Decision |
|---|---|---|---|---|---|
| 2026-10-02 | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | 38/38 | 38/38 | 25/25 | In use |
| 2026-10-03 | `@cf/meta/llama-3.1-8b-instruct-fast` | 25/38 | 25/38 | 13/14 | Not good enough (run 37143545353) |

## Caching

| What | Cached | Why |
|---|---|---|
| Open times from Cal.com | 60 seconds per hour-aligned window, at Cloudflare's edge | Every visitor in a minute shares one Cal.com call |
| The visitor's outline | in their own browser tab until they save it or close the tab | A reload or Back never asks the AI again |
| Static pages, CSS and JS | per `_headers`; fonts a year, images 30 days, versioned `?v=` | Repeat visits load almost nothing |
| AI outlines on the server | **not cached, on purpose** | The privacy notice promises nothing is stored on the server when an outline is written. Identical problems rarely repeat, so a cache would save little and break that promise |

## Dead code

`npm run lint` (ESLint, no warnings allowed) fails on unused variables, imports and parameters, and `npm run deadcode` (knip) fails on unused files, exports and dependencies. Both run in CI (`.github/workflows/ci.yml`, the "lint" job).
