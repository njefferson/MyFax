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
- First staging deploy 2026-07-25 (hub run 30168604377): Pages project
  `myfax` created, **staging.myfax.pages.dev is live** (PWA only, sandbox
  can't verify rendered page — pages.dev blocked from sessions). The Worker
  step FAILED: the hub's `CLOUDFLARE_API_TOKEN` is Pages-scoped, no Workers
  permission (auth error 10000). Noah chose a SECOND token (2026-07-25):
  the workflow now deploys the Worker with `CLOUDFLARE_WORKER_API_TOKEN`
  (scope: Account → Workers Scripts → Edit, nothing else) and skips Worker
  steps cleanly until that hub secret exists — the Pages token is never
  widened. Waiting on Noah: create that token at
  dash.cloudflare.com/profile/api-tokens and add it to the HUB's secrets,
  along with `FAXDROP_TEST_API_KEY`, `SENDER_EMAIL`, `ACCESS_CODE` (values
  already in MyFax's secrets) so the workflow can push the Worker's runtime
  secrets. Then re-dispatch Deploy MyFax. Until then the app shows
  "Not linked" — which is the truth.

## Session handoff — read this first (written 2026-07-25, end of build session)

State: 1.0.0 is staged and CI-green (worker self-test, journey walk, contrast
gate, axe, FaxDrop sandbox smoke). Deploy-MyFax run #2 (hub run 30169155736,
2026-07-25 18:12 UTC) was FULLY GREEN: staging.myfax.pages.dev live, and the
relay Worker deployed at **https://fax-relay.noah-jefferson.workers.dev**
(vars PROVIDER/ALLOWED_ORIGIN/SENDER_NAME confirmed in the log). The Worker
has NO runtime secrets yet — the push step reported "hub has no value for"
all three. Consequence: sends fail loudly (missing SENDER_EMAIL message,
nothing spendable, no FaxDrop key on the Worker), and with no ACCESS_CODE the
auth gate is open — harmless while keyless, but push all three TOGETHER.

Open items, in order:

1. **Worker runtime secrets in the HUB** — Noah adds `FAXDROP_TEST_API_KEY`,
   `SENDER_EMAIL`, `ACCESS_CODE` to the HUB's repo secrets (values already in
   MyFax's secrets, which feed only its CI smoke; GitHub secrets don't cross
   repos). Then re-dispatch Deploy MyFax (branch=staging, fax_key=test) —
   the secret-push step will say "pushed X" for each.
2. **Relay linking**: Noah pastes
   https://fax-relay.noah-jefferson.workers.dev + his access code into the
   app's Relay settings on staging. Sandbox key = sends come back
   `completed` instantly, no real fax, no credit.
