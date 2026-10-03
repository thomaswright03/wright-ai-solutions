# What happens when things go wrong

Every realistic failure on `/start` and the leads list: what the visitor (or Thomas) sees, whether their work is kept, what is retried, what is logged, and the way forward. Each names the tests that check it, as `file: test title` in `tests/`; `tests/risks.spec.mjs` fails if one is renamed or removed.

**Logging.** An unexpected error on the server is logged as one JSON line (`level`, `ref`, `method`, `path`, `error`) in the Worker's logs (Cloudflare dashboard → Workers & Pages → `wright-ai-solutions` → Logs), and the visitor's error message shows the same short reference, so a visitor's report can be matched to the log line. The reference is Cloudflare's own Ray ID for the request when there is one. Failures the site expects (a service down, a bad request) aren't errors: they show the visitor what to do, and outside services are checked daily, and hourly while one is failing (`worker/health.js`).

Last reviewed 2026-10-02.

### 1. The AI is down, slow, out of its daily allowance, or replies with junk

The visitor gets the matching template outline straight away, labelled as such; nothing they typed is lost. Counted on `/admin` by reason.

- `site.spec.mjs: if the AI fails, is rate limited or sends junk, the template outline is shown`
- `worker.spec.mjs: falls back to the matching template when there is no AI, it throws, or the reply is unusable`
- `worker.spec.mjs: records how every outline was written, including why the template was used`

### 2. The AI's reply breaks a rule (a price, a promise, a link)

Replaced by the template before the visitor sees it.

- `worker.spec.mjs: an outline with a percentage is replaced, like a price`
- `worker.spec.mjs: an outline carrying any web address, handle or spelled-out domain is replaced; file names and libraries are fine`

### 3. The site's daily AI cap is reached, or Workers AI's free allowance is used up

