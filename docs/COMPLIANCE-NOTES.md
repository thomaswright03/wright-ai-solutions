# Compliance notes

The laws and licences that may apply to wright-ai-solutions.com, where each one came from, and what the site does about it. This is a working record, not legal advice. Anything marked **unverified** still needs checking, and the open questions at the end are for a lawyer.

**As of:** 2026-09-30 · **Owner:** Thomas Wright · **Review:** every six months, and whenever what the site collects or the services it uses change (a new form field, analytics, cookies, an embed, a new provider)

**What the site is:** a marketing site for Wright AI Solutions LLC (Utah), hosted on Cloudflare Workers. Most of it is static pages with no forms, accounts, cookies set by its own code, analytics or third-party scripts, and visitors can make contact by email or phone. The exception is `/start`, the ad landing page, backed by a small Worker. A visitor describes a problem and gets a project outline written by Cloudflare Workers AI (or a fixed template). If they choose, they save it by entering their email address, which puts it in a private leads list (Cloudflare D1) and emails it through Resend, with one reminder email if they ask for it. They can then book a call through Cal.com by giving their name. Thomas gets phone alerts through ntfy.sh with no personal data, and the page keeps daily counts per ad with nothing about who. Each part stays off until its account is connected (`docs/SIGNUP-SETUP.md`). See `privacy.html` (section "The Start a project page") and `docs/PRIVACY-ROUTINE.md`.

**Cloudflare Web Analytics:** the live-site check on 2026-09-24 found that Cloudflare injects its Web Analytics beacon (`static.cloudflareinsights.com/beacon.min.js`) into HTML served to browsers. It isn't in this repo. The site's CSP (`script-src 'self'` in `_headers`) blocks it, so no beacon runs, and the privacy notice says so. `/start` has its own CSP, which adds only `https://challenges.cloudflare.com` (the Turnstile bot check), so it blocks the beacon too. Browser tests check that both policies still exclude it. If a CSP is ever loosened to allow it, the privacy notice must change first.

