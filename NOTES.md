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
| F8 | Test recipient without owning a fax number: faxbeep.com publishes free test numbers and shows the received fax online in ~1–2 min — but received faxes are PUBLIC for 30 days, so test pages only. HP (1-888-473-2963) and Canon (1-855-FX-CANON) test lines only confirm by faxing BACK, useless without a receive number | faxbeep.com, techrepublic.com/article/free-test-fax | 2026-07-25 |
| F9 | **Official API contract** (supersedes F2–F4 where they conflict): send fields are `file` (PDF/JPEG/PNG only, **max 4 MB**), `recipientNumber` (E.164, US+Canada only), **required** `senderName` + `senderEmail`; optional `sendEmail`, `coverNote` (≤500), `recipientName`, `subject`, `senderCompany`, `senderPhone`. Success `{ success, faxId, deliveryEmail }`. Status response `{ status, pages, completedAt, error, errorCode, errorType }`; terminal success is **`completed`**; `partial` exists; provider `unknown` = retry with backoff. Read-only `GET /api/v1/account/balance` and `/api/v1/faxes`. Rate limits: send 10/min·30/hr·500/day, status/balance 60/min·500/hr·2000/day; upstream (Sinch) status refresh ≤ every 10 s per fax. **Never auto-retry a send after timeout/500 — duplicate risk.** Sandbox: `fd_test_` keys, synthetic `fdtest_` faxes, isolated from live. Changelog: faxdrop.com/for-developers/changelog | FaxDrop's official AI-agent API doc, retrieved by Noah from the dashboard and pasted 2026-07-25 | 2026-07-25 |
| F10 | Corrections F9 forced: F2's field name was wrong (`to` → `recipientNumber`) and DOCX is NOT accepted (convert to PDF); F3's terminal wording `delivered` → `completed`; F4's "10/min all endpoints" was only the send limit — status polling is 60/min but capped by the 10 s upstream refresh. Code updated accordingly, same day | this ledger; commit history | 2026-07-25 |
| F11 | **Sandbox round-trip VERIFIED against FaxDrop's live servers**: `POST /api/send-fax` with `recipientNumber`/`senderName`/`senderEmail` → 200 `{ success, faxId: fdtest_… }`; `GET /api/v1/fax/{id}` → 200 `completed`. Balance on a test key → 400 (test/live isolation) | CI run 30168093917 (`checks` workflow, MyFax), 2026-07-25 | 2026-07-25 |

## Unverified / still open

- **The balance response's JSON keys** — a sandbox key gets 400 from
  `/api/v1/account/balance` (CI run 30168093917, 2026-07-25; test keys are
  isolated from live account data), so the shape stays unknown until checked
  once with the live key. Add the in-app "free faxes left" display then.
- **A real (live-key) fax** to a faxbeep test number — the final proof; spends
  one of the month's 2 free faxes, only on Noah's say-so.
- The **Telnyx adapter** is unexercised end-to-end (needs a paid account,
  R2 bucket, owned number). Treat as scaffolding until proven. Note it does
  not satisfy FaxDrop's cover-sheet fields — it has none.

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
- Later, maybe: in-app "free faxes left this month" from `/api/balance` (once
  the response keys are known), receive-a-fax (needs a number — monthly cost,
  Noah's call), page-count preflight so the free tier's 5-page cap never
  surprises, cover-note UI (the Worker already forwards `note` → `coverNote`).

## Project facts

- Nothing has shipped to users yet; no production deploy exists.
- 2026-07-25: app built from Noah's chat design, corrected (FaxDrop status
  endpoint, poll rate vs. rate limit, a11y contrast + targets), verified
  (worker self-test, headless journey walk, contrast gate, axe scan — all
  green), and moved into `njefferson/MyFax` on `main` + `staging`. The hub's
  temporary carrier branch (`claude/free-fax-pwa-c4bzw3`) is now redundant but
  could NOT be deleted from the session (git proxy 403s branch deletion) —
  Noah can remove it from the hub's Branches page in the GitHub UI, or any
  session can once the proxy allows it. Nothing links to it.
- **Deploys run from the HUB repo** (`deploy-myfax.yml` there, manual
  dispatch), because GitHub secrets don't cross repos and the hub holds the
  family's Cloudflare credentials (Noah's call, 2026-07-25). Inputs: branch
  (`staging` → staging.myfax.pages.dev preview, `main` → myfax.pages.dev) and
  which FaxDrop key the Worker gets (`test` sandbox / `live` / `skip`).
  Worker runtime secrets are pushed only when the hub also holds them —
  MyFax's own copies of those secrets serve its CI smoke test.

## Waiting on Noah (the durable signal)

1. ~~FaxDrop account + API keys~~ DONE 2026-07-25: `FAXDROP_API_KEY` and
   `FAXDROP_TEST_API_KEY` are set as repo secrets.
2. **Remaining repo secrets** (GitHub → MyFax → Settings → Secrets and
   variables → Actions): `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
   (same values as the hub's), `SENDER_EMAIL` (required by FaxDrop; receives
   delivery confirmations), and `ACCESS_CODE` (any string you choose — the
   same one you'll paste into the app's Relay settings).
3. Accept (or veto) the §1 deviation above — it's inherent to the product.
4. **On-device pass** (Doctrine §7) once the staging preview URL exists —
   nothing is promoted until your explicit "promote".
5. Repo metadata (§10): description / website / topics / social preview —
   exact values proposed in the session log; confirm each.
6. **First live fax** — burns one of the month's two free ones; say when.