Template outlines until the outlines of the last 24 hours fall back under the cap (both the cap and Workers AI's free allowance count the last 24 hours, not the UTC day; `docs/COST.md`); the visitor's flow is otherwise unchanged.

- `worker.spec.mjs: past the daily cap, outlines come from the templates without asking the AI`
- `worker.spec.mjs: the cap counts the last 24 hours, the way the free allowance does, not the calendar day`

### 4. The visitor sends too many requests in a minute

They're told to wait a minute; what they typed stays in the box.

- `worker.spec.mjs: a visitor over the rate limit gets 429 and the model is not called`
- `worker.spec.mjs: saving is rate limited per visitor`
- `worker.spec.mjs: a missing rate limit binding refuses requests instead of allowing them all, and is logged`
- `worker.spec.mjs: the counting stand-in refuses past the limit in wrangler.jsonc`

### 5. The bot check fails, or wants a tick

A visitor who fails still gets an outline, with email and phone instead of saving. When it wants a tick, the page says so and waits.

- `site.spec.mjs: a visitor who fails the bot check still sees an outline, with email and phone instead of saving`
- `site.spec.mjs: when the bot check wants a tick, the page says so and waits for it`

### 6. Saving or booking isn't switched on

The outline still shows, with Thomas's email and phone as the way forward.

- `site.spec.mjs: with nothing connected, the outline still shows, with email and phone instead of saving`

### 7. The outline email doesn't go out

The lead is kept and Thomas gets it anyway; the page says so; saving again sends the same email (Resend drops a repeat).

- `site.spec.mjs: if the email doesn't go out, the page says Thomas still has the details`
- `worker.spec.mjs: if the email doesn't go through, the lead is still kept, the page is told, and saving again sends it`

### 8. Saving is refused (a mistyped address, an expired outline, an inbox at its daily limit)

Each error says what to do next, and the form keeps what was typed.

- `site.spec.mjs: saving errors say what to do next`
- `worker.spec.mjs: checks the address, and says so when saving isn't switched on`

### 9. The calendar can't be reached

The booking step says so and links straight to Cal.com; the lead is not locked.

- `site.spec.mjs: if the calendar can't be reached, the booking step says so and links to Cal.com`
- `worker.spec.mjs: bad requests and a calendar outage don't book anything or lock the lead`

### 10. The time picked was just taken

The page says so and the visitor picks another.

- `worker.spec.mjs: a time someone else just took says so, and the visitor can pick another`

### 11. Cal.com books the call but its answer is lost

The lead stays "pending" so a retry can't book twice; the page says to check for the invite; Thomas gets a phone alert and settles it on `/admin`.

- `site.spec.mjs: when the calendar doesn't confirm a booking, the page says to check for the invite instead of booking again`
- `worker.spec.mjs: when Cal.com books the call but the reply is lost, a retry never books a second call`
- `site.spec.mjs: an unconfirmed booking can be freed from the leads list, and the visitor can then book from the page`

### 12. Other booking errors

Each says what to do next; a call already booked counts as booked.

- `site.spec.mjs: booking errors say what to do next, and a call already booked counts as booked`
- `worker.spec.mjs: a lead deleted in the meantime can't book`

### 13. A brief outage at Resend or Cal.com

Retried twice with growing, jittered waits, only where repeating is safe; a timeout is never retried, since the visitor has already waited.

- `worker.spec.mjs: a quick failure at Resend is tried again, and the email still goes once`
- `worker.spec.mjs: Cal.com open times are fetched again after a quick failure`
- `worker.spec.mjs: a booking is retried only when Cal.com said it took nothing in`

### 14. The reminder email fails to send

Tried again the next hour, while it's still morning for the visitor.

- `worker.spec.mjs: a reminder that fails to send is tried again the next hour`

### 15. The visitor reloads, closes the tab by mistake, or uses Back and Forward

What they typed and their outline are kept in the tab; Back and Forward move between steps.

- `site.spec.mjs: a reload keeps what the visitor was typing, until they build the outline`
- `site.spec.mjs: a reload on the outline keeps it, and Back still takes one press per step`
- `site.spec.mjs: a reload keeps the outline and the save form without writing it again, until it is saved`
- `site.spec.mjs: Back and Forward move between steps and keep what was typed`

### 16. The visitor goes back while the outline is still being written

The late reply is dropped instead of jumping them forward.

- `site.spec.mjs: going back while the outline is being written drops the late reply`

### 17. Speech-to-text fails or isn't allowed

The page says what to do (type instead, allow the microphone); typed text is kept.

- `site.spec.mjs: talking adds to what the visitor already typed, and errors say what to do`

### 18. Copying the email address to the clipboard fails

The address is shown to copy by hand.

- `site.spec.mjs: if copying fails, the contact hint shows the address to copy by hand`

### 19. A service key expires, or a service stops answering

The daily check shows it on `/admin`, sends Thomas a phone alert, and the live check after each deploy and every morning fails. The failed service is checked again every hour, so once it answers again the live check passes the same day. When the only failure is the AI's free allowance being used up, `/admin` says so, no alert goes out, and the live check warns rather than fails. If the phone alert service itself refuses, the alert goes to Thomas's email instead, and `/admin` says so next to the check.

- `worker.spec.mjs: a failing service is shown, alerted and published`
- `worker.spec.mjs: go by email when ntfy doesn't take them, and use the ntfy access token when there is one`
- `worker.spec.mjs: the daily check says when ntfy refuses and that alerts go by email instead`
- `worker.spec.mjs: a failed service is checked again each hour until it passes, without another alert`
- `worker.spec.mjs: a used-up AI allowance is reported as that, not as an outage, and clears when the allowance frees up`
- `site.spec.mjs: passes with nothing connected, and fails when the calendar is down`
- `site.spec.mjs: a used-up AI allowance is a warning, not a failure`

### 20. An unexpected error on the server

The visitor gets a plain message with a short reference and the way forward (email or phone); nothing internal is shown; the error is logged with the same reference.

- `worker.spec.mjs: an unexpected error answers 500 with a reference, and logs it with the same reference`

### 21. A database change meets the live leads list

New columns are added on first use, keeping every row, even when two copies of the Worker start at once.

- `worker.spec.mjs: a database from before a column was added gets it, keeping its rows, and the flow works on it`
- `worker.spec.mjs: two copies of the Worker starting at once both add the column without an error`

### 22. A link to `/start` with a broken ad name

The plain page opens without breaking.

- `site.spec.mjs: odd ?for= values fall back to the plain page without breaking it`
