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
npx wrangler secret put FAXDROP_API_KEY     # from the FaxDrop dashboard
npx wrangler secret put ACCESS_CODE         # any string; blocks open-relay abuse
npx wrangler deploy
```

**2. PWA**

```bash
npx wrangler pages deploy public --project-name myfax
```

(In this repo both deploys are CI-driven once the repo secrets exist: push to
`staging` for a preview, `main` for production — see
`.github/workflows/deploy.yml`.)

**3. Link them** — open the PWA, expand *Relay settings*, paste the Worker URL
and the access code. `ALLOWED_ORIGIN` in `wrangler.toml` is already locked to
the app's own origins; change it if you fork this under a different name.

## Testing a send without a recipient

You don't need to know anyone with a fax machine:

- **faxbeep.com** publishes free test numbers and displays the received fax on
  their site within a minute or two — the only way to see the delivered page
  with your own eyes. **Received faxes are public for 30 days**, so send a
  meaningless test page, never a real document.
- FaxDrop's own status API is the other half of the proof: the app's tape ends
  in `OK — DELIVERED` only when the carrier confirms the handoff.
- A free-tier test spends one of the month's 2 free faxes.

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
| Free-tier cover page | forced, counts against the 5 pages | n/a |
| API rate limits | 10/min · 100/hr · 500/day | generous |
| Extra setup | none | R2 bucket + public media base + owned DID |

Telnyx sends from a hosted URL rather than an upload, so the Worker stages the
file in R2 and hands Telnyx the public link. Uncomment the Telnyx block in
`wrangler.toml` before switching.

## Verification state

- **Verified against FaxDrop's published docs (2026-07-25)**: send
  `POST /api/send-fax` (multipart, `X-API-Key`), status `GET /api/v1/fax/{id}`,
  supported types (PDF/DOCX/JPEG/PNG), free-tier shape, rate limits. Telnyx
  `POST /v2/faxes` with `connection_id` + `media_url`, Bearer auth.
- **Verified by test**: the Worker's routing, auth, validation, number
  normalization, status mapping and error surfacing
  (`node tools/worker-selftest.mjs`); the full client journey headless
  (send → tape → delivered report → activity log) against a mock relay.
- **Not yet verified**: a live send with a real API key (spends a free-tier
  fax), the API's file-size ceiling (relay enforces 10 MB; FaxDrop's free web
  page advertises 4 MB), and the Telnyx path end-to-end. See `NOTES.md`.
- **Dead**: Twilio Programmable Fax, sunset 17 Dec 2021. Ignore any tutorial
  built on it.

## Behavior worth knowing

- Sends attempted offline are held in IndexedDB and released on reconnect via
  Background Sync, falling back to an `online` listener where Sync is absent.
- The service worker caches the shell only. `/api/*` always hits the network —
  a cached fax status is a lie.
- Status polling runs every 8 s (under FaxDrop's 10/min limit), stops after
  5 minutes, and marks the fax `unknown` rather than guessing.

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
