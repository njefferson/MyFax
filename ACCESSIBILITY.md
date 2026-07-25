# ACCESSIBILITY.md — append-only register

Rows are never deleted. Fixed rows keep the release they were fixed in.
Gate: `tools/contrast-gate.mjs` (computed, CI-enforced); audit:
`tools/a11y-scan.mjs` (axe-core WCAG 2.1 A/AA + custom checks).

| ID | Found | Finding | State | Release |
|----|-------|---------|-------|---------|
| A-001 | 2026-07-25 | Tape line numbers and empty-state text used `--rule` #9A9788 on paper — 2.57:1, fails AA 4.5:1 | FIXED — new `--ink-faint` #6A6D60 (4.63:1) | 1.0.0 (pre-release) |
| A-002 | 2026-07-25 | Amber queued/sending state text #C98A12 on panel ≈ 2.5:1, fails AA | FIXED — amber darkened to #8A5B00 (4.61:1) | 1.0.0 (pre-release) |
| A-003 | 2026-07-25 | `--ink-soft` #5A5D53 labels on panel were 5.5:1 (passing) but left no headroom; blue "ok"/delivered text on paper used bright `--signal` | FIXED — ink-soft deepened to #4E5148, text-blue split into `--signal-text` #24439E (7.8:1); dots/rings keep bright `--signal` | 1.0.0 (pre-release) |
| A-004 | 2026-07-25 | Relay-settings `<summary>` tap target ~26px tall, under the 44px floor | FIXED — vertical padding brings it ≥ 44px | 1.0.0 (pre-release) |
| A-005 | 2026-07-25 | Status lamp changed silently for screen readers | FIXED — `aria-live="polite"` on the lamp (tape already had it) | 1.0.0 (pre-release) |
| A-006 | 2026-07-25 | Hue is never the only channel: every state (lamp, tape tones, activity states) also carries its literal text — verified by grayscale reasoning; keep it that way when adding states | STANDING RULE | — |
| A-007 | 2026-07-25 | Axe: no `<main>` landmark; content outside landmarks | FIXED — shell is `<main>`, footer is `<footer>` | 1.0.0 (pre-release) |
| A-008 | 2026-07-25 | Relay-settings inputs 41px, footer links 40px — under the 44px floor | FIXED — padding brings both ≥ 44px | 1.0.0 (pre-release) |
| A-009 | 2026-07-25 | Hidden file input had no accessible name | FIXED — `aria-label="Document to fax"` | 1.0.0 (pre-release) |
