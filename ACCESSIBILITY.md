# ACCESSIBILITY.md — append-only register

Entries are never deleted. Fixed entries keep the release they were fixed in.
Gate: `tools/contrast-gate.mjs` (computed, CI-enforced); audit:
`tools/a11y-scan.mjs` (axe-core WCAG 2.1 A/AA + custom checks).

Reformatted from a table on 2026-08-03 (Doctrine §2 — no grids anywhere Noah
reads); every entry's content is unchanged.

## A-001 — found 2026-07-25

Tape line numbers and empty-state text used `--rule` #9A9788 on paper —
2.57:1, fails AA 4.5:1.
FIXED — new `--ink-faint` #6A6D60 (4.63:1). Release: 1.0.0 (pre-release).

## A-002 — found 2026-07-25

Amber queued/sending state text #C98A12 on panel ≈ 2.5:1, fails AA.
FIXED — amber darkened to #8A5B00 (4.61:1). Release: 1.0.0 (pre-release).

## A-003 — found 2026-07-25

`--ink-soft` #5A5D53 labels on panel were 5.5:1 (passing) but left no
headroom; blue "ok"/delivered text on paper used bright `--signal`.
FIXED — ink-soft deepened to #4E5148, text-blue split into `--signal-text`
#24439E (7.8:1); dots/rings keep bright `--signal`. Release: 1.0.0
(pre-release).

## A-004 — found 2026-07-25

Relay-settings `<summary>` tap target ~26px tall, under the 44px floor.
FIXED — vertical padding brings it ≥ 44px. Release: 1.0.0 (pre-release).

## A-005 — found 2026-07-25

Status lamp changed silently for screen readers.
FIXED — `aria-live="polite"` on the lamp (tape already had it). Release:
1.0.0 (pre-release).

## A-006 — found 2026-07-25 — STANDING RULE

Hue is never the only channel: every state (lamp, tape tones, activity
states) also carries its literal text — verified by grayscale reasoning;
keep it that way when adding states.

## A-007 — found 2026-07-25

Axe: no `<main>` landmark; content outside landmarks.
FIXED — shell is `<main>`, footer is `<footer>`. Release: 1.0.0 (pre-release).

## A-008 — found 2026-07-25

Relay-settings inputs 41px, footer links 40px — under the 44px floor.
FIXED — padding brings both ≥ 44px. Release: 1.0.0 (pre-release).

## A-009 — found 2026-07-25

Hidden file input had no accessible name.
FIXED — `aria-label="Document to fax"`. Release: 1.0.0 (pre-release).

## A-010 — found 2026-08-03

The version stamp planned as `--ink-soft` on housing measured 4.43:1 —
under AA 4.5:1 (computed, not eyeballed).
FIXED before ship — dedicated `--ink-dim` #484B42 (4.87:1), pair added to
the contrast gate in the same commit (Doctrine §7b: dimmed with a token,
never opacity). Release: 1.0.0 (pre-release).

## A-011 — found 2026-08-03

At 320px × 200% text, the browser's own dialog `max-width:
calc(100% - 6px - 2em)` narrowed the sheets until the header close button
hung outside the dialog, where a tap could not reach it. Found by the
a11y scan's hit test (elementFromPoint at the button's centre returned the
dialog), not by eye.
FIXED before ship — `max-width:none` with a width measured against the real
viewport, title shrinks (`min-width:0`, ellipsis), close button `flex:none`.
The scan now asserts hit-testability of every sheet's dismiss at
small-phone-at-200%-text on every run. Release: 1.0.0 (pre-release).

## A-012 — found 2026-08-03

Running the hub's palette gate (`palette-check.mjs`, role model from
PALETTES.md) against the app's colours found the borders and quiet grays
under the family floors: `--rule` #9A9788 was 2.30–2.57:1 against the fills
it edges (the rail floor is 3.4:1, and the panel→paper fill step is only
1.07:1, so the border IS the boundary); `--ink-soft` #4E5148 was 4.43:1 on
housing and `--ink-faint` #6A6D60 was 3.70:1 there (text floor 4.6:1 on
every fill).
FIXED before ship — the light ramp re-solved as one system:
`--ink-soft` #3C3F38, `--ink-faint` #4B4D44, `--rule` #626056. The spec
lives in `palettes/myfax.json`; the hub checker passes every hard floor and
CI runs it (fetched from the hub, never forked). The interim `--ink-dim`
from A-010 is superseded — the stamp uses the deepened `--ink-soft`.
Release: 1.0.0 (pre-release).

## A-013 — found 2026-08-03

The offline lamp dot paints `--rule`, but the contrast gate checked
`ink-soft` for the "idle/offline" pair — a check that could not fail
(hub LESSONS §7g shape). The real pair measured 2.30:1, under the 3:1
non-text floor.
FIXED before ship — the gate now carries idle (ink-soft) and offline (rule)
as separate pairs pinned to the tokens the CSS actually paints, and the
A-012 rail re-solve brings the offline dot to 4.95:1. Release: 1.0.0
(pre-release).
