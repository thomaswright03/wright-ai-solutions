# Compliance notes

The laws and licences that may apply to wright-ai-solutions.com, where each one came from, and what the site does about it. This is a working record, not legal advice. Anything marked **unverified** still needs checking, and the open questions at the end are for a lawyer.

**As of:** 2026-09-23 · **Owner:** Thomas Wright · **Review:** every six months, and whenever the site starts collecting anything (a form, analytics, cookies, an embed)

**What the site is:** a static marketing site for Wright AI Solutions LLC (Utah), hosted on Cloudflare Workers. It has no forms, accounts, cookies set by its own code, analytics or third-party scripts. Visitors make contact by email or phone. See `privacy.html` and `docs/PRIVACY-ROUTINE.md`.

## Laws and licences

The "Source" and "Read" columns come from the Legal Check (pass 1, 2026-09-23). Recheck them at each review.

| Law or licence | Where it applies | How it touches this site | What the site does | Source | Read |
|---|---|---|---|---|---|
| FTC Act §5; FTC Policy Statement on Advertising Substantiation (1984) | US federal | Numeric and performance claims need a reasonable basis before they're published | Hero stats count only what the page itself shows. Unbacked figures were removed. The outreach mockup is labelled "Sample data — not this client's real results" | ftc.gov/legal-library/browse/ftc-policy-statement-regarding-advertising-substantiation | 2026-09-23 |
| CalOPPA, Cal. Bus. & Prof. Code §22575(a) | California | Requires a privacy policy if the operator collects personally identifiable information online from California visitors. With no forms, arguably not triggered | A privacy notice is published anyway at `/privacy` and linked from every page | law.justia.com (2025 code); the official leginfo site was blocked by robots.txt | 2026-09-23 |
| Utah Consumer Privacy Act, Utah Code §13-61-102(1) | Utah | Applies only at $25M+ annual revenue plus 100,000 consumers (or 25,000 with over half of revenue from data sales). Very likely not met | Nothing required. Revenue **unverified** | le.utah.gov, version effective 2024-05-01 | 2026-09-23 |
| CCPA / CPRA | California | Depends on revenue and data-volume thresholds | Notice says data isn't sold or shared for advertising. Thresholds **unverified** | — | **unverified** |
| TCPA, 47 U.S.C. §227(b)(1)(A) | US federal | Relevant to the SMS lead-response agent built for a client, not to this site | Nothing on this site. Client contract question, see below | law.cornell.edu | 2026-09-23 |
| Utah Artificial Intelligence Policy Act (AI disclosure) | Utah | Relevant to the SMS agent if it talks to Utah consumers, not to this site | Nothing on this site | — | **unverified**, not read |
| Utah LLC naming and registration | Utah | The site calls the business "Wright AI Solutions LLC" | Registration **unverified**; to be confirmed with the Utah Division of Corporations | — | **unverified** |
| US Copyright Act, 17 U.S.C. | US federal | Reproducing an artist's work needs a licence or permission | Studio McKenna artwork is shown. Written permission is **not yet on file** | general principle | not read |
| SIL Open Font License 1.1 | Licence | Clause 2: each copy of the fonts must include the copyright notice and licence | `fonts/LICENSE-Inter.txt` and `fonts/LICENSE-SpaceGrotesk.txt` ship next to the fonts, and CI checks they're present | openfontlicense.org; upstream Inter `LICENSE.txt` and Space Grotesk `OFL.txt` | 2026-09-23 |

## Open items that need Thomas

- Confirm in a real browser that the live site serves the current `main` build.
- Rotate the credential that is still in this repo's public git history.
- Make the repository private or rewrite its history (see `docs/PRIVACY-ROUTINE.md`). Unlist the old Loom walkthrough.
- Get written permission from Studio McKenna (artwork and name) and from the lead-agent client (description of the work).
- Confirm the LLC registration.

## Questions for a lawyer

1. Data→Lead→Sell builds mailing lists from obituaries matched to property records. Do the source sites' terms allow this, and which state rules on mail to the bereaved or on probate solicitation apply?
2. For the client SMS agent under the TCPA and Utah's AI disclosure rules, who carries liability, the studio or the client, and does the contract say so?
3. A client's name and figures were published and remain in public git history. Does the client agreement restrict this, and is notice owed?
4. Is a privacy policy legally required for this site, or only advisable?
5. Are the two-year retention period and 30-day response time sensible for a one-person studio?
