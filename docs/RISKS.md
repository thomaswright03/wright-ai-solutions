# Top 20 business risks, and what catches each

The risks to the business that the site and `/start` could cause, most serious first, each with the check that would catch it. A check is a Playwright test (named as `file: test title`, in `tests/`), a CI step (in `.github/workflows/ci.yml`), a workflow, or a phone alert from the site itself. `tests/risks.spec.mjs` fails if a test named here is renamed or removed, so this list can't quietly go out of date. `scripts/mutation-check.mjs` breaks the code behind each risk in turn (`tests/mutations.mjs`) and fails unless that risk's own tests catch it, so each test listed is shown to fail when its risk happens, not just to run.

Last reviewed 2026-10-02.

### 1. A lead is lost, or never reaches Thomas

A visitor saves their outline but the email fails or the save breaks, and the enquiry is gone.

- `worker.spec.mjs: emails the outline to the visitor and a copy with their words to Thomas, and lists the lead`
- `worker.spec.mjs: if the email doesn't go through, the lead is still kept, the page is told, and saving again sends it`
- `site.spec.mjs: if the email doesn't go out, the page says Thomas still has the details`
- `site.spec.mjs: a visitor goes from one answer to a saved outline and a booked call, and only talks to this site`

### 2. A visitor is booked twice

Cal.com books the call, the reply is lost, and a retry books a second one.

- `worker.spec.mjs: when Cal.com books the call but the reply is lost, a retry never books a second call`
- `worker.spec.mjs: a booking is retried only when Cal.com said it took nothing in`
- `worker.spec.mjs: books the call for the address that saved the outline, once`

### 3. A booking stuck as unconfirmed costs the lead

Cal.com never clearly answers, and the visitor can neither book again nor be followed up.

- `worker.spec.mjs: an unconfirmed booking shows on the leads list with the time asked for`
- `worker.spec.mjs: marking it booked keeps the time asked for and counts the booking`
- `worker.spec.mjs: marking it not booked lets the visitor book from the page again`
- `site.spec.mjs: an unconfirmed booking can be freed from the leads list, and the visitor can then book from the page`
- `site.spec.mjs: when the calendar doesn't confirm a booking, the page says to check for the invite instead of booking again`

### 4. The calendar is down and visitors can't book

- `site.spec.mjs: if the calendar can't be reached, the booking step says so and links to Cal.com`
- `worker.spec.mjs: bad requests and a calendar outage don't book anything or lock the lead`
- `site.spec.mjs: passes with nothing connected, and fails when the calendar is down` (the live check after each deploy and every morning)
- `worker.spec.mjs: a failing service is shown, alerted and published` (the daily service check)

### 5. A brief outage at Resend or Cal.com drops an email or a booking

- `worker.spec.mjs: a quick failure at Resend is tried again, and the email still goes once`
- `worker.spec.mjs: Cal.com open times are fetched again after a quick failure`
- `worker.spec.mjs: a booking is retried only when Cal.com said it took nothing in`
- `worker.spec.mjs: a reminder that fails to send is tried again the next hour`

### 6. A service key expires or is revoked and nobody notices

- `worker.spec.mjs: checks each service once a day, sends nothing, and publishes only which passed`
- `worker.spec.mjs: a failing service is shown, alerted and published`
- `worker.spec.mjs: a failed service is checked again each hour until it passes, without another alert`
- `worker.spec.mjs: a sending-only Resend key passes, and services that are off are left out`
- `worker.spec.mjs: go by email when ntfy doesn't take them, and use the ntfy access token when there is one`
- `worker.spec.mjs: the daily check says when ntfy refuses and that alerts go by email instead`

### 7. Made-up promises, prices or figures, from the AI or on the site

An outline that promises a result, quotes a price or links elsewhere, or a figure on the site that isn't real, could mislead a buyer.

- `worker.spec.mjs: an outline with a percentage is replaced, like a price`
- `worker.spec.mjs: an outline carrying any web address, handle or spelled-out domain is replaced; file names and libraries are fine`
- `worker.spec.mjs: falls back to the matching template when there is no AI, it throws, or the reply is unusable`
- `site.spec.mjs: the AI card describes the agent without made-up figures`
- `site.spec.mjs: the lead agent's revenue is its contracts at $70 each, and the hero shows the same figure`

### 8. Prompt injection makes the AI write someone else's content on the site

- `worker.spec.mjs: text aimed at the AI gets the template without the AI being asked, and is counted as such`
- `worker.spec.mjs: cleans control characters and the prompt markers out of the visitor text`
- The injection cases in `worker/eval-cases.js`, scored with and without the guard by `.github/workflows/eval-outlines.yml`

### 9. The injection guard turns real customers away

A real problem that happens to read like an instruction gets the weaker template outline.

- `worker.spec.mjs: the injection guard leaves real problems alone`
- The near-miss cases in `worker/eval-cases.js` (`docs/EVAL-CASES.md`)

