/* Fax Relay — client. Holds no credentials; talks only to the relay Worker. */

const $ = (id) => document.getElementById(id);
const els = {
  to: $('to'), file: $('file'), drop: $('drop'), dropText: $('dropText'),
  dropSize: $('dropSize'), send: $('send'), note: $('note'), tape: $('tape'),
  lamp: $('lamp'), activity: $('activity'), endpoint: $('endpoint'), code: $('code'),
};

const cfg = {
  get endpoint() { return (localStorage.getItem('relay.endpoint') || '').replace(/\/$/, ''); },
  set endpoint(v) { localStorage.setItem('relay.endpoint', v || ''); },
  get code() { return localStorage.getItem('relay.code') || ''; },
  set code(v) { localStorage.setItem('relay.code', v || ''); },
};

let picked = null;
let lineNo = 0;

/* ---------- storage: sent history + offline queue ---------- */
const DB_NAME = 'fax-relay';
const openDb = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB_NAME, 1);
  r.onupgradeneeded = () => {
    const db = r.result;
    if (!db.objectStoreNames.contains('sent')) db.createObjectStore('sent', { keyPath: 'localId' });
    if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'localId' });
  };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

async function tx(store, mode, fn) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  });
}

const putSent = (rec) => tx('sent', 'readwrite', (s) => s.put(rec));
const allSent = () => tx('sent', 'readonly', (s) => s.getAll());
const putQueued = (rec) => tx('queue', 'readwrite', (s) => s.put(rec));
const allQueued = () => tx('queue', 'readonly', (s) => s.getAll());
const dropQueued = (id) => tx('queue', 'readwrite', (s) => s.delete(id));

/* ---------- transmission tape ---------- */
function tapeReset() {
  lineNo = 0;
  els.tape.innerHTML = '';
}

function tapeLine(text, tone) {
  if (!lineNo) els.tape.innerHTML = '';
  lineNo += 1;
  const row = document.createElement('div');
  row.className = 'line';
  const n = document.createElement('span');
  n.className = 'n';
  n.textContent = String(lineNo).padStart(2, '0');
  const t = document.createElement('span');
  t.className = 't';
  if (tone) t.dataset.tone = tone;
  t.textContent = text;
  row.append(n, t);
  els.tape.append(row);
  els.tape.scrollTop = els.tape.scrollHeight;
  return t;
}

function tapeWaiting(text) {
  const t = tapeLine(text);
  const caret = document.createElement('span');
  caret.className = 'caret';
  t.append(' ', caret);
  return () => caret.remove();
}

function tapeReport({ to, pages, id, provider, started }) {
  const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
  const box = document.createElement('div');
  box.className = 'report';
  box.innerHTML = `<dl>
    <dt>To</dt><dd>${escape(to)}</dd>
    <dt>Pages</dt><dd>${pages ?? '—'}</dd>
    <dt>Duration</dt><dd>${seconds}s</dd>
    <dt>Carrier</dt><dd>${escape(provider)}</dd>
    <dt>Reference</dt><dd>${escape(String(id).slice(0, 18))}</dd>
  </dl>`;
  els.tape.append(box);
}

const escape = (s) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- ui state ---------- */
function lamp(state, text) {
  els.lamp.dataset.state = state;
  els.lamp.textContent = text;
}

function note(text, tone) {
  els.note.textContent = text || '';
  if (tone) els.note.dataset.tone = tone; else delete els.note.dataset.tone;
}

function refreshSendButton() {
  els.send.disabled = !(picked && els.to.value.replace(/\D/g, '').length >= 10);
}

function formatSize(bytes) {
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function acceptFile(file) {
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) {
    note(`${file.name} is ${formatSize(file.size)}. The fax carrier's limit is 4 MB.`, 'fault');
    return;
  }
  picked = file;
  els.drop.dataset.loaded = 'true';
  els.dropText.textContent = file.name;
  els.dropSize.textContent = `${formatSize(file.size)} — tap to replace`;
  note('');
  refreshSendButton();
}