3. **On-device pass** (Doctrine §7) on staging — then Noah's explicit
   "promote" = dispatch Deploy MyFax with branch=main (and fax_key=live when
   he says so; `skip` leaves the Worker's current key alone).
4. **1.0.0 needs its NAME from Noah** (Doctrine §7 — never invent). Goes in
   the CHANGELOG heading as `1.0.0 "…"`.
5. **Repo metadata** (§10, Noah pastes in GitHub UI, confirm each):
   description "Free fax from your phone — an installable web app that sends
   a document to any fax number. No account, no subscription." · website
   https://myfax.pages.dev · topics fax, pwa, offline-first,
   cloudflare-pages, cloudflare-workers · social preview pending (next item).
6. **Icon + social preview**: Noah is generating WORDLESS images with
   ChatGPT (doctrine §3: no words in AI imagery). When he brings them:
   overlay "FAX RELAY" / "FREE FAX FROM YOUR PHONE" on the social banner
   ourselves (mono caps, ink #191C18, contrast-checked), export 1280×640;
   optionally regenerate public/icon-*.png from the icon image (keep the
   maskable safe zone).
7. **Hub wiring after promote**: hub links OUT to myfax.pages.dev, and
   record the release in Project facts. The hub's leftover carrier branch
   `claude/free-fax-pwa-c4bzw3` still needs deleting (GitHub UI or a session
   whose proxy allows branch deletion).
8. **First live fax** (faxbeep test number; spends 1 of 2 monthly frees) —
   only on Noah's say-so. Balance-endpoint JSON keys become knowable then.
9. §1 deviation (document transits relay + carrier): Noah has proceeded with
   the build knowing it — treat as accepted unless he says otherwise.

### Update — 2026-07-25, follow-up session (branch `claude/myfax-notes-handoff-0pmsmy`)

- Re-dispatched Deploy MyFax (staging, fax_key=test) to probe item 1: run #3
  (hub run 30169349476, 18:18 UTC) fully green, but the secret-push step still
  said "hub has no value for" all three — **the hub secrets are NOT added yet;
  item 1 remains with Noah**, unchanged. Deploy itself is idempotent-clean.
- Re-verified locally: worker self-test all pass, contrast gate all pass, axe
  scan 0 violations / 0 page errors. Still green.
- **Changelog honesty fix on this branch**: the staged 1.0.0 entry promised
  "Word document" and "US" — FaxDrop takes PDF/JPEG/PNG only and reaches
  US + Canada (F9/F10; the app's file picker was already correct). Merge this
  branch into `staging` (and `main` at promote) so the fix ships with 1.0.0.
- Hub carrier branch `claude/free-fax-pwa-c4bzw3`: deletion retried, git proxy
  still 403s — remains a GitHub-UI task for Noah.
- **Item 6 (icon + social preview) done in code**: Noah's wordless ChatGPT
  images arrived as chat pictures only (no files reach the sandbox disk), so
  `tools/render-icons.py` was rewritten to recreate his compositions exactly —
  handset + coiled cord, grille, keypad dots, blue lamp, and the perforated
  tape on the banner — in the app palette. It now also renders
  `social-preview.png` (1280×640, repo root) with "FAX RELAY" / "FREE FAX FROM
  YOUR PHONE" overlaid in mono caps ink (contrast computed at render time,
  9.42:1; script fails under 4.5). Maskable icon verified programmatically
  inside the 40%-radius safe zone (171px vs 205px). Noah still uploads the
  social preview in the GitHub UI (§10) after eyeballing it. Icons sit in the
  SW shell; nothing has shipped, so no triplet bump — any staging device that
  cached 1.0.0 refreshes when sw.js next changes.
- Noah asked why the Worker runtime secrets go in the HUB, then asked for the
  *proper* architecture. **Decision implemented (supersedes the hub-deploys
  arrangement)**: MyFax owns its deploy — new `.github/workflows/deploy.yml`
  in THIS repo (dispatch input: branch; no fax_key, no secret-push step);
  the hub's `deploy-myfax.yml` is deleted (hub branch
  `claude/myfax-notes-handoff-0pmsmy`). Secrets live closest to use:
  GitHub (MyFax) holds only the deploy credentials — `CLOUDFLARE_API_TOKEN`
  (Pages-scoped), `CLOUDFLARE_WORKER_API_TOKEN` (Workers Scripts: Edit),
  `CLOUDFLARE_ACCOUNT_ID` — and the Worker's RUNTIME secrets
  (`FAXDROP_API_KEY`, `SENDER_EMAIL`, `ACCESS_CODE`) are set ONCE by Noah in
  the Cloudflare dashboard (Workers & Pages → fax-relay → Settings →
  Variables and Secrets); wrangler deploys preserve them. GitHub never holds
  the live fax key. The hub no longer needs ANY MyFax secret. CI smoke keeps
  its own `FAXDROP_TEST_API_KEY`/`SENDER_EMAIL` in MyFax secrets, unchanged.
  NOTE: `workflow_dispatch` only appears in the Actions UI once the workflow
  file is on the DEFAULT branch — merge this branch to `main` (and `staging`)
  before dispatching.
