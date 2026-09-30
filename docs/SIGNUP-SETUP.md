# Switching on /start

`/start` works from the first deploy: it writes an outline with Cloudflare Workers AI (or a fixed template), and for anything not connected yet it offers email and phone instead. Each part below switches on by itself once its account is connected, so they can be done in any order and nothing breaks in between. Run the ads in `docs/ADS.md` only once parts 1 to 4 are done.

Each account below has a free plan that's enough to start.

**Two kinds of values:**

- **Settings that aren't secret** go in `wrangler.jsonc`: the database ID, the bot-check *site* key, the Cal.com link and the postal address. Send them to whoever edits the repo, or add them yourself ([where each one goes](#where-the-settings-go)).
- **Secrets** never go in the repo, a chat or a URL: API keys, the bot-check *secret* key, the admin password and the ntfy topic. Add each one yourself in Cloudflare: dashboard → **Workers & Pages** → **wright-ai-solutions** → **Settings** → **Variables and Secrets** → **Add** → type **Secret** → enter the name exactly as written below → paste the value → **Deploy**.

## What switches on when

The first five rows follow `features()` in `worker/config.js`. The last two are checked where they're used (`worker/services.js` and `worker/db.js`).

| Part | On when | Until then |
|---|---|---|
| Saving (email the outline, add the lead to the list) | `DB` (part 1) and `RESEND_API_KEY` (part 3) | The outline shows with the email address and phone number instead of a save form |
| Booking | Saving is on, and `CAL_LINK` is a Cal.com event link (part 4) | Saving ends the flow, and the page says to reply to the outline email |
| Reminder email | Saving is on, and `POSTAL_ADDRESS` is set (part 6) | The reminder box isn't shown |
| Bot check | `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` (part 2) | Outlines are written without a bot check. The per-IP rate limit still applies |
| Leads list at `/admin` | `DB` and an `ADMIN_PASSWORD` of 16 or more characters (part 1) | `/admin` answers "Page not found" |
| Phone alerts | `NTFY_TOPIC` (part 5) | No alerts. The lead email still arrives |
| Daily counts per ad | `DB` (part 1) | Nothing is counted |

The AI outline needs nothing: Workers AI is already bound as `AI` in `wrangler.jsonc`, and when it can't answer, the outline comes from the matching template in `outlines.js`. About 90 outlines a day fit Workers AI's free daily allowance (the estimate in `worker/outline.js`). Past that, on the Workers Free plan, visitors get the template outline. Once the database is connected, the AI writes at most 300 outlines a day (`AI_DAILY_LIMIT`, below), which caps what a flood of requests could cost on the Paid plan.

## 1. Leads database (Cloudflare D1, about 2 minutes)

This holds your private leads list and the counts per ad.

1. Cloudflare dashboard → **Storage & databases** → **D1 SQL database** → **Create database**.
2. Name it exactly `wright-ai-solutions-leads` and create it.
3. Copy the **Database ID** (a long code of letters and numbers). It goes in `wrangler.jsonc` as the `DB` binding. The Worker creates its tables on first use, so there's no other setup.
4. Add a secret named `ADMIN_PASSWORD`: a passphrase of at least 16 characters (four random words works). Open your leads list at `wright-ai-solutions.com/admin`; the browser asks for the password, and any username works.

## 2. Bot check (Cloudflare Turnstile, about 3 minutes)

This stops bots from using up the free AI allowance or sending junk leads. Real visitors almost never see it.

1. In the Cloudflare dashboard, search for **Turnstile** → **Add widget**.
2. Name: `Start page`. Hostnames: add `wright-ai-solutions.com`, and the `workers.dev` subdomain your preview links use (the part of a preview link after `wright-ai-solutions.`) so previews work too. If Cloudflare won't accept the second one, skip it.
3. Widget mode: **Managed**. Create it.
4. Copy the **Site Key**. It goes in `wrangler.jsonc` as `TURNSTILE_SITE_KEY`.
5. Add the **Secret Key** as a secret named `TURNSTILE_SECRET`.

The bot check turns on only once both keys are set.

## 3. Email (Resend, about 10 minutes)

This emails each visitor their outline and sends you a copy of every lead. The free plan allows 100 emails a day and 3,000 a month. Each saved outline uses 2, and a reminder uses 1 more.

1. Sign up at `resend.com`.
2. **Domains** → **Add domain** → `wright-ai-solutions.com`.
3. Resend shows a few DNS records. If it offers to add them to Cloudflare for you, use that. Otherwise add each one in Cloudflare → your domain → **DNS** → **Add record**, copying the type, name and value exactly.
4. Back in Resend, click **Verify** (it can take a few minutes).
5. **API Keys** → **Create API key**, permission **Sending access**. Add it as a secret named `RESEND_API_KEY`. Resend shows it only once.