/* ---------- activity list ---------- */
async function renderActivity() {
  const rows = (await allSent()).sort((a, b) => b.started - a.started).slice(0, 25);
  if (!rows.length) {
    els.activity.innerHTML = '<p class="empty-row">Nothing sent yet.</p>';
    return;
  }
  els.activity.innerHTML = rows.map((r) => `
    <div class="log-item">
      <span>${escape(r.to)}</span>
      <span class="state" data-s="${escape(r.status)}">${escape(r.status)}</span>
      <span class="meta">${escape(r.filename)} · ${new Date(r.started).toLocaleString()}${r.error ? ` · ${escape(r.error)}` : ''}</span>
    </div>`).join('');
}

/* ---------- network ---------- */
async function postFax(rec, blob) {
  const body = new FormData();
  body.append('to', rec.to);
  body.append('file', blob, rec.filename);

  const headers = {};
  if (cfg.code) headers['X-Access-Code'] = cfg.code;

  const res = await fetch(`${cfg.endpoint}/api/send`, { method: 'POST', body, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Relay returned ${res.status}.`);
  return data;
}

async function pollStatus(id) {
  const headers = {};
  if (cfg.code) headers['X-Access-Code'] = cfg.code;
  const res = await fetch(`${cfg.endpoint}/api/status?id=${encodeURIComponent(id)}`, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Status check returned ${res.status}.`);
  return data;
}

/* ---------- send flow ---------- */
async function send() {
  if (!cfg.endpoint) {
    note('Set the relay address in Relay settings first.', 'fault');
    return;
  }
  const rec = {
    localId: crypto.randomUUID(),
    to: els.to.value.trim(),
    filename: picked.name,
    type: picked.type,
    started: Date.now(),
    status: 'queued',
  };
  const blob = picked;

  els.send.disabled = true;
  tapeReset();
  lamp('working', 'Sending');
  tapeLine(`TO   ${rec.to}`);
  tapeLine(`FILE ${rec.filename} (${formatSize(blob.size)})`);

  if (!navigator.onLine) {
    await putQueued({ ...rec, blob });
    await putSent({ ...rec, status: 'queued' });
    tapeLine('OFFLINE — HELD IN QUEUE');
    lamp('offline', 'Offline');
    await registerSync();
    await renderActivity();
    resetForm();
    return;
  }

  const stop = tapeWaiting('DIALING');
  try {
    const sent = await postFax(rec, blob);
    stop();
    tapeLine(`CONNECT — ${sent.provider.toUpperCase()}`);
    tapeLine(`REF  ${sent.id}`);
    await putSent({ ...rec, id: sent.id, provider: sent.provider, status: sent.status || 'queued' });
    await renderActivity();
    resetForm();
    watch({ ...rec, id: sent.id, provider: sent.provider });
  } catch (err) {
    stop();
    tapeLine(err.message.toUpperCase(), 'fault');
    lamp('fault', 'Failed');
    note(err.message, 'fault');
    await putSent({ ...rec, status: 'failed', error: err.message });
    await renderActivity();
    els.send.disabled = false;
  }
}

/* Polls until the carrier reports a terminal state, then prints the report.
   10s spacing: FaxDrop refreshes upstream status at most once every 10s per
   fax, so polling faster learns nothing and only spends rate limit. */
async function watch(rec) {
  const stop = tapeWaiting('TRANSMITTING');
  const deadline = Date.now() + 5 * 60 * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10000));
    let s;
    try {
      s = await pollStatus(rec.id);
    } catch {
      continue; // transient; keep polling until the deadline
    }
    if (s.status === 'delivered') {
      stop();
      tapeLine('OK — DELIVERED', 'ok');
      tapeReport({ ...rec, pages: s.pages, started: rec.started });
      lamp('ready', 'Ready');
      await putSent({ ...rec, status: 'delivered', pages: s.pages ?? null });
      return renderActivity();
    }
    if (s.status === 'partial') {
      stop();
      tapeLine(`PARTIAL — SOME PAGES DID NOT ARRIVE${s.error ? ` (${String(s.error).toUpperCase()})` : ''}`, 'fault');
      lamp('fault', 'Partial');
      await putSent({ ...rec, status: 'partial', pages: s.pages ?? null, error: s.error || 'Some pages did not arrive' });
      return renderActivity();
    }
    if (s.status === 'failed') {
      stop();
      tapeLine(`FAILED — ${(s.error || 'NO ANSWER').toUpperCase()}`, 'fault');
      lamp('fault', 'Failed');
      await putSent({ ...rec, status: 'failed', error: s.error || 'No answer' });
      return renderActivity();
    }
  }
  stop();
  tapeLine('STATUS UNCONFIRMED — CHECK ACTIVITY LATER');
  lamp('ready', 'Ready');
  await putSent({ ...rec, status: 'unknown' });
  return renderActivity();
}

