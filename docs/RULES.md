# Business rules, where they come from, and what checks them

Every place the site makes a business decision: what it sends, keeps, books, refuses or shows. Each rule names where it was promised or decided, the code that enforces it (all on the server, in `worker/`, so the page can't skip it), and the tests that check it. Tests are named as `file: test title` in `tests/`; the ones in `rules.spec.mjs` check the rule exactly at its limit, one step inside and one step past. `tests/risks.spec.mjs` fails if a test named here is renamed or removed.

Last reviewed 2026-10-02.

### 1. A saved outline is the one this site wrote, saved within 3 hours

- **Stated in:** `privacy.html` ("Writing your outline": the tab keeps it for up to three hours).
- **Enforced in:** `worker/leads.js` (`OUTLINE_TOKEN_AGE`, `verify` in `saveRoute`).
- `rules.spec.mjs: an outline can be saved for 3 hours after it was written, and not after`
- `worker.spec.mjs: only an outline this site wrote, recently, can be saved`
- `worker.spec.mjs: a token is only accepted exactly as it was written`

### 2. One saved outline is emailed at most three times; one inbox gets at most three outline emails a day

- **Stated in:** `privacy.html` ("If you save your outline": so the page can't be used to flood someone's inbox).
- **Enforced in:** `worker/leads.js` (`MAX_SENDS`, `INBOX_DAILY_LIMIT`, `takeInboxSend`).
- `rules.spec.mjs: a saved outline is emailed at most three times: once, then to two corrected addresses`
- `worker.spec.mjs: one inbox gets at most three outline emails a day, however the address is written`
- `worker.spec.mjs: saving the same outline twice is one lead and one email; a corrected address gets its own copy, a few times at most`

### 3. Every new lead reaches Thomas, even when the visitor's email fails

- **Stated in:** `docs/SITE-BRIEF.md` (the site's job is to get visitors in touch).
- **Enforced in:** `worker/leads.js` (`saveRoute`: the lead is kept first, Thomas's copy is sent with the visitor as Reply-To).
- `worker.spec.mjs: emails the outline to the visitor and a copy with their words to Thomas, and lists the lead`
- `worker.spec.mjs: if the email doesn't go through, the lead is still kept, the page is told, and saving again sends it`

### 4. The call can be booked from the page for 12 hours after saving

- **Stated in:** decided with Thomas for `/start` (`docs/SIGNUP-SETUP.md`, part 4).
- **Enforced in:** `worker/leads.js` (`BOOK_TOKEN_AGE`).
- `rules.spec.mjs: the call can be booked from the page for 12 hours after saving, and not after`

### 5. A call is booked at most 60 days ahead, at least 30 minutes from now, and only once per lead

- **Stated in:** `docs/SIGNUP-SETUP.md` (part 4, the 30-minute intro call on Cal.com).
- **Enforced in:** `worker/leads.js` (`bookRoute`: the time window and the claim on the lead; `slotsRoute`: the 30-minute lead time).
- `rules.spec.mjs: a call can be booked up to 60 days ahead, never in the past`
- `rules.spec.mjs: open times start at least 30 minutes from now`
- `worker.spec.mjs: books the call for the address that saved the outline, once`
- `worker.spec.mjs: when Cal.com books the call but the reply is lost, a retry never books a second call`

### 6. One reminder, only if asked for and not booked, mid-morning where the visitor is, the day after saving

- **Stated in:** `privacy.html` ("The reminder email": one email in the morning, your time, never a second one) and the page's "Send me one reminder tomorrow".
- **Enforced in:** `worker/leads.js` (`runSchedule`: 9:00 to 10:59 local, 12 to 72 hours after saving, claimed before sending).
- `rules.spec.mjs: the reminder goes out from 9:00 to 10:59 where the visitor is, between 12 and 72 hours after saving`
- `worker.spec.mjs: sends one reminder, mid-morning where the visitor is, only to people who asked and haven't booked`
- `worker.spec.mjs: no reminders without a postal address, and leads older than a year are deleted`

### 7. Leads are deleted a year after saving; counts after about 13 months; inbox counts after two days

- **Stated in:** `privacy.html` ("How long we keep it, and deleting it", "Counting visits to this page").
- **Enforced in:** `worker/leads.js` (`RETENTION_DAYS` and the deletes in `runSchedule`).
- `rules.spec.mjs: a lead is kept for a year after it was saved, then deleted`
- `worker.spec.mjs: how outlines were written is kept for about 13 months, like the visit counts`
- `worker.spec.mjs: the counts behind the daily caps are cleared out after two days`

### 8. The delete link deletes at once, but only when the visitor confirms

- **Stated in:** `privacy.html` ("Every email we send you from this page has a link to delete your details").
- **Enforced in:** `worker/leads.js` (`forgetRoute`: GET asks, POST deletes).
- `worker.spec.mjs: the link asks first, then deletes the lead`
- `worker.spec.mjs: a mail app's one-click unsubscribe deletes too`
- `worker.spec.mjs: a broken or forged link deletes nothing`

### 9. An outline never promises a price, a percentage, a guarantee, or carries a link or phone number

- **Stated in:** `docs/SITE-BRIEF.md` ("be honest: no figures that can't be backed up").
- **Enforced in:** `worker/outline.js` (`REJECT`, `hasDomain`, `hasPhoneNumber` in `validateOutline`).
- `worker.spec.mjs: an outline with a percentage is replaced, like a price`
- `worker.spec.mjs: an outline carrying any web address, handle or spelled-out domain is replaced; file names and libraries are fine`
- `worker.spec.mjs: a year range is not mistaken for a phone number`

### 10. The AI writes at most 300 outlines a day, and the site's own eval leaves visitors their share

- **Stated in:** `docs/SIGNUP-SETUP.md` (`AI_DAILY_LIMIT`), `docs/COST.md`.
- **Enforced in:** `worker/outline.js` (`underDailyCap`), `worker/eval.js` (`EVAL_ROOM`).
- `worker.spec.mjs: past the daily cap, outlines come from the templates without asking the AI`
- `worker.spec.mjs: leaves visitors their share of the daily AI allowance`

### 11. Only Thomas sees the leads list, with a password of 16 characters or more, and every change on it is recorded

- **Stated in:** `privacy.html` ("a database hosted by Cloudflare that only Thomas can open"), `docs/SIGNUP-SETUP.md` (part 1).
- **Enforced in:** `worker/config.js` (`features().admin`), `worker/admin.js` (`signedIn`, the same-site check on changes, `audit`).
- `rules.spec.mjs: the leads list opens only with a password of 16 characters or more`
- `worker.spec.mjs: asks for the password, and shows leads and counts once given`
- `worker.spec.mjs: deletes a lead only from its own page`
- `worker.spec.mjs: every change on the leads list is recorded, with when, but never the lead's details`

### 12. Phone alerts never carry a visitor's name, address or words

- **Stated in:** `privacy.html` ("Phone alerts").
- **Enforced in:** `worker/leads.js` (the `notify` calls in `saveRoute` and `bookRoute`).
- `worker.spec.mjs: books the call for the address that saved the outline, once`
- `worker.spec.mjs: emails the outline to the visitor and a copy with their words to Thomas, and lists the lead`

### 13. The lead agent's revenue on the home page is its contracts at $70 each

- **Stated in:** `docs/SITE-BRIEF.md` ("The stats count only what the page shows").
- **Enforced in:** `index.html` (the hero stat and the Work card), checked by test.
- `site.spec.mjs: the lead agent's revenue is its contracts at $70 each, and the hero shows the same figure`
