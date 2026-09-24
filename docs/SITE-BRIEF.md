# Site brief

> **Draft, written 2026-09-23 from the site as it stands. Thomas to confirm or correct.** Once confirmed, replace this line with "Confirmed by Thomas Wright on <date>".

## Who it's for

Owners and managers of small and mid-sized businesses who are deciding whether to hire an outside builder for:

- AI agents and automation
- data pipelines
- a web app

They're usually not technical. They arrive from a referral, a search or a link to one of the products shown.

## What it must get them to do

**Get in touch** by email or phone with a short description of what they want built. Everything on the page either builds enough trust to make that step, or makes it easy.

It must also:

- make the offer clear within the first screen
- show real, shipped work rather than promises
- be honest: no figures that can't be backed up, and no client named without permission
- work on a phone as well as on a desktop

## What each section is for

| Section (`index.html`) | Job |
|---|---|
| Header (`.site-header`) | Name the studio. Link to each section and to contact from any page, and offer a light/dark choice |
| Hero (`.hero`) | Say in one line what the studio builds and for whom, and give two ways forward (see the work, start a project). The stats count only what the page shows |
| What we do (`#services`) | Name the three kinds of work, so a visitor can tell quickly whether their problem fits |
| Selected work (`#work`) | Prove the work is real: what was built and what problem it solved, with a live link where one exists |
| About (`#about`) | Say who they'd work with (one person, end to end) and what that means for them |
| Get in touch (`#contact`) | Make contact easy. Say what to send and when to expect a reply, with the email and phone one tap away |
| Footer (`.site-footer`) | Legal name, privacy notice, and contact details again |
| `privacy.html` | Say plainly what's collected and kept, and how to ask for removal (see `docs/PRIVACY-ROUTINE.md`) |
| `404.html` | Get someone who followed a bad link back to the homepage |

## How success is judged

Tracked outside the site, because the site has no analytics or forms by design:

- **Inquiries per month** that mention the site, counted from the inbox and phone during the quarterly clean-up (`docs/PRIVACY-ROUTINE.md`)
- **Share of inquiries that are a good fit** for the three kinds of work
- **Reply time** kept within what the contact section promises (two business days)

The site itself must also:

- pass the CI checks on every change
- serve the latest `main` commit in production (checked by `.github/workflows/deploy-check.yml`)

## Open questions for Thomas

- Is "within two business days" the reply time you actually keep? The contact section promises it.
- Is there a real, client-approved result for the AI Lead Response Agent that can replace the description of how it works?
- Is the audience English-speaking only, or are Spanish- or French-speaking clients worth a translated site?
