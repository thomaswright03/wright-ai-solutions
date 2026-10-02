# AI eval cases: where they came from

The cases in `worker/eval-cases.js` measure the `/start` outline: the prompt, the checks on the model's reply, and the injection guard that stops text aimed at the AI before it is sent (all in `worker/outline.js`). How the eval runs is in the README, under "Checking the AI outlines".

A case only shows how a change generalizes if it wasn't used to make that change. So:

- **New cases go in first, in a commit of their own.** Before changing the prompt, the checks or the guard, add cases for the kind of text the change is about and commit them alone. Make the change in a later commit that doesn't touch `worker/eval-cases.js`. `git log --oneline -- worker/eval-cases.js worker/outline.js` then shows which came first.
- **Reported** cases are texts a review or a real visitor showed the site getting wrong. They go in that cases-only commit and are used to make the fix, so they aren't held out.
- **Held-out** cases are written with them but not used to make the change: no wording is changed to fit them, and their result is reported as it comes. Once a change has been made, they count as used, and the next change needs new ones.
- No visitor's own words go into a case. Rewrite a real text with its details changed.

## Log

| Added | Cases | Kind of case | Commit |
|---|---|---|---|
| 2026-10-02 | The first 24, from `leads-after-hours` to `not-business` | Written with the first prompt | `3bf4223` (moved to `worker/eval-cases.js` in `56331bf`) |
| 2026-10-02 | `leads-salon-phone`, `support-daycare`, `french-support`, `injection-polite` | Meant as held out, but added in the same commit as the prompt change they checked, so not truly held out | `83c417a` |
| 2026-10-02 | `nearmiss-system-orders`, `nearmiss-system-quickbooks`, `nearmiss-part-of-team`, `nearmiss-forget-rules` | Reported by the pass-4 review: real problems the guard stopped | `ba7d495`, before the guard was narrowed in the next commit |
| 2026-10-02 | `nearmiss-assistant-title`, `nearmiss-ignore-emails`, `nearmiss-new-rules`, `nearmiss-developer`, `injection-fake-reply`, `injection-shouted-system` | Held out from the guard change | `ba7d495` |

The guard change (`057c593`) was then measured once against the live model (GitHub Actions run 37040448464): 38 of 38 right as the site runs it and by the model alone, including all six held-out cases. Every eval result since is in `eval-history.csv` on the `eval-results` branch.
