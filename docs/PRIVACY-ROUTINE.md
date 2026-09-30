# Privacy routine

How Wright AI Solutions LLC keeps the promises in the privacy notice (`privacy.html`, served at `/privacy`). If this routine changes, update the notice in the same change, and the reverse.

**Owner:** Thomas Wright · **Written:** 2026-09-23 · **Updated:** 2026-09-30, for the `/start` leads list · **Next review:** 2027-03-23

## What the notice promises

| Promise in `privacy.html` | How it's kept (section below) |
|---|---|
| Inquiries are kept only in the email inbox and on the business phone, plus the leads list for outlines saved on `/start` | [Where inquiries live](#where-inquiries-live) |
| Inquiries that don't become projects are deleted within two years of the last contact, checked every three months | [Quarterly clean-up](#quarterly-clean-up) |
| Each entry in the leads list is deleted automatically a year after it was saved, and the daily counts after about 13 months | [The leads list](#the-leads-list) |
| The link in every email from `/start` deletes that visitor's entry in the leads list at once and cancels the reminder | [The leads list](#the-leads-list) |
| Access, correction and deletion requests get a reply within 30 days, saying what was done | [Handling a request](#handling-a-request) |
| Anything on the site that shows or identifies someone comes off the site on request | [Takedown from the site](#takedown-from-the-site) |
| On request, it's also removed from the public GitHub history | [Removal from git history](#removal-from-git-history) |
| A short record of each request is kept, without the deleted data | [Request log](#request-log) |

## Where inquiries live

- Email sent to t@thomasewright.com, in that mailbox only. This includes the "New lead" copy of each outline saved on `/start`.
- Calls and texts to (801) 580-8630, in that phone's call and message history only.
- Outlines saved on `/start` are also in the leads list (next section). A call booked there is also in Cal.com, which keeps its own record.

Inquiries aren't copied into a CRM, a spreadsheet or this repository. If that ever changes, add the new place here and to the notice. A spreadsheet downloaded from the leads list is a copy too: use it, then delete it, so the one-year deletion still holds.

## The leads list

Outlines saved on `/start` go in the leads list, a Cloudflare D1 database (`wright-ai-solutions-leads`) that only Thomas can open. Open it at `wright-ai-solutions.com/admin` with the `ADMIN_PASSWORD` (the browser asks for it; any username works). It shows:

- each saved outline, newest first (the latest 200): the email address, the name if they booked a call, what they wrote, the outline, which ad and platform they came from, and whether they booked a call or asked for a reminder
- visits, outlines, saves and bookings per ad for the last 30 days
- a link to download every lead as a spreadsheet (CSV)
- a **Delete this lead** button on each entry, which deletes it at once

The Worker also does these by itself:

- The Worker's hourly job deletes each lead a year (365 days) after it was saved, and daily counts after 400 days (about 13 months). It also deletes, after two days, the coded (hashed) form of each address an outline was emailed to, which is kept only to cap outline emails at 3 a day per inbox.
- The "Delete my details" link in every email from `/start` asks the visitor to confirm, then deletes their entry and cancels the reminder. It doesn't touch the copy in the mailbox or a call booked in Cal.com; the page it shows tells them how to have those removed.
- A reminder goes out at most once per lead, and only if they ticked the box and haven't booked a call through the page.

## Quarterly clean-up

On the first working day of January, April, July and October:

1. In the mailbox, search for inquiry threads (including "New lead" and "Corrected address" emails from `/start`) whose last message is more than two years old and that never became a project. Delete them, then empty the trash.
2. On the phone, delete calls and texts from those same people that are more than two years old.
3. Open `/admin` and check that the oldest lead (the last row of the CSV, or the last one listed if there are fewer than 200) was saved less than a year ago. If it's older, the hourly job isn't running: check the Worker's cron trigger in the Cloudflare dashboard, and delete the old leads with **Delete this lead**. Delete any leads spreadsheet downloaded since the last clean-up.
4. Add one line to the request log: the date, "quarterly clean-up", and how many threads were deleted.

Project records (contracts, invoices, project email) are kept for as long as the contract and tax record-keeping rules require. They aren't part of this clean-up.

## Handling a request

Requests come in by email, or by phone and are then confirmed by email.

1. **Log it** the day it arrives: the date and the type of request (access, correction, deletion or takedown).
2. **Check it's them.** Reply from the address or number the data belongs to. Don't send someone's data to a different address.
3. **Do it within 30 days** of the request:
   - **Access:** send a plain summary of what's held (emails, call and text history, their entry in the leads list, a call booked in Cal.com, any project records) and where it's held.
   - **Correction:** fix it everywhere it's held. An entry in the leads list can't be edited from `/admin`, so delete it and tell them.
   - **Deletion:** delete it from the mailbox, including the trash, and from the phone. If they saved an outline on `/start`, that includes the "New lead" email, which comes from the site's own address, so search for theirs. Also delete their entry in `/admin` (unless their own "Delete my details" link already has) and any downloaded spreadsheet that includes them. If they booked a call, ask them to cancel it with the link in their Cal.com invite, or cancel it in Cal.com yourself; Cal.com's own record then follows its policy. Anything that has to be kept for contract or tax reasons stays; tell them what stayed and why.
   - **Takedown:** follow the next two sections.
4. **Reply** saying what was done, then log the completion date.

## Takedown from the site

1. Remove or anonymize the material wherever it appears (search for the name in `index.html`, `outlines.js`, `start.js` and `assets/`), and open a PR.
2. Merge it once CI is green. Pushing to `main` deploys through Cloudflare Workers Builds (see `README.md`).
3. Load the live page in a normal browser to confirm the material is gone, then log it.

## Removal from git history

Only when the person asks for it, or when the material should never have been public. Rewriting history breaks existing clones, so this is always a deliberate step.

1. With a fresh mirror clone, run [`git filter-repo`](https://github.com/newren/git-filter-repo) to drop the file (`--path <file> --invert-paths`) or replace the text (`--replace-text`). Then force-push every branch and tag.
2. Ask GitHub Support to purge cached views of the old commits, and delete any forks you control.
3. If the repository doesn't need to be public, making it private also stops new downloads.
4. Tell the person that copies other people already downloaded or archived can't be recalled. The notice says the same.

## Request log

Keep the log **outside this repository**, in a private note or spreadsheet, because it's about real people. For each request record only:

| Date received | Type | Date completed | Notes (no personal data) |
|---|---|---|---|

Keep log entries for three years, then delete them.
