# Privacy routine

How Wright AI Solutions LLC keeps the promises in the privacy notice (`privacy.html`, served at `/privacy`). If this routine changes, update the notice in the same change, and the reverse.

**Owner:** Thomas Wright · **Written:** 2026-09-23 · **Next review:** 2027-03-23

## What the notice promises

| Promise in `privacy.html` | How it's kept (section below) |
|---|---|
| Inquiries are kept only in the email inbox and on the business phone | [Where inquiries live](#where-inquiries-live) |
| Inquiries that don't become projects are deleted within two years of the last contact, checked every three months | [Quarterly clean-up](#quarterly-clean-up) |
| Access, correction and deletion requests get a reply within 30 days, saying what was done | [Handling a request](#handling-a-request) |
| Anything on the site that shows or identifies someone comes off the site on request | [Takedown from the site](#takedown-from-the-site) |
| On request, it's also removed from the public GitHub history | [Removal from git history](#removal-from-git-history) |
| A short record of each request is kept, without the deleted data | [Request log](#request-log) |

## Where inquiries live

- Email sent to t@thomasewright.com, in that mailbox only.
- Calls and texts to (801) 580-8630, in that phone's call and message history only.

Inquiries aren't copied into a CRM, a spreadsheet or this repository. If that ever changes, add the new place here and to the notice.

## Quarterly clean-up

On the first working day of January, April, July and October:

1. In the mailbox, search for inquiry threads whose last message is more than two years old and that never became a project. Delete them, then empty the trash.
2. On the phone, delete calls and texts from those same people that are more than two years old.
3. Add one line to the request log: the date, "quarterly clean-up", and how many threads were deleted.

Project records (contracts, invoices, project email) are kept for as long as the contract and tax record-keeping rules require. They aren't part of this clean-up.

## Handling a request

Requests come in by email, or by phone and are then confirmed by email.

1. **Log it** the day it arrives: the date and the type of request (access, correction, deletion or takedown).
2. **Check it's them.** Reply from the address or number the data belongs to. Don't send someone's data to a different address.
3. **Do it within 30 days** of the request:
   - **Access:** send a plain summary of what's held (emails, call and text history, any project records) and where it's held.
   - **Correction:** fix it everywhere it's held.
   - **Deletion:** delete it from the mailbox, including the trash, and from the phone. Anything that has to be kept for contract or tax reasons stays; tell them what stayed and why.
   - **Takedown:** follow the next two sections.
4. **Reply** saying what was done, then log the completion date.

## Takedown from the site

1. Remove or anonymize the material in `index.html` or `assets/`, and open a PR.
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