**AI provider:** `/start` sends what the visitor types to Cloudflare Workers AI (Meta's Llama 3.3 70B, `MODEL` in `worker/outline.js`). Cloudflare's Workers AI data usage page says: "Cloudflare does not use your Customer Content to (1) train any AI models made available on Workers AI or (2) improve any Cloudflare or third-party services, and would not do so unless we received your explicit consent." (`https://developers.cloudflare.com/workers-ai/platform/data-usage/`, checked 2026-09-30.) The privacy notice relies on this, so recheck it at each review. The terms of the other services `/start` uses (Resend, Cal.com, ntfy.sh) haven't been read for this record (**unverified**).

## Laws and licences

The "Source" and "Read" columns come from the Legal Check (pass 1, 2026-09-23), updated on 2026-09-30 for `/start`. Recheck them at each review.

| Law or licence | Where it applies | How it touches this site | What the site does | Source | Read |
|---|---|---|---|---|---|
| FTC Act §5; FTC Policy Statement on Advertising Substantiation (1984) | US federal | Numeric and performance claims need a reasonable basis before they're published | Hero stats count only what the page itself shows. Unbacked figures were removed. The AI card describes how the agent works, with no figures. On `/start`, the AI is told not to give prices, time estimates or promised results, and a reply with a price or "guarantee" is replaced by a template. The ad copy in `docs/ADS.md` has no numbers or guarantees apart from the free 30-minute call | ftc.gov/legal-library/browse/ftc-policy-statement-regarding-advertising-substantiation | 2026-09-23 |
| CalOPPA, Cal. Bus. & Prof. Code §22575 | California | §22575(a) requires a privacy policy if the operator collects personally identifiable information online from California residents. `/start` collects email addresses and names, both listed in §22577(a), so a privacy notice is required | A privacy notice is published at `/privacy`, linked from every page and from the `/start` form. It now says how the site responds to Do Not Track signals (§22575(b)(5)) and that it doesn't let others track visitors across sites (§22575(b)(6)) | california.public.law (§22575, §22577) on 2026-09-30; law.justia.com (2025 code) on 2026-09-23. The official leginfo site was blocked by robots.txt | 2026-09-30 |
| CAN-SPAM Act, 15 U.S.C. §7704; FTC CAN-SPAM Rule, 16 CFR Part 316 | US federal | Commercial email must include a valid physical postal address and a clear way to opt out, honoured within 10 business days | The one opt-in reminder email carries the postal address from `POSTAL_ADDRESS`, an unsubscribe link and a one-click unsubscribe header. Both delete the lead as soon as they're used (the link asks first). Without an address, the reminder stays switched off. The outline email answers the visitor's own request. It has a delete link, and it carries the same postal address once `POSTAL_ADDRESS` is set, so it meets the commercial-email rules either way. Whether it counts as commercial is **unverified** | law.cornell.edu/uscode/text/15/7704; ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business | 2026-09-30 |
| Utah Consumer Privacy Act, Utah Code §13-61-102(1) | Utah | Applies only at $25M+ annual revenue plus 100,000 consumers (or 25,000 with over half of revenue from data sales). Very likely not met | Nothing required. Revenue **unverified** | le.utah.gov, version effective 2024-05-01 | 2026-09-23 |
| CCPA / CPRA | California | Depends on revenue and data-volume thresholds | Notice says data isn't sold or shared for advertising. Thresholds **unverified** | — | **unverified** |
| TCPA, 47 U.S.C. §227(b)(1)(A) | US federal | Relevant to the SMS lead-response agent built for a client, not to this site | Nothing on this site. Client contract question, see below | law.cornell.edu | 2026-09-23 |
| Utah Artificial Intelligence Policy Act (AI disclosure) | Utah | Relevant to the SMS agent if it talks to Utah consumers. `/start` has generative AI write each outline, so it may be relevant there too (**unverified**) | `/start` says an AI model writes the outline: next to the button, on the outline and in the email | — | **unverified**, not read |
| Utah LLC naming and registration | Utah | The site calls the business "Wright AI Solutions LLC" | Registration **unverified**; to be confirmed with the Utah Division of Corporations | — | **unverified** |
| US Copyright Act, 17 U.S.C. | US federal | Reproducing an artist's work needs a licence or permission | Studio McKenna artwork is shown. Written permission is **not yet on file** | general principle | not read |
| SIL Open Font License 1.1 | Licence | Clause 2: each copy of the fonts must include the copyright notice and licence | `fonts/LICENSE-Inter.txt` and `fonts/LICENSE-SpaceGrotesk.txt` ship next to the fonts, and CI checks they're present | openfontlicense.org; upstream Inter `LICENSE.txt` and Space Grotesk `OFL.txt` | 2026-09-23 |

## Open items that need Thomas

- Turn off Web Analytics (automatic setup) for wright-ai-solutions.com in the Cloudflare dashboard, so the beacon isn't injected at all. The live check on 2026-09-24 confirmed the live site serves the current `main` build.
- Make the repository private or rewrite its history (see `docs/PRIVACY-ROUTINE.md`). Unlist the old Loom walkthrough.
- Get written permission from Studio McKenna (artwork and name; `/start` also names the studio in its website outline) and from the lead-agent client (description of the work).
- Confirm the LLC registration.

## Questions for a lawyer

1. Data→Lead→Sell builds mailing lists from obituaries matched to property records. Do the source sites' terms allow this, and which state rules on mail to the bereaved or on probate solicitation apply?
2. For the client SMS agent under the TCPA and Utah's AI disclosure rules, who carries liability, the studio or the client, and does the contract say so?
3. A client's name and figures were published and remain in public git history. Does the client agreement restrict this, and is notice owed?
4. Now that `/start` collects email addresses and names, does the privacy notice cover everything CalOPPA §22575(b) asks for?
5. Are the two-year retention period for inquiries, the one-year period for `/start` leads and the 30-day response time sensible for a one-person studio?
6. Under CAN-SPAM, is the outline email a transactional or relationship message, or commercial (it carries the postal address only once `POSTAL_ADDRESS` is set)? Is the reminder email commercial, as the site treats it?
