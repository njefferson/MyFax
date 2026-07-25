/**
 * Walks the primary user journey headless (Doctrine §6): open app → set relay
 * → pick file → type number → Send → tape prints DIALING/CONNECT/TRANSMITTING
 * → delivered report → activity row. Uses a built-in mock relay, so it proves
 * the CLIENT end-to-end; the Worker has its own self-test.
 *
 * Needs: npm i playwright-core (+ preinstalled Chromium).
 * Run from the repo root: node tools/journey-walk.mjs
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

// Static server for public/
const app = createServer((req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = join('public', path);
  if (!existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});

// Mock relay: accepts the send, reports 'sending' once, then 'delivered'.
let polls = 0;
const seen = { auth: null, sendHit: false };
const relay = createServer(async (req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Access-Code', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  seen.auth = req.headers['x-access-code'];
  const out = (o) => { res.writeHead(200, { 'Content-Type': 'application/json', ...cors }); res.end(JSON.stringify(o)); };
  if (req.url.startsWith('/api/send')) { seen.sendHit = true; req.resume(); req.on('end', () => out({ id: 'fax_walk1', provider: 'faxdrop', status: 'queued' })); return; }
  if (req.url.startsWith('/api/status')) { polls += 1; return out(polls < 2 ? { id: 'fax_walk1', status: 'sending' } : { id: 'fax_walk1', status: 'delivered', pages: 1 }); }
  res.writeHead(404, cors); res.end('{}');
});

await new Promise((r) => app.listen(8080, r));
await new Promise((r) => relay.listen(8090, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ` — ${detail}`}`); if (!cond) failures += 1; };

await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
check('app loads with lamp', await page.locator('#lamp').textContent() !== '');

// Not-linked honesty before setup
check('unlinked state says so', /relay address/i.test(await page.locator('#note').textContent()));

// Relay settings via keyboard-reachable summary
await page.locator('.settings summary').click();
await page.locator('#endpoint').fill('http://localhost:8090');
await page.locator('#endpoint').blur();
await page.locator('#code').fill('walk-code');
await page.locator('#code').blur();

// Send button stays disabled until both file and number exist
check('send disabled with no inputs', await page.locator('#send').isDisabled());
await page.locator('#file').setInputFiles({ name: 'walk.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 walk') });
check('file shown in drop', /walk\.pdf/.test(await page.locator('#dropText').textContent()));
check('send still disabled without number', await page.locator('#send').isDisabled());
await page.locator('#to').fill('(555) 010-2030');
check('send enabled with file + number', !(await page.locator('#send').isDisabled()));

await page.locator('#send').click();
await page.waitForFunction(() => document.querySelector('#tape')?.textContent.includes('REF'), null, { timeout: 5000 });
const tapeEarly = await page.locator('#tape').textContent();
check('tape prints TO/FILE/CONNECT/REF', ['TO', 'walk.pdf', 'CONNECT', 'REF  fax_walk1'].every((s) => tapeEarly.includes(s)), tapeEarly);
check('lamp shows Sending', /sending/i.test(await page.locator('#lamp').textContent()));

// Delivery takes two 8s polls
await page.waitForFunction(() => document.querySelector('#tape')?.textContent.includes('OK — DELIVERED'), null, { timeout: 30000 });
const tape = await page.locator('#tape').textContent();
check('delivered report prints pages + reference', tape.includes('Pages') && tape.includes('fax_walk1'), tape);
check('lamp back to Ready', /ready/i.test(await page.locator('#lamp').textContent()));
check('activity row shows delivered', /delivered/i.test(await page.locator('#activity').textContent()));
check('relay saw the access code', seen.auth === 'walk-code', String(seen.auth));
check('relay send endpoint was hit', seen.sendHit);
check('no page errors', errs.length === 0, errs.join(' | '));

// Settings survive reload (localStorage)
await page.reload({ waitUntil: 'networkidle' });
check('activity persists across reload', /delivered/i.test(await page.locator('#activity').textContent()));
check('endpoint persists across reload', (await page.locator('#endpoint').inputValue()) === 'http://localhost:8090');

await browser.close(); app.close(); relay.close();
console.log(failures ? `\n${failures} journey check(s) FAILED` : '\nPrimary journey walks clean.');
process.exit(failures ? 1 : 0);
