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
// Stub mirrors FaxDrop's official response shapes (NOTES.md ledger F9).
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  const u = String(url);
  if (u.endsWith('/api/send-fax')) {
    return new Response(JSON.stringify({ success: true, faxId: 'fax_test123', deliveryEmail: 'enabled' }), { status: 200 });
  }
  if (u.includes('/api/v1/fax/')) {
    return new Response(JSON.stringify({ status: 'completed', pages: 2, completedAt: 'now' }), { status: 200 });
  }
  if (u.includes('/api/v1/account/balance')) {
    return new Response(JSON.stringify({ monthlyRemaining: 2 }), { status: 200 });
  }
  return new Response(JSON.stringify({ error: 'unexpected upstream call' }), { status: 500 });
};

// Rate-limit binding stubs. The native binding is not available in Node, so
// the tests inject these — allow by default, deny/throw where a test needs it.
const allowLimiter = { limit: async () => ({ success: true }) };
const denyLimiter = { limit: async () => ({ success: false }) };

const env = { FAXDROP_API_KEY: 'fd_test', ACCESS_CODE: 'letmein', PROVIDER: 'faxdrop', SENDER_EMAIL: 'owner@example.com', SENDER_NAME: 'Fax Relay', ALLOWED_ORIGIN: 'https://example.pages.dev, https://staging.example.pages.dev', SEND_RL: allowLimiter, DEST_RL: allowLimiter };
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
// constant-time compare must still reject a same-length wrong code
res = await call('/api/status?id=x', { headers: { 'X-Access-Code': 'letmei_' } });
check('same-length wrong code -> 401', res.status === 401);

// fail-closed CORS: an unset ALLOWED_ORIGIN must DENY (not echo "*")
res = await worker.fetch(new Request(base + '/api/health', { headers: { Origin: 'https://evil.example.com' } }), { ...env, ALLOWED_ORIGIN: '' });
check('unset ALLOWED_ORIGIN denies foreign origin (not *)', res.headers.get('Access-Control-Allow-Origin') === 'null', res.headers.get('Access-Control-Allow-Origin'));

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

// happy path + normalization + official field names
form = new FormData();
form.append('to', '(555) 123-4567');
form.append('file', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'doc.pdf');
calls.length = 0;
res = await call('/api/send', { method: 'POST', body: form, headers: auth });
body = await res.json();
check('send -> 200 with faxId', res.status === 200 && body.id === 'fax_test123', JSON.stringify(body));
check('number normalized to +15551234567', body.to === '+15551234567', body.to);
check('provider called with X-API-Key', calls[0]?.init.headers?.['X-API-Key'] === 'fd_test');
check('provider send path', calls[0]?.url === 'https://www.faxdrop.com/api/send-fax', calls[0]?.url);
const sentForm = calls[0]?.init.body;
check('send uses recipientNumber field (E.164)', sentForm?.get('recipientNumber') === '+15551234567', String(sentForm?.get('recipientNumber')));
check('send carries senderName', sentForm?.get('senderName') === 'Fax Relay');
check('send carries senderEmail', sentForm?.get('senderEmail') === 'owner@example.com');

// missing SENDER_EMAIL fails loudly, not silently
res = await worker.fetch(new Request(base + '/api/send', { method: 'POST', body: form, headers: auth }), { ...env, SENDER_EMAIL: '' });
body = await res.json();
check('missing SENDER_EMAIL -> clear error', res.status === 502 && /SENDER_EMAIL/.test(body.error), JSON.stringify(body));

// ---- Security hardening: rate limits, fail-closed auth, Telnyx guard ----
// Fresh success stub so these assertions do not depend on prior fetch state.
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.endsWith('/api/send-fax')) return new Response(JSON.stringify({ success: true, faxId: 'fax_rl' }), { status: 200 });
  return new Response(JSON.stringify({ data: { id: 'tnx_rl', status: 'queued' }, status: 'queued', pages: 1 }), { status: 200 });
};
const mkSend = () => { const f = new FormData(); f.append('to', '5551234567'); f.append('file', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'd.pdf'); return f; };
const sendWith = (e) => worker.fetch(new Request(base + '/api/send', { method: 'POST', body: mkSend(), headers: auth }), e);

