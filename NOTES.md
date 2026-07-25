# NOTES.md — MyFax (source of truth)

Repo: `njefferson/MyFax`. The app's product name on screen is **Fax Relay**;
the Cloudflare Pages project is `myfax` (→ myfax.pages.dev).

Read this first, every session. Doctrine: hub repo `DOCTRINE.md`.

## Thesis

Free fax from the phone in your pocket. No fax machine, no Staples run, no
$9.99/month eFax subscription for the two faxes a year that healthcare, legal,
and government offices still demand. One screen: file, number, Send, and a
transmission tape that tells the truth about what happened.

## Architecture (settled)

Static PWA (Cloudflare Pages) → relay Worker (holds the provider key, streams
the document through, stores nothing) → provider adapter. Two adapters behind
one contract (`send`/`status`, normalized statuses `queued | sending |
delivered | failed | unknown`): **faxdrop** (default) and **telnyx** (metered
fallback via R2-staged media URL). Access code header keeps the relay from
being an open fax gun. Offline sends are held in IndexedDB and drained on
reconnect (Background Sync where available, `online` listener otherwise).

## Verified-facts ledger

Promoted only with a locator, per the family evidence discipline.

| # | Fact | Source / locator | Date |
|---|------|------------------|------|
| F1 | FaxDrop is a real service; free tier = 2 faxes/month, each ≤ 5 pages **including a forced cover page**; no card required | faxdrop.com `/free-fax`, `/for-developers` (via search excerpts; site blocks direct fetch from this sandbox) | 2026-07-25 |
| F2 | Send endpoint: `POST /api/send-fax`, multipart, `X-API-Key` auth; accepts PDF/DOCX/JPEG/PNG | faxdrop.com `/for-developers`, `/blog/fax-api-guide` | 2026-07-25 |
| F3 | Status endpoint: `GET /api/v1/fax/{id}`, `X-API-Key`; response has `id`, `status`, `recipientNumber`, `pages`, `completedAt`, `error` on failure | faxdrop.com `/blog/fax-for-ai-agents` (API example) | 2026-07-25 |
| F4 | API rate limits: 10/min, 100/hr, 500/day — status polls count toward them (hence the 8s poll spacing in `app.js`) | same as F3 | 2026-07-25 |
| F5 | Paid price $1.99/fax or volume credits; credits don't expire | faxdrop.com `/for-developers` | 2026-07-25 |
| F6 | Twilio Programmable Fax is dead (sunset 2021-12-17); ignore tutorials built on it | Twilio changelog (well-established) | 2026-07-25 |
| F7 | Free tier includes API access: sign in with Google → account dashboard → "API Keys" → Generate New Key; key shown ONCE at creation; up to 3 active keys | faxdrop.com `/for-developers` (via search excerpt) | 2026-07-25 |

## Unverified / needs a live key

- The FaxDrop **send + status round-trip has never been exercised** against a
  real API key. `tools/worker-selftest.mjs` proves the Worker's own logic with
  a stubbed provider; the first live send is the real test. It spends one of
  the month's 2 free faxes — ask Noah before burning one.
- **File-size ceiling**: the relay enforces 10 MB; FaxDrop's free *web* page
  advertises 4 MB. The API's actual limit is unconfirmed — expect the provider
  to reject large files with its own error (surfaced honestly in the tape).
- The **Telnyx adapter** is unexercised end-to-end (needs a paid account,
  R2 bucket, owned number). Treat as scaffolding until proven.
- Exact **status vocabulary** FaxDrop emits mid-flight (`mapStatus` covers the
  plausible set and falls through to `unknown`, never guessing `delivered`).

## Doctrine §1 deviation (accepted, bounded)

Faxing cannot be local-first: the document transits the relay and the carrier.
Bounds: relay stores nothing; FaxDrop deletes on transmission end (their
published claim — F1 source); history/settings live only in the browser; no
analytics, no server-side anything else. Stated in the app footer. Never widen
this.

## Roadmap

- **1.0.0 (staged)** — first release: single send, tape, activity log, offline
  queue, relay settings. Awaiting: repo secrets → deploys, live-key test,
  Noah's on-device pass, hub wiring after promote.
- Wire the hub link (hub → app) once the app is live — the hub should never
  link to a 404.
- Later, maybe: receive-a-fax (needs a number — monthly cost, Noah's call),
  page-count preflight so the free tier's 5-page cap never surprises,
  cover-note field (FaxDrop accepts `includeCover`).

## Project facts

- Nothing has shipped to users yet; no production deploy exists.
- 2026-07-25: app built from Noah's chat design, corrected (FaxDrop status
  endpoint, poll rate vs. rate limit, a11y contrast + targets), verified
  (worker self-test, headless journey walk, contrast gate, axe scan — all
  green), and moved into `njefferson/MyFax` on `main` + `staging`. The hub's
  temporary carrier branch (`claude/free-fax-pwa-c4bzw3`) was deleted after
  the move.
- Deploys are CI-driven (`.github/workflows/deploy.yml`, mirroring the hub's):
  `staging` → Pages preview (staging.myfax.pages.dev), `main` →
  myfax.pages.dev production + the relay Worker — all skipped gracefully until
  the repo secrets below exist.

## Waiting on Noah (the durable signal)

1. **FaxDrop account**: sign up at faxdrop.com and copy the API key from the
   dashboard. Free tier = 2 faxes/month, ≤ 5 pages each incl. their forced
   cover page.
2. **Repo secrets** (GitHub → MyFax → Settings → Secrets and variables →
   Actions): `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (same values
   as the hub's), `FAXDROP_API_KEY`, and `ACCESS_CODE` (any string you choose —
   the same one you'll paste into the app's Relay settings).
3. Accept (or veto) the §1 deviation above — it's inherent to the product.
4. **On-device pass** (Doctrine §7) once the staging preview URL exists —
   nothing is promoted until your explicit "promote".
5. Repo metadata (§10): description / website / topics / social preview —
   exact values proposed in the session log; confirm each.
6. **First live fax** — burns one of the month's two free ones; say when.
