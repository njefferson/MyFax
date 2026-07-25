/**
 * Fax relay — Cloudflare Worker
 *
 * Exists because a PWA cannot hold a provider API key and no fax provider
 * permits browser-origin CORS. All provider credentials live in Worker secrets.
 *
 * Routes
 *   POST /api/send      multipart: to, file, [note]   -> { id, provider, status }
 *   GET  /api/status    ?id=...                       -> { id, status, pages, error }
 *   GET  /api/health                                  -> { ok, provider }
 *
 * Adapter contract — every provider module implements exactly:
 *   send({ to, filename, bytes, contentType, note, env }) -> { id, status }
 *   status({ id, env })                                   -> { status, pages, error }
 * Status vocabulary is normalized to: queued | sending | delivered | failed | unknown
 */

const NORMALIZED = ['queued', 'sending', 'delivered', 'failed', 'unknown'];

/* ------------------------------------------------------------------ *
 * Adapter: FaxDrop  (default — free tier)
 * Endpoints per faxdrop.com published docs (read 2026-07-25):
 *   send:   POST /api/send-fax        multipart, X-API-Key header
 *   status: GET  /api/v1/fax/{id}     -> { id, status, pages, error, ... }
 * Rate limits: 10/min, 100/hr, 500/day — status polls count toward them.
 * Not yet exercised against a live API key; see NOTES.md.
 * ------------------------------------------------------------------ */
const FAXDROP_BASE = 'https://www.faxdrop.com';
const FAXDROP_SEND_PATH = '/api/send-fax';

const faxdrop = {
  async send({ to, filename, bytes, contentType, env }) {
    const form = new FormData();
    form.append('to', to);
    form.append('file', new Blob([bytes], { type: contentType }), filename);
    // Free-tier sends always carry a cover page; the flag is accepted but
    // ignored unless the account is paid.
    form.append('includeCover', 'true');

    const res = await fetch(FAXDROP_BASE + FAXDROP_SEND_PATH, {
      method: 'POST',
      headers: { 'X-API-Key': env.FAXDROP_API_KEY },
      body: form,
    });
    const body = await safeJson(res);
    if (!res.ok) throw new ProviderError(res.status, body);
    return { id: body.id ?? body.faxId ?? body.fax_id, status: mapStatus(body.status) };
  },

  async status({ id, env }) {
    const res = await fetch(`${FAXDROP_BASE}/api/v1/fax/${encodeURIComponent(id)}`, {
      headers: { 'X-API-Key': env.FAXDROP_API_KEY },
    });
    const body = await safeJson(res);
    if (!res.ok) throw new ProviderError(res.status, body);
    return { status: mapStatus(body.status), pages: body.pages ?? null, error: body.error ?? null };
  },
};

/* ------------------------------------------------------------------ *
 * Adapter: Telnyx  (metered fallback, ~$0.007/page, no monthly minimum)
 * Telnyx sends from a hosted media_url, not a raw upload — the file is
 * staged in R2 first and served from a public bucket URL that Telnyx
 * fetches. Requires bindings: MEDIA (R2), and vars TELNYX_CONNECTION_ID,
 * TELNYX_FROM, MEDIA_PUBLIC_BASE.
 * ------------------------------------------------------------------ */
const telnyx = {
  async send({ to, filename, bytes, contentType, env }) {
    if (!env.MEDIA || !env.MEDIA_PUBLIC_BASE) {
      throw new ProviderError(500, { error: 'Telnyx needs the MEDIA R2 binding and MEDIA_PUBLIC_BASE.' });
    }
    const key = `outbound/${crypto.randomUUID()}-${filename}`;
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType } });
    const mediaUrl = `${env.MEDIA_PUBLIC_BASE.replace(/\/$/, '')}/${key}`;

    const res = await fetch('https://api.telnyx.com/v2/faxes', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        connection_id: env.TELNYX_CONNECTION_ID,
        media_url: mediaUrl,
        to,
        from: env.TELNYX_FROM,
      }),
    });
    const body = await safeJson(res);
    if (!res.ok) throw new ProviderError(res.status, body);
    return { id: body.data?.id, status: mapStatus(body.data?.status) };
  },

  async status({ id, env }) {
    const res = await fetch(`https://api.telnyx.com/v2/faxes/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${env.TELNYX_API_KEY}` },
    });
    const body = await safeJson(res);
    if (!res.ok) throw new ProviderError(res.status, body);
    return {
      status: mapStatus(body.data?.status),
      pages: body.data?.page_count ?? null,
      error: body.data?.failure_reason ?? null,
    };
  },
};

