// AI provider proxy — the only place DeepSeek and Sarvam keys exist.
//
// The browser calls /api/ai/deepseek and /api/ai/sarvam/<path>; this module
// adds the key and forwards the request. Keys come from the server
// environment (DEEPSEEK_API_KEY / SARVAM_API_KEY; the older VITE_* names are
// accepted so an existing .env keeps working locally). They are never sent
// to the browser and never bundled into the web build.
//
// Requests are bounded so the proxy can't be used as a free general-purpose
// LLM endpoint: fixed model, capped tokens and payload size, an allow-list of
// Sarvam paths, and a per-client rate limit.

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
const SARVAM_BASE = 'https://api.sarvam.ai';
const SARVAM_PATHS = new Set(['/text-to-speech', '/speech-to-text', '/translate', '/v1/chat/completions']);
const SARVAM_CHAT_MODEL = 'sarvam-105b';

const deepseekKey = () => (process.env.DEEPSEEK_API_KEY || process.env.VITE_DEEPSEEK_API_KEY || '').trim();
const sarvamKey = () => (process.env.SARVAM_API_KEY || process.env.VITE_SARVAM_API_KEY || '').trim();

export const aiStatus = () => ({ deepseek: Boolean(deepseekKey()), sarvam: Boolean(sarvamKey()) });

// Sliding one-minute window per client. Per instance only — enough to stop a
// runaway loop or casual abuse of a public demo, not a production limiter.
const WINDOW_MS = 60_000;
const LIMITS = { deepseek: 30, sarvam: 90 };
const hits = new Map();
export function rateLimited(client, bucket, now = Date.now()) {
  const key = `${bucket}:${client}`;
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMITS[bucket]) { hits.set(key, recent); return true; }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

export function clientId(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

async function rawBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request is too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function send(res, status, body, contentType = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const problem = (res, status, title) => send(res, status, { type: 'about:blank', title, status });

// Only the fields MITRA's client uses are forwarded; the model is fixed here.
export function sanitizeDeepSeekBody(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.messages) || !input.messages.length || input.messages.length > 20) return null;
  const messages = input.messages.map((m) => ({ role: m?.role, content: m?.content }));
  if (messages.some((m) => !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string')) return null;
  if (messages.reduce((n, m) => n + m.content.length, 0) > 40_000) return null;
  const body = {
    model: DEEPSEEK_MODEL,
    messages,
    thinking: { type: input.thinking?.type === 'enabled' ? 'enabled' : 'disabled' },
    max_tokens: Math.min(Math.max(Number(input.max_tokens) || 700, 1), 4000),
  };
  if (Number.isFinite(input.temperature)) body.temperature = Math.min(Math.max(input.temperature, 0), 1.5);
  if (input.response_format?.type === 'json_object') body.response_format = { type: 'json_object' };
  if (Array.isArray(input.tools) && input.tools.length <= 40) {
    body.tools = input.tools;
    if (['required', 'auto', 'none'].includes(input.tool_choice)) body.tool_choice = input.tool_choice;
  }
  return body;
}

export async function proxyDeepSeek(req, res) {
  const key = deepseekKey();
  if (!key) return problem(res, 503, 'DeepSeek is not configured on the server');
  if (rateLimited(clientId(req), 'deepseek')) return problem(res, 429, 'Too many AI requests — try again in a minute');
  let input;
  try { input = JSON.parse((await rawBody(req, 200_000)).toString('utf8') || '{}'); }
  catch (error) { return problem(res, error.status || 400, error.status ? error.message : 'Request body must be valid JSON'); }
  const body = sanitizeDeepSeekBody(input);
  if (!body) return problem(res, 422, 'Invalid AI request');
  try {
    const upstream = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000), // under the 30 s API Gateway / Lambda limit
    });
    return send(res, upstream.status, Buffer.from(await upstream.arrayBuffer()), upstream.headers.get('content-type') || 'application/json');
  } catch {
    return problem(res, 504, 'DeepSeek did not respond in time');
  }
}

// Byte-for-byte forward so the multipart speech-to-text upload works too.
export async function proxySarvam(req, res, path) {
  const key = sarvamKey();
  if (!key) return problem(res, 503, 'Sarvam is not configured on the server');
  if (!SARVAM_PATHS.has(path)) return problem(res, 404, 'Not found');
  if (rateLimited(clientId(req), 'sarvam')) return problem(res, 429, 'Too many voice requests — try again in a minute');
  let body;
  try { body = await rawBody(req, 15_000_000); }
  catch (error) { return problem(res, error.status || 400, error.message); }
  if (path === '/v1/chat/completions') {
    // Same fence as DeepSeek: fixed model, bounded tokens.
    try {
      const input = JSON.parse(body.toString('utf8'));
      body = Buffer.from(JSON.stringify({ ...input, model: SARVAM_CHAT_MODEL, max_tokens: Math.min(Number(input.max_tokens) || 220, 1000) }));
    } catch { return problem(res, 400, 'Request body must be valid JSON'); }
  }
  try {
    const upstream = await fetch(SARVAM_BASE + path, {
      method: 'POST',
      headers: { 'api-subscription-key': key, 'content-type': req.headers['content-type'] || 'application/json' },
      body,
      signal: AbortSignal.timeout(25_000),
    });
    return send(res, upstream.status, Buffer.from(await upstream.arrayBuffer()), upstream.headers.get('content-type') || 'application/json');
  } catch {
    return problem(res, 504, 'Sarvam did not respond in time');
  }
}
