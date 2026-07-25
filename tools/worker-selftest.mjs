/**
 * Worker self-test — exercises the relay's routes with a stubbed provider.
 * No network, no API key. Proves the Worker's OWN logic (routing, auth,
 * validation, number normalization, status mapping, error surfacing) — it
 * cannot prove FaxDrop's side; that needs a live key (see NOTES.md).
 *
 * Run: node tools/worker-selftest.mjs   (exits non-zero on any failure)
 */
import worker from '../worker/src/index.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  — ${detail}`}`);
  if (!cond) failures += 1;
};

const realFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  const u = String(url);
  if (u.endsWith('/api/send-fax')) {
    return new Response(JSON.stringify({ id: 'fax_test123', status: 'queued' }), { status: 200 });
  }
  if (u.includes('/api/v1/fax/')) {
    return new Response(JSON.stringify({ id: 'fax_test123', status: 'delivered', pages: 2 }), { status: 200 });
  }
  return new Response(JSON.stringify({ error: 'unexpected upstream call' }), { status: 500 });
};

const env = { FAXDROP_API_KEY: 'fd_test', ACCESS_CODE: 'letmein', PROVIDER: 'faxdrop', ALLOWED_ORIGIN: 'https://example.pages.dev, https://staging.example.pages.dev' };
const base = 'https://relay.test';
const call = (path, init) => worker.fetch(new Request(base + path, init), env);

// health is open
let res = await call('/api/health');
let body = await res.json();
check('health responds 200 with provider', res.status === 200 && body.provider === 'faxdrop');

// CORS allowlist: listed origins echo back, foreign origins do not
res = await call('/api/health', { headers: { Origin: 'https://staging.example.pages.dev' } });
check('CORS echoes a listed origin', res.headers.get('Access-Control-Allow-Origin') === 'https://staging.example.pages.dev');
res = await call('/api/health', { headers: { Origin: 'https://evil.example.com' } });
check('CORS refuses a foreign origin', res.headers.get('Access-Control-Allow-Origin') === 'https://example.pages.dev');

// auth wall
res = await call('/api/status?id=x');
check('missing access code -> 401', res.status === 401);
res = await call('/api/status?id=x', { headers: { 'X-Access-Code': 'wrong' } });
check('wrong access code -> 401', res.status === 401);

// send validation
const auth = { 'X-Access-Code': 'letmein' };
let form = new FormData();
form.append('to', '12');
form.append('file', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'doc.pdf');
res = await call('/api/send', { method: 'POST', body: form, headers: auth });
check('bad number -> 400', res.status === 400);

form = new FormData();
form.append('to', '(555) 123-4567');
res = await call('/api/send', { method: 'POST', body: form, headers: auth });
check('missing file -> 400', res.status === 400);

// happy path + normalization
form = new FormData();
form.append('to', '(555) 123-4567');
form.append('file', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'doc.pdf');
calls.length = 0;
res = await call('/api/send', { method: 'POST', body: form, headers: auth });
body = await res.json();
check('send -> 200 with id', res.status === 200 && body.id === 'fax_test123', JSON.stringify(body));
check('number normalized to +15551234567', body.to === '+15551234567', body.to);
check('provider called with X-API-Key', calls[0]?.init.headers?.['X-API-Key'] === 'fd_test');
check('provider send path', calls[0]?.url === 'https://www.faxdrop.com/api/send-fax', calls[0]?.url);

// status path + mapping
calls.length = 0;
res = await call('/api/status?id=fax_test123', { headers: auth });
body = await res.json();
check('status -> delivered with pages', body.status === 'delivered' && body.pages === 2, JSON.stringify(body));
check('status uses GET /api/v1/fax/{id}', calls[0]?.url === 'https://www.faxdrop.com/api/v1/fax/fax_test123', calls[0]?.url);

// provider failure surfaces honestly
globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Insufficient credits' }), { status: 402 });
form = new FormData();
form.append('to', '5551234567');
form.append('file', new Blob(['x'], { type: 'application/pdf' }), 'doc.pdf');
res = await call('/api/send', { method: 'POST', body: form, headers: auth });
body = await res.json();
check('provider error -> 502 with its message', res.status === 502 && /Insufficient credits/.test(body.error), JSON.stringify(body));

// unknown route
res = await call('/nope', { headers: auth });
check('unknown route -> 404', res.status === 404);

globalThis.fetch = realFetch;
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll worker self-tests pass.');
process.exit(failures ? 1 : 0);
