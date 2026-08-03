/**
 * Contrast gate — Doctrine §4: contrast is COMPUTED, never eyeballed.
 * Exits non-zero on any failing pair. New fg/bg pairs are added here in the
 * SAME commit that introduces them.
 *
 * Thresholds: 4.5:1 for text (all app text is under 18.66px bold), 3:1 for
 * non-text indicators and the focus ring. Disabled-control colors are exempt
 * per WCAG 1.4.3 but listed as INFO so drift is visible.
 */

const C = {
  ink: '#191C18',
  inkSoft: '#3C3F38',
  inkFaint: '#4B4D44',
  housing: '#C3C0B2',
  panel: '#E6E4DA',
  paper: '#F2F0E7',
  rule: '#626056',
  signal: '#2A4FBF',
  signalDeep: '#24439E',
  fault: '#A83A17',
  amber: '#8A5B00',
};

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [label, fg, bg, threshold]
const PAIRS = [
  ['body text on housing', C.ink, C.housing, 4.5],
  ['body text on panel', C.ink, C.panel, 4.5],
  ['input text on paper', C.ink, C.paper, 4.5],
  ['labels / lamp text on panel', C.inkSoft, C.panel, 4.5],
  ['soft notes on paper', C.inkSoft, C.paper, 4.5],
  ['tape line numbers on paper', C.inkFaint, C.paper, 4.5],
  ['tape empty text on paper', C.inkFaint, C.paper, 4.5],
  ['tape OK tone on paper', C.signalDeep, C.paper, 4.5],
  ['tape fault tone on paper', C.fault, C.paper, 4.5],
  ['fault note on panel', C.fault, C.panel, 4.5],
  ['activity delivered on panel', C.signalDeep, C.panel, 4.5],
  ['activity failed on panel', C.fault, C.panel, 4.5],
  ['activity queued/sending (amber) on panel', C.amber, C.panel, 4.5],
  ['send button text on ink', C.paper, C.ink, 4.5],
  ['send button text on signal (hover)', C.paper, C.signal, 4.5],
  ['drop drag-over text on paper', C.signalDeep, C.paper, 4.5],
  // §7b: the version stamp is dimmed with a TOKEN, never opacity. The
  // 2026-08-03 palette re-solve (palettes/myfax.json vs the hub's
  // palette-check) deepened ink-soft until it clears housing, so the stamp
  // uses it directly; the interim ink-dim token is gone.
  ['version stamp (ink-soft) on housing', C.inkSoft, C.housing, 4.5],
  ['sheet body text on panel', C.ink, C.panel, 4.5],
  ['diagnostic text on paper', C.ink, C.paper, 4.5],
  // non-text (3:1)
  ['lamp dot ready (signal) vs panel', C.signal, C.panel, 3],
  ['lamp dot working (amber) vs panel', C.amber, C.panel, 3],
  ['lamp dot fault vs panel', C.fault, C.panel, 3],
  ['lamp dot idle (ink-soft) vs panel', C.inkSoft, C.panel, 3],
  // A-013: the offline dot paints --rule; this gate used to check ink-soft
  // for it — a check that could not fail. Pinned to the real token now.
  ['lamp dot offline (rule) vs panel', C.rule, C.panel, 3],
  ['focus ring (signal) vs housing', C.signal, C.housing, 3],
  ['focus ring (signal) vs panel', C.signal, C.panel, 3],
  ['focus ring (signal) vs paper', C.signal, C.paper, 3],
  ['input border (rule) vs paper', C.rule, C.paper, 3], // 1.4.11 — real since the rail re-solve; the panel→paper fill step is only 1.07
];

const INFO = [
  ['disabled send text (rule) on panel — WCAG-exempt', C.rule, C.panel],
];

let failed = 0;
for (const [label, fg, bg, min] of PAIRS) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2).padStart(5)} >= ${min}  ${label}  (${fg} on ${bg})`);
}
for (const [label, fg, bg] of INFO) {
  console.log(`INFO  ${ratio(fg, bg).toFixed(2).padStart(5)}         ${label}  (${fg} on ${bg})`);
}
if (failed) {
  console.error(`\n${failed} contrast pair(s) FAILED`);
  process.exit(1);
}
console.log('\nAll contrast pairs pass.');