const ADAPTERS = { faxdrop, telnyx };

/* ------------------------------------------------------------------ */

function mapStatus(raw) {
  const s = String(raw ?? '').toLowerCase();
  if (['queued', 'pending', 'media.processed', 'accepted'].includes(s)) return 'queued';
  if (['sending', 'sending.started', 'in_progress', 'dialing'].includes(s)) return 'sending';
  if (['delivered', 'sent', 'success', 'ok', 'completed'].includes(s)) return 'delivered';
  if (['failed', 'error', 'canceled', 'cancelled'].includes(s)) return 'failed';
  return 'unknown';
}

class ProviderError extends Error {
  constructor(status, body) {
    super(typeof body === 'string' ? body : JSON.stringify(body));
    this.status = status;
    this.body = body;
  }
}

async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Access-Code',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

function json(data, env, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(env) },
  });
}

/** Keeps the relay from being an open fax gun. Client sends X-Access-Code. */
function authorized(request, env) {
  if (!env.ACCESS_CODE) return true;
  return request.headers.get('X-Access-Code') === env.ACCESS_CODE;
}

/** E.164-ish. Strips formatting, requires 10 or 11 digits for NANP. */
function normalizeNumber(input) {
  const digits = String(input || '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  const bare = digits.replace(/^\+/, '');
  if (digits.startsWith('+')) return bare.length >= 8 ? `+${bare}` : null;
  if (bare.length === 10) return `+1${bare}`;
  if (bare.length === 11 && bare.startsWith('1')) return `+${bare}`;
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });

    const providerName = (env.PROVIDER || 'faxdrop').toLowerCase();
    const adapter = ADAPTERS[providerName];
    if (!adapter) return json({ error: `Unknown provider "${providerName}"` }, env, 500);

    if (url.pathname === '/api/health') {
      return json({ ok: true, provider: providerName, statuses: NORMALIZED }, env);
    }

    if (!authorized(request, env)) {
      return json({ error: 'Access code rejected. Check the code in Settings.' }, env, 401);
    }

    try {
      if (url.pathname === '/api/send' && request.method === 'POST') {
        const form = await request.formData();
        const to = normalizeNumber(form.get('to'));
        const file = form.get('file');

        if (!to) return json({ error: 'Fax number must be 10 digits, or +country code.' }, env, 400);
        if (!file || typeof file === 'string') return json({ error: 'Attach a file to send.' }, env, 400);
        if (file.size > 10 * 1024 * 1024) return json({ error: 'File is over the 10 MB limit.' }, env, 400);

        const bytes = new Uint8Array(await file.arrayBuffer());
        const result = await adapter.send({
          to,
          filename: file.name || 'document.pdf',
          bytes,
          contentType: file.type || 'application/pdf',
          note: form.get('note') || '',
          env,
        });
        return json({ ...result, provider: providerName, to }, env);
      }

      if (url.pathname === '/api/status' && request.method === 'GET') {
        const id = url.searchParams.get('id');
        if (!id) return json({ error: 'Missing id.' }, env, 400);
        const result = await adapter.status({ id, env });
        return json({ id, provider: providerName, ...result }, env);
      }
    } catch (err) {
      if (err instanceof ProviderError) {
        const detail = err.body?.error || err.body?.message || err.body?.raw || 'Provider rejected the request.';
        return json({ error: String(detail), providerStatus: err.status }, env, 502);
      }
      return json({ error: err.message || 'Relay failure.' }, env, 500);
    }

    return json({ error: 'Not found.' }, env, 404);
  },
};
