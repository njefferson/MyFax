/**
 * Sandbox smoke test — exercises the REAL FaxDrop API with an fd_test_ key.
 * No fax is sent and no credits are spent: sandbox sends never reach a
 * carrier and return an immediately-"completed" fdtest_ fax.
 *
 * This is the live half of verification: it proves our field names, auth
 * header, and status parsing against FaxDrop's actual servers (the worker
 * self-test proves our logic against a stub).
 *
 * Env: FAXDROP_TEST_API_KEY (must start with fd_test_ — this script refuses
 * to run with a live key), optional SENDER_EMAIL.
 * Run: FAXDROP_TEST_API_KEY=fd_test_… node tools/sandbox-smoke.mjs
 */

const KEY = process.env.FAXDROP_TEST_API_KEY || '';
if (!KEY) {
  console.log('SKIP  FAXDROP_TEST_API_KEY not set — sandbox smoke not run.');
  process.exit(0);
}
if (!KEY.startsWith('fd_test_')) {
  console.error('REFUSED  FAXDROP_TEST_API_KEY is not an fd_test_ key. This script never runs with a live key — a real fax could be sent.');
  process.exit(1);
}

let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ` — ${detail}`}`);
  if (!cond) failures += 1;
};

// A minimal one-page PDF, generated inline (no fixture file needed).
const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj
4 0 obj<</Length 44>>stream
BT /F1 24 Tf 72 720 Td (SANDBOX TEST) Tj ET
endstream
endobj
xref
0 5
trailer<</Size 5/Root 1 0 R>>
%%EOF`;

const form = new FormData();
form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'sandbox-test.pdf');
form.append('recipientNumber', '+12125550100');
form.append('senderName', 'Fax Relay CI');
form.append('senderEmail', process.env.SENDER_EMAIL || 'ci@example.com');

const sendRes = await fetch('https://www.faxdrop.com/api/send-fax', {
  method: 'POST',
  headers: { 'X-API-Key': KEY },
  body: form,
});
const sendBody = await sendRes.json().catch(() => ({}));
check('sandbox send accepted (200)', sendRes.ok, `${sendRes.status} ${JSON.stringify(sendBody)}`);
check('response has success + faxId', sendBody.success === true && typeof sendBody.faxId === 'string', JSON.stringify(sendBody));
check('sandbox faxId is synthetic (fdtest_)', String(sendBody.faxId || '').startsWith('fdtest_'), String(sendBody.faxId));

if (sendBody.faxId) {
  const stRes = await fetch(`https://www.faxdrop.com/api/v1/fax/${encodeURIComponent(sendBody.faxId)}`, {
    headers: { 'X-API-Key': KEY },
  });
  const st = await stRes.json().catch(() => ({}));
  check('status endpoint answers (200)', stRes.ok, `${stRes.status} ${JSON.stringify(st)}`);
  check('sandbox fax is completed', st.status === 'completed', JSON.stringify(st));
}

// Balance is documented but sandbox keys get a 400 from it (observed in CI,
// 2026-07-25 — test keys are isolated from live account data), so this is
// informational only and never fails the run.
const balRes = await fetch('https://www.faxdrop.com/api/v1/account/balance', { headers: { 'X-API-Key': KEY } });
const bal = await balRes.json().catch(() => ({}));
console.log(`INFO  balance endpoint: ${balRes.status} — keys: ${Object.keys(bal).join(', ') || '(empty)'}${bal.hint ? ` — hint: ${bal.hint}` : ''}`);

console.log(failures ? `\n${failures} smoke check(s) FAILED` : '\nSandbox smoke passes — field names and parsing verified against the live API.');
process.exit(failures ? 1 : 0);
