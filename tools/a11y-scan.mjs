/* Axe + custom a11y audit of the PWA, headless — family-standard scan.
   Serves public/ over http (module scripts are CORS-blocked on file://, which
   would silently audit a JS-less shell). Expands the settings panel first so
   the whole UI is in the tree.
   Needs: npm i playwright-core axe-core, and the preinstalled Chromium.
   Run from the repo root: node tools/a11y-scan.mjs */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = createServer((req, res) => {
  const file = join('public', req.url === '/' ? '/index.html' : req.url.split('?')[0]);
  if (!existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(8181, r));

const axeSrc = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
await page.goto('http://localhost:8181/', { waitUntil: 'networkidle' });
await page.locator('.settings summary').click();
await page.addScriptTag({ content: axeSrc });
const results = await page.evaluate(async () =>
  await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } })
);
const custom = await page.evaluate(() => {
  const inter = [...document.querySelectorAll('a[href],button,summary,input')];
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
await browser.close(); server.close();
console.log('=== AXE (WCAG 2.1 A/AA + best-practice) ===');
console.log('VIOLATIONS:', results.violations.length);
for (const v of results.violations) {
  console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`);
  for (const n of v.nodes.slice(0, 4)) console.log('      -', n.target.join(' '));
}
console.log('INCOMPLETE:', results.incomplete.map((i) => i.id).join(', ') || 'none');
console.log('passes:', results.passes.length);
console.log('=== CUSTOM ===');
console.log(JSON.stringify(custom, null, 2));
console.log('pageerrors:', errs.length, errs.join(' | '));
process.exit(results.violations.length ? 1 : 0);
