# Fax Relay

Installable PWA that sends a document to a fax number — free, no account, no
subscription. Three parts: a static PWA (Cloudflare Pages), a relay Worker
holding the provider key, and a fax provider.

```
public/    PWA — deploy to Cloudflare Pages (static, no build step)
worker/    relay — deploy with wrangler
tools/     contrast gate · worker self-test · a11y scan · icon renderer
```

Part of the [noahjefferson.pages.dev](https://noahjefferson.pages.dev) family
of free apps. PolyForm Noncommercial 1.0.0 — use it, don't sell it.

## Why the Worker exists

No fax provider allows browser-origin CORS, and a client-side API key is a
published API key. Every credential lives in Worker secrets. The PWA stores
only the relay address and an optional access code. The relay streams the
document through and stores nothing.

## Deploy

**1. Relay**

```bash
cd worker
npx wrangler secret put FAXDROP_API_KEY     # fd_live_… (or fd_test_… to stay in the sandbox)
npx wrangler secret put SENDER_EMAIL        # required by FaxDrop; gets delivery confirmations
npx wrangler secret put ACCESS_CODE         # any string; blocks open-relay abuse
npx wrangler deploy
```

**2. PWA**

```bash
npx wrangler pages deploy public --project-name myfax
```

(In this family, the **hub repo deploys MyFax** — it holds the Cloudflare
credentials. Run the hub's `Deploy MyFax` workflow and pick the branch:
`staging` → staging.myfax.pages.dev preview, `main` → myfax.pages.dev
production, plus the relay Worker. The manual wrangler commands above are the
fallback for anyone self-hosting a fork.)

**3. Link them** — open the PWA, expand *Relay settings*, paste the Worker URL
and the access code. `ALLOWED_ORIGIN` in `wrangler.toml` is already locked to
the app's own origins; change it if you fork this under a different name.

## Testing a send without a recipient

Three rungs, cheapest first:

1. **FaxDrop sandbox (free, no fax sent).** Generate an `fd_test_` key in the
   FaxDrop dashboard and use it as `FAXDROP_API_KEY`. Sends never reach a
   carrier and come back immediately `completed` — proves the whole
   app→relay→FaxDrop pipeline end-to-end. Swap in the `fd_live_` key when
   ready (test and live keys are isolated from each other).
2. **faxbeep.com (free, real fax).** Their published test numbers receive your
   fax and display it on their site within a minute or two — the only way to
   see the delivered page with your own eyes. **Received faxes are public for
   30 days**, so send a meaningless test page, never a real document. Spends
   one of the month's 2 free faxes.
3. FaxDrop's status API is the ongoing proof: the tape ends in
   `OK — DELIVERED` only when the carrier confirms (FaxDrop's terminal status
   `completed`), and the `SENDER_EMAIL` inbox gets a delivery confirmation.

## Keeping the relay yours (nobody burns your credit)

The page is public; the *relay* is not. Layers, outermost first:

1. **The relay address ships blank.** A stranger who installs the PWA sees
   "Not linked" — the Worker URL is known only to you.
2. **Access code.** Every send/status call must carry `X-Access-Code` matching
   the Worker's `ACCESS_CODE` secret. Without it: 401. This is the real lock —
   it stops curl, not just browsers. If the code ever leaks, change the
   `ACCESS_CODE` repo secret and push to redeploy: instant rotation.
3. **CORS allowlist.** The Worker only answers browser JS from the app's own
   origins, so a copycat site can't piggyback on your relay.
4. **Bounded blast radius.** The free tier is 2 faxes/month and the API key is
   rate-limited (10/min) — even a leaked code can't run up a real bill unless
   you've bought credits.

Anyone else who wants the app deploys their own Worker with their own free
FaxDrop key — that's the intended model, and this README is the instructions.

## Providers

Selected by the `PROVIDER` var. Both satisfy the same adapter contract
(`send`, `status`), so switching is one line in `wrangler.toml` plus a secret.

| | `faxdrop` (default) | `telnyx` |
|---|---|---|
| Cost | 2 faxes/month free (≤ 5 pages each), then $1.99/fax | ~$0.007/page, no minimum |
| Cover page | always present; sender name/email required, counts against the 5 pages | n/a |
| Files | PDF, JPEG, PNG — max 4 MB (convert Word to PDF first) | hosted URL |
| Send rate limits | 10/min · 30/hr · 500/day (status polls: 60/min) | generous |
| Destinations | US (50 states) + Canada, E.164 | worldwide |
| Sandbox | `fd_test_` key: full flow, no real fax, no credits | n/a |
| Extra setup | none | R2 bucket + public media base + owned DID |

Telnyx sends from a hosted URL rather than an upload, so the Worker stages the
file in R2 and hands Telnyx the public link. Uncomment the Telnyx block in
`wrangler.toml` before switching.

## Verification state

- **Verified against FaxDrop's official API doc (2026-07-25)**: send
  `POST /api/send-fax` (multipart `file`/`recipientNumber`/`senderName`/
  `senderEmail`, `X-API-Key`), status `GET /api/v1/fax/{id}` (terminal success
  `completed`; `partial` exists), types PDF/JPEG/PNG at ≤ 4 MB, rate limits,
  sandbox keys, no-auto-retry-on-timeout rule. Full contract in `NOTES.md` F9.
- **Verified by test**: the Worker's routing, auth, CORS allowlist,
  validation, number normalization, official field names, status mapping and
  error surfacing (`node tools/worker-selftest.mjs`); the full client journey
  headless against a mock relay (`node tools/journey-walk.mjs`); the live
  API's actual behavior via the sandbox smoke in CI
  (`node tools/sandbox-smoke.mjs`, fd_test_ key, no fax sent).
- **Not yet verified**: a real live-key fax (spends a free-tier fax), the
  balance response's JSON keys, and the Telnyx path end-to-end. See `NOTES.md`.
- **Dead**: Twilio Programmable Fax, sunset 17 Dec 2021. Ignore any tutorial
  built on it.

## Behavior worth knowing

- Sends attempted offline are held in IndexedDB and released on reconnect via
  Background Sync, falling back to an `online` listener where Sync is absent.
- The service worker caches the shell only. `/api/*` always hits the network —
  a cached fax status is a lie.
- Status polling runs every 10 s (FaxDrop refreshes upstream status at most
  that often per fax), stops after 5 minutes, and marks the fax `unknown`
  rather than guessing.
- A queued offline send is never blind-retried after an answered error — the
  carrier may already have it, and a retry could send a duplicate.

## Checks

```bash
node tools/contrast-gate.mjs     # computed WCAG contrast — CI-enforced
node tools/worker-selftest.mjs   # relay logic, stubbed provider, no network
node tools/a11y-scan.mjs         # axe-core audit (needs playwright-core + axe-core)
```

## Known cosmetic residue

- The perforation strip along the top of the transmission tape is 4px and reads
  as texture rather than as perforation on high-DPI phones.
- The maskable icon safe zone is approximated, not measured against the
  Android mask set.