function resetForm() {
  picked = null;
  els.file.value = '';
  els.drop.dataset.loaded = 'false';
  els.dropText.textContent = 'Choose a PDF, JPEG or PNG';
  els.dropSize.textContent = '4 MB limit';
  refreshSendButton();
}

/* ---------- offline queue drain ---------- */
async function registerSync() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if ('sync' in reg) await reg.sync.register('drain-fax-queue');
  } catch { /* Background Sync unsupported; the online listener covers it */ }
}

async function drainQueue() {
  if (!navigator.onLine || !cfg.endpoint) return;
  for (const rec of await allQueued()) {
    try {
      const sent = await postFax(rec, rec.blob);
      await dropQueued(rec.localId);
      await putSent({ ...rec, blob: undefined, id: sent.id, provider: sent.provider, status: sent.status || 'queued' });
    } catch (err) {
      // The carrier may accept a fax even when the response is lost, and a
      // blind retry can send a duplicate. Only a network-level failure (our
      // relay never answered while we look offline again) stays queued; any
      // answered error leaves the queue and asks for a deliberate resend.
      if (err instanceof TypeError) continue;
      await dropQueued(rec.localId);
      await putSent({ ...rec, blob: undefined, status: 'failed', error: `${err.message} — not retried automatically; send again if FaxDrop sent no confirmation email.` });
    }
  }
  await renderActivity();
}

/* ---------- wiring ---------- */
els.drop.addEventListener('click', () => els.file.click());
els.file.addEventListener('change', (e) => acceptFile(e.target.files[0]));
els.to.addEventListener('input', refreshSendButton);
els.send.addEventListener('click', send);

['dragenter', 'dragover'].forEach((evt) =>
  els.drop.addEventListener(evt, (e) => { e.preventDefault(); els.drop.classList.add('is-over'); }));
['dragleave', 'drop'].forEach((evt) =>
  els.drop.addEventListener(evt, (e) => { e.preventDefault(); els.drop.classList.remove('is-over'); }));
els.drop.addEventListener('drop', (e) => acceptFile(e.dataTransfer.files[0]));

els.endpoint.value = cfg.endpoint;
els.code.value = cfg.code;
els.endpoint.addEventListener('change', (e) => { cfg.endpoint = e.target.value.trim(); });
els.code.addEventListener('change', (e) => { cfg.code = e.target.value.trim(); });

window.addEventListener('online', () => { lamp('ready', 'Ready'); drainQueue(); });
window.addEventListener('offline', () => lamp('offline', 'Offline'));

if (!navigator.onLine) lamp('offline', 'Offline');
else if (!cfg.endpoint) {
  lamp('fault', 'Not linked');
  note('Add the relay address under Relay settings to start sending.');
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'drain-queue') drainQueue();
  });
}

renderActivity();
drainQueue();