Emails come from `Thomas Wright <thomas@wright-ai-solutions.com>`, replies go to `t@thomasewright.com`, and lead copies go to `t@thomasewright.com`. If you'd like people to be able to email `thomas@wright-ai-solutions.com` directly too, turn on Cloudflare **Email Routing** for the domain and forward that address to `t@thomasewright.com` (optional).

## 4. Booking (Cal.com, about 10 minutes)

This shows your real open times on the page and books the call. Cal.com sends both of you the calendar invite, with reschedule and cancel links. Booking also needs saving (parts 1 and 3).

1. Sign up at `cal.com` (free plan) and connect the calendar you actually use, so busy times are blocked.
2. Set your working hours under **Availability**.
3. **Event Types** → **New**: title `Intro call`, length **15 minutes**. Pick how you'll meet (Cal Video works with no setup). Leave "Requires confirmation" **off**. Save.
4. Copy the event's link. It goes in `wrangler.jsonc` as `CAL_LINK`, and looks like `https://cal.com/yourname/intro-call`. Anything but a plain `cal.com` or `app.cal.com` event link leaves booking off.
5. Optional: add a Cal.com API key as a secret named `CAL_API_KEY`. Public events work without one, but a key gets a higher rate limit.

## 5. Optional: instant phone alerts (ntfy, about 3 minutes)

You'll already get the lead email and Cal.com's booking email on your phone. This adds a separate, instant push alert for each new lead and booking. It says what kind of project it is, which ad and platform it came from and, for a call, when it is. It never includes anyone's name, email address or words. Tapping it opens the leads list.

1. Install the **ntfy** app (App Store or Google Play).
2. Tap **+** and subscribe to a topic with a long, random name nobody could guess, like `wright-leads-` followed by 20 random letters. Anyone who knows the name can read or send these alerts, so treat it like a password.
3. Add that exact topic name as a secret named `NTFY_TOPIC`.

## 6. Optional: the next-day reminder email

For people who saved their outline, ticked "Send me one reminder tomorrow" and haven't booked a call through the page. It goes out once, between 9 and 11am in their time zone, 12 to 72 hours after they saved.

US law (CAN-SPAM) requires a valid physical postal address in commercial email, so this stays off until `POSTAL_ADDRESS` is set in `wrangler.jsonc`. The FTC's CAN-SPAM guide accepts a street address, a PO box registered with the Postal Service, or a private mailbox registered with a commercial mail receiving agency. The address appears at the bottom of the reminder, under its unsubscribe link, and at the bottom of the outline email too. Mail apps that support it also get a one-click unsubscribe. Both delete the lead (the link asks first).

## What's in the secrets list when you're done

| Secret name | Where it comes from | Needed for |
|---|---|---|
| `ADMIN_PASSWORD` | You make it up (16+ characters) | Your leads list (part 1) |
| `TURNSTILE_SECRET` | The Turnstile widget | The bot check (part 2) |
| `RESEND_API_KEY` | Resend | Saving and emails (part 3) |
| `CAL_API_KEY` | Cal.com | A higher Cal.com rate limit (part 4, optional) |
| `NTFY_TOPIC` | You make it up | Phone alerts (part 5, optional) |

## Where the settings go

Everything that isn't a secret goes in `wrangler.jsonc`, not the dashboard: on each deploy, Wrangler replaces variables set in the dashboard with the ones in the file. Pushing the change to `main` deploys it.

```jsonc
  // Part 1: add next to "ai".
  "d1_databases": [
    { "binding": "DB", "database_name": "wright-ai-solutions-leads", "database_id": "<Database ID from part 1>" }
  ],
  // Parts 2, 4 and 6: fill in the empty "vars".
  "vars": {
    "TURNSTILE_SITE_KEY": "<Site Key from part 2>",
    "CAL_LINK": "https://cal.com/<yourname>/intro-call",
    "POSTAL_ADDRESS": "<street or PO box, city, state ZIP>"
  },
```

Optional overrides also go in `vars`. Their defaults are in `worker/config.js`:

| Variable | Default | Used for |
|---|---|---|
| `EMAIL_FROM` | `Thomas Wright <thomas@wright-ai-solutions.com>` | The sender of every email |
| `REPLY_TO` | `t@thomasewright.com` | Where visitors' replies go |
| `LEADS_TO` | `t@thomasewright.com` | Where the copy of each lead goes |
| `OWNER_TZ` | `America/Denver` | The daily counts, times in `/admin` and phone alerts, and reminders when a visitor's time zone is unknown |
| `SITE_URL` | `https://wright-ai-solutions.com` | The delete link in reminder emails |
| `AI_DAILY_LIMIT` | `300` | How many outlines a day (UTC) the AI writes before visitors get the template outlines |