### 10. AI outline quality slides after a model or prompt change

- `worker.spec.mjs: keeps the last few runs, and alerts Thomas when the score drops, even above the bar`
- `worker.spec.mjs: cases the model gets wrong are listed, and Thomas is alerted when it falls below the bar`
- `worker.spec.mjs: a changed model, prompt or set of cases starts a new run, and the old result says it is out of date`
- `worker.spec.mjs: records how every outline was written, including why the template was used`

### 11. AI costs run away, or visitors find the free allowance used up

- `worker.spec.mjs: past the daily cap, outlines come from the templates without asking the AI`
- `worker.spec.mjs: leaves visitors their share of the daily AI allowance`
- `worker.spec.mjs: a visitor over the rate limit gets 429 and the model is not called`

### 12. Bots flood /start with fake leads

- `worker.spec.mjs: with the bot check on, only a visitor Cloudflare vouches for gets an outline`
- `site.spec.mjs: a visitor who fails the bot check still sees an outline, with email and phone instead of saving`
- `worker.spec.mjs: saving is rate limited per visitor`
- `worker.spec.mjs: a missing rate limit binding refuses requests instead of allowing them all, and is logged`
- `site.spec.mjs: fails when the per-address rate limit lets a burst through`

### 13. The site is used to send unwanted email to someone's inbox

- `worker.spec.mjs: one inbox gets at most three outline emails a day, however the address is written`
- `worker.spec.mjs: only an outline this site wrote, recently, can be saved`
- `worker.spec.mjs: a token is only accepted exactly as it was written`

### 14. The leads list is exposed

- `worker.spec.mjs: is hidden until the database and a long password are set`
- `worker.spec.mjs: asks for the password, and shows leads and counts once given`
- `worker.spec.mjs: slows down password guessing`
- `worker.spec.mjs: wrong passwords shut out an address for an hour, even without the rate limit binding's help, and are logged without the password`
- `worker.spec.mjs: a burst of wrong passwords from many addresses alerts Thomas once`
- `worker.spec.mjs: deletes a lead only from its own page`
- `site.spec.mjs: passes on a working site, and only reads` (the live check confirms `/admin` asks for its password)

### 15. A request to delete someone's details isn't honoured, or data is kept too long

- `worker.spec.mjs: the link asks first, then deletes the lead`
- `worker.spec.mjs: a mail app's one-click unsubscribe deletes too`
- `worker.spec.mjs: a broken or forged link deletes nothing`
- `worker.spec.mjs: no reminders without a postal address, and leads older than a year are deleted`

### 16. The reminder email breaks anti-spam rules

- `worker.spec.mjs: no reminders without a postal address, and leads older than a year are deleted`
- `worker.spec.mjs: sends one reminder, mid-morning where the visitor is, only to people who asked and haven't booked`
- `worker.spec.mjs: the reminder carries the same delete link as the outline email`

### 17. A visitor's words run as code on the site, on /admin or in the spreadsheet

- `site.spec.mjs: what the visitor types is shown as text, never run as markup`
- `worker.spec.mjs: downloads as a spreadsheet that can't run formulas`
- `site.spec.mjs: every response carries the security headers from _headers`
- `worker.spec.mjs: every response is uncacheable JSON with the security headers`

### 18. A broken change goes live, or production quietly serves an old version

- `ci.yml: browser-tests`, `ci.yml: html-validate`, `ci.yml: link-check` and `ci.yml: static-checks`, required before merging to `main`
- `ci.yml: lint` (strict lint, types and dead code) and `ci.yml: mutation-check`, to be added to the required checks
- `site.spec.mjs: passes on a working site, and only reads` (`.github/workflows/deploy-check.yml` runs it against production after each deploy and every morning, after checking `/version.txt`)

### 19. A database change breaks the live leads list

- `worker.spec.mjs: a database from before a column was added gets it, keeping its rows, and the flow works on it`
- `worker.spec.mjs: two copies of the Worker starting at once both add the column without an error`

### 20. Visitors who use a keyboard, a screen reader or a small screen can't get through

- `site.spec.mjs: the first Tab reaches a skip link that jumps to the main content`
- `site.spec.mjs: home page headings never skip a level`
- `site.spec.mjs: every visible link and button on every page is at least 24px tall`
- `site.spec.mjs: the booking step fits a phone screen, even after picking the last day`
- `site.spec.mjs: links that open a new tab say so to screen readers`

## Not caught by a test

- **The leaked credential in git history.** Rotated by Thomas on 2026-10-03; its dead findings are in `.gitleaksignore`, and `ci.yml: secret-scan` fails on any other secret (`SECURITY.md`).
- **Real devices and screen readers.** The browser tests use desktop Chromium at several widths; nobody has tested with VoiceOver, TalkBack or a real phone.
- **Whether the outlines win work.** The counts on `/admin` show saves and bookings per ad, but not which calls became clients.