res = await sendWith({ ...env, SEND_RL: denyLimiter });
check('SEND_RL exceeded -> 429', res.status === 429, String(res.status));
res = await sendWith({ ...env, DEST_RL: denyLimiter });
check('DEST_RL exceeded -> 429', res.status === 429, String(res.status));
res = await sendWith({ ...env, SEND_RL: undefined });
check('unbound rate limiter -> 503 (fail closed, does NOT send)', res.status === 503, String(res.status));
res = await sendWith({ ...env, SEND_RL: { limit: async () => { throw new Error('rl down'); } } });
check('throwing rate limiter -> 503 (fail closed)', res.status === 503, String(res.status));
res = await sendWith({ ...env, ACCESS_CODE: '' });
check('no ACCESS_CODE set -> 503, not an open relay', res.status === 503, String(res.status));
res = await sendWith(env);
body = await res.json();
check('within limits + configured -> 200 send', res.status === 200 && body.id === 'fax_rl', JSON.stringify(body));

// Telnyx must refuse a public-bucket stage until expiry is confirmed
const telnyxEnv = { ...env, PROVIDER: 'telnyx', TELNYX_API_KEY: 'tnx', TELNYX_CONNECTION_ID: 'c', TELNYX_FROM: '+15550001111', MEDIA_PUBLIC_BASE: 'https://media.test', MEDIA: { put: async () => {} } };
res = await sendWith(telnyxEnv);
body = await res.json();
check('Telnyx w/o MEDIA_TTL_CONFIRMED -> refused, no leak', res.status === 502 && /expiry|lifecycle|TTL_CONFIRMED/i.test(body.error), JSON.stringify(body));
res = await sendWith({ ...telnyxEnv, MEDIA_TTL_CONFIRMED: 'true' });
check('Telnyx with confirmed expiry -> proceeds', res.status === 200, String(res.status));

// restore the FaxDrop stub for the remaining status/balance/error tests
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  const u = String(url);
  if (u.endsWith('/api/send-fax')) return new Response(JSON.stringify({ success: true, faxId: 'fax_test123', deliveryEmail: 'enabled' }), { status: 200 });
  if (u.includes('/api/v1/fax/')) return new Response(JSON.stringify({ status: 'completed', pages: 2, completedAt: 'now' }), { status: 200 });
  if (u.includes('/api/v1/account/balance')) return new Response(JSON.stringify({ monthlyRemaining: 2 }), { status: 200 });
  return new Response(JSON.stringify({ error: 'unexpected upstream call' }), { status: 500 });
};

// status path + mapping ("completed" is FaxDrop's terminal success)
calls.length = 0;
res = await call('/api/status?id=fax_test123', { headers: auth });
body = await res.json();
check('status completed -> delivered with pages', body.status === 'delivered' && body.pages === 2, JSON.stringify(body));
check('status uses GET /api/v1/fax/{id}', calls[0]?.url === 'https://www.faxdrop.com/api/v1/fax/fax_test123', calls[0]?.url);

// partial maps to its own state, errorType fills a null error
globalThis.fetch = async () => new Response(JSON.stringify({ status: 'partial', pages: 1, error: null, errorCode: 133, errorType: 'DOCUMENT_CONVERSION_ERROR' }), { status: 200 });
res = await call('/api/status?id=fax_test123', { headers: auth });
body = await res.json();
check('partial -> partial with errorType surfaced', body.status === 'partial' && body.error === 'DOCUMENT_CONVERSION_ERROR', JSON.stringify(body));

// balance passthrough
globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify({ monthlyRemaining: 2 }), { status: 200 }); };
calls.length = 0;
res = await call('/api/balance', { headers: auth });
body = await res.json();
check('balance route passes provider body through', res.status === 200 && body.balance?.monthlyRemaining === 2, JSON.stringify(body));
check('balance path', calls[0]?.url === 'https://www.faxdrop.com/api/v1/account/balance', calls[0]?.url);

// provider failure surfaces honestly, hint included
globalThis.fetch = async () => new Response(JSON.stringify({ error: 'No credits remaining', error_type: 'payment_required', hint: 'Buy more at faxdrop.com/pricing' }), { status: 402 });
form = new FormData();
form.append('to', '5551234567');
form.append('file', new Blob(['x'], { type: 'application/pdf' }), 'doc.pdf');
res = await call('/api/send', { method: 'POST', body: form, headers: auth });
body = await res.json();
check('provider error -> 502 with message + hint', res.status === 502 && /No credits remaining/.test(body.error) && /faxdrop.com\/pricing/.test(body.error), JSON.stringify(body));

// oversize file rejected at the relay (FaxDrop limit is 4 MB)
form = new FormData();
form.append('to', '5551234567');
form.append('file', new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: 'application/pdf' }), 'big.pdf');
res = await call('/api/send', { method: 'POST', body: form, headers: auth });
check('file over 4 MB -> 400', res.status === 400);

// unknown route
res = await call('/nope', { headers: auth });
check('unknown route -> 404', res.status === 404);

globalThis.fetch = realFetch;
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll worker self-tests pass.');
process.exit(failures ? 1 : 0);
