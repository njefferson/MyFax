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
and the access code. Then set `ALLOWED_ORIGIN` in `wrangler.toml` to the Pages
origin and redeploy the Worker.

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
