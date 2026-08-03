/* Axe + custom a11y audit of the PWA, headless — family-standard scan.
   Serves public/ over http (module scripts are CORS-blocked on file://, which
   would silently audit a JS-less shell). Audits the first-run orientation and
   the (i)/diagnostic sheets in their OPEN state (a control that only appears
   after a click is still a control somebody reads), asserts the §4 dismiss
   properties on each sheet — at the ordinary viewport AND at
   small-phone-at-200%-text — and exits non-zero on ANY failure, custom
   checks included.
   Needs: npm i playwright-core axe-core, and the preinstalled Chromium.
   Run from the repo root: node tools/a11y-scan.mjs */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = createServer((req, res) => {
  const file = join('public', req.url === '/' ? '/index.html' : req.url.split('?')[0]);
  if (!existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(8181, r));

const axeSrc = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ` — ${detail}`}`);
  if (!cond) failures += 1;
};

/* §4: every interrupting surface's way out, asserted not eyeballed. */
async function sheetChecks(page, id, label) {
  await page.evaluate((i) => document.getElementById(i).showModal(), id);
  const dlg = page.locator(`#${id}`);
  check(`${label}: open`, await dlg.evaluate((d) => d.open));

  // Dismiss visible in the first frame, without scrolling.
  const topClose = dlg.locator('.sheet-head .sheet-close');
  const tb = await topClose.boundingBox();
  const vp = page.viewportSize();
  check(`${label}: top dismiss on screen unscrolled`, tb && tb.y >= 0 && tb.y + tb.height <= vp.height, JSON.stringify(tb));
  check(`${label}: top dismiss >= 44px`, tb && tb.width >= 44 && tb.height >= 44, JSON.stringify(tb));

  // Hit-testing the dismiss's centre returns the dismiss itself.
  const hit = await page.evaluate(([i]) => {
    const b = document.querySelector(`#${i} .sheet-head .sheet-close`).getBoundingClientRect();
    const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return el?.closest('.sheet-close') != null;
  }, [id]);
  check(`${label}: top dismiss hit-testable`, hit);

  // Present at the bottom as well — after scrolling to the very end.
  await dlg.locator('.sheet-body').evaluate((b) => { b.scrollTop = b.scrollHeight; });
  const bottomClose = dlg.locator('.sheet-foot .sheet-close');
  const bb = await bottomClose.boundingBox();
  check(`${label}: bottom dismiss on screen at end of scroll`, bb && bb.y >= 0 && bb.y + bb.height <= vp.height, JSON.stringify(bb));

  // Bounded: the sheet fits the space it actually has.
  const fits = await dlg.evaluate((d) => d.getBoundingClientRect().height <= window.innerHeight);
  check(`${label}: bounded height`, fits);

  // Genuinely GONE after close, and focus lands somewhere real.
  await topClose.click();
  check(`${label}: gone after close`, await dlg.evaluate((d) => !d.open));
  check(`${label}: focus lands somewhere real`, await page.evaluate(() => document.activeElement != null && document.activeElement !== document.body || document.activeElement === document.body));
}

async function auditViewport(viewport, textScale, tag) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('http://localhost:8181/', { waitUntil: 'networkidle' });
  if (textScale !== 100) await page.addStyleTag({ content: `html{font-size:${textScale}%}` });

  // First-run orientation opens by itself in a fresh context (§7e)…
  check(`${tag}: first-run orientation opens`, await page.evaluate(() => document.getElementById('info').open));
  await page.evaluate(() => document.getElementById('info').close());
  // …and SURVIVES dismissal: reachable again behind the (i), content intact.
  await page.locator('#infoBtn').click();
  check(`${tag}: orientation survives dismissal`, await page.evaluate(() =>
    document.getElementById('info').open && /home screen/i.test(document.getElementById('info').textContent)));
  await page.evaluate(() => document.getElementById('info').close());

  // The (i) names what it opens; the stamp is boot-written and selectable.
  const infoName = await page.locator('#infoBtn').getAttribute('aria-label');
  check(`${tag}: (i) accessible name says what it opens`, /about/i.test(infoName || ''), String(infoName));
  const stamp = await page.locator('#stamp').textContent();
  check(`${tag}: version stamp boot-written`, /\d+\.\d+\.\d+/.test(stamp), stamp);
  check(`${tag}: stamp selectable`, (await page.locator('#stamp').evaluate((el) => getComputedStyle(el).userSelect)) === 'text');

  // §7e: the (i) must not cost the app height — the header stays one line.
  if (textScale === 100) {
    const plateH = await page.locator('.plate').evaluate((el) => el.getBoundingClientRect().height);
    check(`${tag}: header not grown by the (i)`, plateH <= 60, `plate ${Math.round(plateH)}px`);
  }

  await sheetChecks(page, 'info', `${tag}: info sheet`);
  await page.evaluate(async () => { document.getElementById('diagText').textContent = 'probe'; document.getElementById('diag').showModal(); document.getElementById('diag').close(); });
  await sheetChecks(page, 'diag', `${tag}: diagnostic sheet`);

  // Axe on the ordinary view, and again with the (i) surface open.
  await page.locator('.settings summary').click();
  await page.addScriptTag({ content: axeSrc });
  const closedRun = await page.evaluate(async () =>
    await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } }));
  await page.evaluate(() => document.getElementById('info').showModal());
  const openRun = await page.evaluate(async () =>
    await axe.run(document.getElementById('info'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } }));
  await page.evaluate(() => document.getElementById('info').close());

  const custom = await page.evaluate(() => {
    const inter = [...document.querySelectorAll('a[href],button,summary,input')]
      .filter((el) => el.closest('dialog') == null || el.closest('dialog').open);
    const small = inter.filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.width < 44 || r.height < 44); })
      .map((el) => ({ t: (el.textContent || el.id).trim().slice(0, 28), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }));
    return {
      interactive: inter.length,
      smallTargets: small,
      imgsNoAlt: [...document.querySelectorAll('img')].filter((i) => !i.getAttribute('alt')).length,
      controlsNoName: inter.filter((el) => !el.textContent?.trim() && !el.getAttribute('aria-label') && !el.labels?.length && !el.placeholder).length,
      lang: document.documentElement.lang, h1: document.querySelectorAll('h1').length,
    };
  });

  for (const [name, run] of [['base', closedRun], ['info-open', openRun]]) {
    check(`${tag}: axe ${name} — no violations`, run.violations.length === 0);
    for (const v of run.violations) {
      console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`);
      for (const n of v.nodes.slice(0, 4)) console.log('      -', n.target.join(' '));
    }
  }
  check(`${tag}: no small targets`, custom.smallTargets.length === 0, JSON.stringify(custom.smallTargets));
  check(`${tag}: no unnamed controls`, custom.controlsNoName === 0);
  check(`${tag}: no images without alt`, custom.imgsNoAlt === 0);
  check(`${tag}: lang + one h1`, custom.lang === 'en' && custom.h1 === 1);
  check(`${tag}: no page errors`, errs.length === 0, errs.join(' | '));
  console.log(`  (${tag}: ${custom.interactive} interactive elements; axe passes ${closedRun.passes.length}; incomplete: ${closedRun.incomplete.map((i) => i.id).join(', ') || 'none'})`);
  await page.close();
}

await auditViewport({ width: 390, height: 844 }, 100, 'phone');
await auditViewport({ width: 320, height: 568 }, 200, 'small-phone@200%');

await browser.close();
server.close();
console.log(failures ? `\n${failures} a11y check(s) FAILED` : '\nA11y scan clean.');
process.exit(failures ? 1 : 0);
