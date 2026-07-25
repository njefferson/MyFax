# CLAUDE.md — MyFax (the app presents as "Fax Relay")

> **Inherits the Universal App Doctrine** — the canonical copy lives in the hub
> repo at [`njefferson/noahjefferson/DOCTRINE.md`](https://github.com/njefferson/noahjefferson/blob/main/DOCTRINE.md).
> It governs product values, taste, accessibility, honesty, verification,
> release discipline & taxonomy, licensing (PolyForm Noncommercial), privacy,
> the permanent **AskUserQuestion ban** (§0), and the **repo-metadata confirm
> rule** (§10). **Where anything below overlaps the Doctrine, the Doctrine
> wins.** This file keeps only what is specific to this repo.

## What this repo is

A free, installable PWA that sends a document to a fax number. Three parts:

```
public/    the PWA (static, no build step) — Cloudflare Pages
worker/    the relay Worker holding the provider API key — wrangler deploy
tools/     contrast gate, a11y scan, worker self-test, icon renderer
```

The Worker exists because no fax provider allows browser-origin CORS and a
client-side API key is a published API key. Providers are adapters selected by
the `PROVIDER` var in `worker/wrangler.toml`: `faxdrop` (default, free tier) or
`telnyx` (metered fallback).

## Doctrine §1 deviation — stated, not slipped in

The family identity is local-first / no server-side user data. **Faxing cannot
be local**: the document necessarily transits the relay Worker and the fax
carrier. Handling: the relay stores nothing (it streams through), FaxDrop
deletes the document when transmission ends, and everything else (history,
settings) stays in the browser. The app's footer states this plainly. Noah
accepted this deviation when he commissioned the app; do not extend it (no
logging, no analytics, no server-side history — ever).

## Source of truth

`NOTES.md` first, every session — it carries the verified-facts ledger for the
provider APIs (what was confirmed, when, and from where) and the roadmap.

## Branches & releases

`staging` and `main` only. The staging gate (Doctrine §7) applies to every
product change; Noah's on-device pass on his actual iPad/iPhone promotes.
Release numbering is the family triplet; the service-worker cache name in
`public/sw.js` and the top entry of `CHANGELOG.md` carry the same triplet —
bump them together.

## Verification specifics

- `node tools/contrast-gate.mjs` — computed contrast, exits non-zero on any
  failure. New fg/bg pairs go into the gate in the same commit.
- `node tools/worker-selftest.mjs` — exercises the Worker's routes with a
  stubbed provider; no network, no key needed.
- `node tools/a11y-scan.mjs` — axe-core + custom checks against `public/`
  headless; run before any UI ship.
- Live-key verification (a real FaxDrop send) needs Noah's API key and spends
  a real free-tier fax — never burn one without asking first.
