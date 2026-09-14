// ─────────────────────────────────────────────────────────────
// Sarvam AI engine — MITRA's Indian-language voice + language layer.
//
// The Web Speech API was the weak link in the demo: on most devices there
// simply is no Tamil / Telugu / Kannada / Malayalam voice installed, mic
// dictation needs the language picked *before* you speak, and quality
// swings wildly between Chrome, Safari and Android. Sarvam closes that gap
// with models built for India:
//
//   1. Bulbul v3   (/text-to-speech)  — 11 Indian languages, 38 human voices
//   2. Saaras v3   (/speech-to-text)  — 23 languages, and auto-detects which
//                                       one the customer just spoke
//   3. Mayura v1   (/translate)       — code-mixed "how India actually talks"
//                                       translation that keeps SIP/ELSS/₹ intact
//
// Everything degrades gracefully: no key → speech.js falls straight back to
// the Web Speech API, exactly as before.
//
// Prototype note: the key is read from VITE_SARVAM_API_KEY (or a Settings
// override in localStorage) and called from the browser. Sarvam sends
// `access-control-allow-origin: *`, so this works with zero backend — but a
// production bank build must proxy these calls server-side.
// ─────────────────────────────────────────────────────────────

import { ADVISOR_SYSTEM_PROMPT } from './advisorPrompt.js';
const BASE = 'https://api.sarvam.ai';
const KEY_STORAGE = 'mitra_sarvam_key';
const SPEAKER_STORAGE = 'mitra_sarvam_speaker';

export const TTS_MODEL = 'bulbul:v3';
export const STT_MODEL = 'saaras:v3';
export const TRANSLATE_MODEL = 'mayura:v1';
export const ADVISOR_ROUTER_MODEL = 'sarvam-105b';

// Bulbul v3 request limits, confirmed against the live API.
const MAX_CHARS_PER_INPUT = 500;
const MAX_INPUTS_PER_CALL = 3; // the 3 chunks come back merged as ONE wav

// ── key handling ─────────────────────────────────────────────
// A key saved in Settings wins over the build-time env var, so a judge can
// paste their own key on a deployed build without a rebuild.
const envKey = (import.meta.env?.VITE_SARVAM_API_KEY || '').trim();

export function getSarvamKey() {
  try {
    return (localStorage.getItem(KEY_STORAGE) || '').trim() || envKey;
  } catch {
    return envKey;
  }
}
export const setSarvamKey = (k) => localStorage.setItem(KEY_STORAGE, (k || '').trim());
export const clearSarvamKey = () => localStorage.removeItem(KEY_STORAGE);
export const hasSarvam = () => !!getSarvamKey();
// true when the key shipped with the build rather than being pasted in Settings
export const sarvamKeyFromEnv = () => {
  try {
    return !localStorage.getItem(KEY_STORAGE) && !!envKey;
  } catch {
    return !!envKey;
  }
};

// ── language mapping ─────────────────────────────────────────
// MITRA's short app codes ↔ the BCP-47 tags Sarvam speaks.
export const SARVAM_LANG = {
  en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', bn: 'bn-IN',
  mr: 'mr-IN', gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN',
  pa: 'pa-IN', od: 'od-IN',
};
export const toSarvamLang = (code) => SARVAM_LANG[code] || 'en-IN';
// Saaras detects 23 languages; map the ones MITRA can actually reply in and
// let anything else fall back to English rather than answering in a language
// the rest of the app has no copy for.
export const fromSarvamLang = (bcp47) => {
  const short = (bcp47 || '').split('-')[0];
  return Object.prototype.hasOwnProperty.call(SARVAM_LANG, short) ? short : null;
};

// ── voices ───────────────────────────────────────────────────
// A curated shortlist from Bulbul v3's 38-voice roster. MITRA is a warm,
// trustworthy bank advisor, so the default is a warm conversational female
// voice; the rest are offered in Settings.
export const SARVAM_SPEAKERS = [
  { id: 'neha', label: 'Neha', tone: 'Warm · conversational (default)' },
  { id: 'priya', label: 'Priya', tone: 'Warm · friendly, built for IVR' },
  { id: 'pooja', label: 'Pooja', tone: 'Warm · friendly' },
  { id: 'ritu', label: 'Ritu', tone: 'Calm · professional' },
  { id: 'kavya', label: 'Kavya', tone: 'Calm · professional' },
  { id: 'shreya', label: 'Shreya', tone: 'Calm · narration' },
  { id: 'tanya', label: 'Tanya', tone: 'Young · energetic' },
  { id: 'suhani', label: 'Suhani', tone: 'Young · energetic' },
  { id: 'kabir', label: 'Kabir', tone: 'Male · warm professional' },
  { id: 'rahul', label: 'Rahul', tone: 'Male · conversational' },
  { id: 'anand', label: 'Anand', tone: 'Male · mature professional' },
  { id: 'aditya', label: 'Aditya', tone: 'Male · news anchor' },
];
export const DEFAULT_SPEAKER = 'neha';
export const getSarvamSpeaker = () => localStorage.getItem(SPEAKER_STORAGE) || DEFAULT_SPEAKER;
export const setSarvamSpeaker = (s) => localStorage.setItem(SPEAKER_STORAGE, s || DEFAULT_SPEAKER);

// ── shared request helper ────────────────────────────────────
// Retries matter more here than anywhere else in the app: without them a
// single dropped connection (measured at roughly 1 in 8 on rapid-fire calls)
// drops MITRA to the browser's robotic voice mid-conversation, which reads to
// the customer as the product breaking. Transient faults — network errors,
// 429s and 5xxs — are retried; 4xxs are real bugs and fail fast.
const RETRIES = 2;
const REQUEST_TIMEOUT_MS = 15000;
const isTransient = (status) => status === 429 || status >= 500;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function requestSignal(signal) {
  if (typeof AbortSignal === 'undefined') return signal;
  const timeout = AbortSignal.timeout?.(REQUEST_TIMEOUT_MS);
  if (!signal) return timeout;
  if (!timeout) return signal;
  return AbortSignal.any?.([signal, timeout]) || signal;
}

async function sarvamFetch(path, { body, form, signal, retries = RETRIES }) {
  const key = getSarvamKey();
  if (!key) throw new Error('no-sarvam-key');
  const headers = { 'api-subscription-key': key };
  if (body) headers['content-type'] = 'application/json';

  const effectiveSignal = requestSignal(signal);
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await wait(250 * 2 ** (attempt - 1)); // 250ms, 500ms
    try {
      const res = await fetch(BASE + path, {
        method: 'POST',
        headers,
        signal: effectiveSignal,
        // FormData is single-use, so a retried multipart body must be rebuilt
        body: form ? (typeof form === 'function' ? form() : form) : JSON.stringify(body),
      });
      if (res.ok) return res.json();
      const detail = await res.text().catch(() => '');
      lastError = new Error(`Sarvam ${path} ${res.status} ${detail.slice(0, 200)}`);
      if (!isTransient(res.status)) throw lastError; // bad key / bad request
    } catch (err) {
      // an aborted request is the customer interrupting — never retry that
      if ((err?.name === 'AbortError' || err?.name === 'TimeoutError') && effectiveSignal?.aborted) {
        if (signal?.aborted) throw err;
        lastError = new Error(`Sarvam ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`);
        break;
      }
      lastError = err;
      if (err.message?.startsWith('Sarvam ') && !/ (429|5\d\d) /.test(err.message)) throw err;
    }
  }
  console.warn('[MITRA voice] Sarvam request failed', { path, error: lastError?.message || String(lastError) });
  throw lastError;
}

// ── text preparation ─────────────────────────────────────────
// MITRA's replies are written for the eye: markdown, emoji, ₹ symbols and
// abbreviations like "p.a." that a TTS engine reads as a sentence break.
// Spoken output needs them normalised first.
export function speechify(text, lang = 'en') {
  return (text || '')
    .replace(/[*_#`]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\bp\.\s?a\.\s?/gi, 'per annum ')
    .replace(/\bp\.\s?m\.\s?/gi, 'per month ')
    .replace(/\bi\.e\.\s?/gi, 'that is ')
    .replace(/\be\.g\.\s?/gi, 'for example ')
    .replace(/₹\s?/g, lang === 'en' ? 'Rs ' : '₹')
    .replace(/\/mo\b/gi, ' per month')
    .replace(/\s+/g, ' ')
    .trim();
}

// Synthesis time scales with how much text you send: ~1.9s for one sentence,
// ~4.3s for a whole reply, ~5.5s for a packed batch. Sending everything at once
// means the customer stares at MITRA's text in silence for five seconds. So the
// FIRST batch is deliberately just the opening line — audio starts in about two
// seconds, and the rest is synthesized while that line is still playing.
// Don't lead with "Done." — per-call overhead dominates a tiny clip. And don't
// shrink the lead further than a sentence either: measured, a ~35-char lead
// finishes speaking (~2.5s) before the following batch finishes synthesizing
// (~3.8s), which stutters. A whole opening sentence plays long enough to cover
// the next batch's synthesis, so the sentence is the right unit.
const LEAD_MIN_CHARS = 60;

export function planBatches(chunks) {
  if (chunks.length <= 1) return [chunks];
  const lead = [chunks[0]];
  const chunksAfterLead = chunks.slice(1);
  let i = 0;
  // a very short opener gets a companion so the lead clip is worth the call
  while (i < chunksAfterLead.length && lead.join(' ').length < LEAD_MIN_CHARS && lead.length < MAX_INPUTS_PER_CALL) {
    lead.push(chunksAfterLead[i++]);
  }
  const batches = [lead];
  for (; i < chunksAfterLead.length; i += MAX_INPUTS_PER_CALL) {
    batches.push(chunksAfterLead.slice(i, i + MAX_INPUTS_PER_CALL));
  }
  return batches;
}

// Split on sentence boundaries, capped at Bulbul's 500-char per-input limit,
// so a long reply is spoken whole instead of being truncated.
export function chunkForTTS(text, limit = MAX_CHARS_PER_INPUT) {
  const chunks = [];
  // Split on sentence ends only — a '.' between digits is a decimal, not a
  // full stop. Without this guard "₹54.7 L" splits into "₹54." and "7 L",
  // and MITRA reads the customer's projection back as two wrong numbers.
  const sentences = text.match(/[^.!?।]*?(?:\d\.\d[^.!?।]*?)*(?:[.!?।]+|$)/g) || [text];
  for (const sentence of sentences) {
    const s = sentence.trim();
    if (!s) continue;
    if (s.length <= limit) {
      chunks.push(s);
      continue;
    }
    // a single monster sentence — fall back to hard word wrapping
    let current = '';
    for (const word of s.split(' ')) {
      if (current && (current + ' ' + word).length > limit) {
        chunks.push(current);
        current = '';
      }
      current += (current ? ' ' : '') + word;
    }
    if (current) chunks.push(current);
  }
  return chunks.length ? chunks : [text.slice(0, limit)];
}

// ── 1. Text to speech (Bulbul v3) ────────────────────────────
// Returns playable blob URLs. Batched 3 chunks per call because Sarvam
// merges a batch into a single wav — fewer round trips, one seamless clip.
// `onBatch` fires as each batch lands, so playback can start on the first one
// instead of waiting for a long reply to finish synthesizing end to end.
// Batches run in sequence deliberately: firing them in parallel raised the
// chance that one would trip a rate limit and take the whole utterance down.
export async function synthesize(text, { lang = 'en', speaker = getSarvamSpeaker(), pace = 1.0, signal, onBatch } = {}) {
  const clean = speechify(text, lang);
  if (!clean) return [];
  const batches = planBatches(chunkForTTS(clean));
  const all = [];
  for (const inputs of batches) {
    const r = await sarvamFetch('/text-to-speech', {
      signal,
      body: {
        inputs,
        target_language_code: toSarvamLang(lang),
        speaker,
        model: TTS_MODEL,
        pace,
        enable_preprocessing: true, // normalises numbers/dates/code-mix
      },
    });
    const urls = (r.audios || []).map(base64ToWavUrl);
    all.push(...urls);
    onBatch?.(urls);
  }
  return all;
}

function base64ToWavUrl(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
}

// ── 2. Speech to text (Saaras v3) ────────────────────────────
// language_code 'unknown' lets the customer just *speak* — Saaras identifies
// the language and hands back the tag, which is what powers MITRA switching
// languages on her own.
// Saaras matches the uploaded part's content type against an exact allowlist,
// so the ';codecs=opus' suffix MediaRecorder appends has to be stripped:
// 'audio/webm' is accepted, 'audio/webm;codecs=opus' is rejected outright.
const STT_MIME = {
  'audio/webm': 'webm', 'video/webm': 'webm', 'audio/ogg': 'ogg', 'audio/opus': 'opus',
  'audio/mp4': 'mp4', 'audio/x-m4a': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
  'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/aac': 'aac', 'audio/flac': 'flac',
};

export async function transcribe(blob, { lang = null, signal } = {}) {
  const base = (blob.type || '').split(';')[0].trim().toLowerCase();
  // an unrecognised container still goes through — the API sniffs octet-stream
  const type = STT_MIME[base] ? base : 'application/octet-stream';
  const ext = STT_MIME[base] || 'webm';
  // a factory, not an instance: FormData is consumed by fetch, so each retry
  // attempt needs a fresh body
  const form = () => {
    const f = new FormData();
    f.append('file', new Blob([blob], { type }), `speech.${ext}`);
    f.append('model', STT_MODEL);
    f.append('language_code', lang ? toSarvamLang(lang) : 'unknown');
    return f;
  };
  const data = await sarvamFetch('/speech-to-text', { form, signal });
  return {
    transcript: (data.transcript || '').trim(),
    detected: fromSarvamLang(data.language_code),
    detectedRaw: data.language_code || '',
    confidence: data.language_probability ?? 0,
  };
}

// ── 3. Translation (Mayura v1) ───────────────────────────────
// 'modern-colloquial' is deliberate: it keeps SIP, equity fund, ELSS and ₹
// figures in English inside a native-script sentence — which is exactly how
// an Indian customer discusses money, and it keeps the numbers auditable.
export async function translateSarvam(text, langCode, { signal, mode = 'modern-colloquial' } = {}) {
  if (!text || langCode === 'en') return text;
  const data = await sarvamFetch('/translate', {
    signal,
    body: {
      input: speechify(text, 'en'),
      source_language_code: 'en-IN',
      target_language_code: toSarvamLang(langCode),
      model: TRANSLATE_MODEL,
      mode,
      numerals_format: 'international', // keep ₹ figures readable as digits
      speaker_gender: 'Female',
      enable_preprocessing: true,
    },
  });
  return (data.translated_text || '').trim() || text;
}

// The reverse direction: a question asked in any Indian language, turned into
// English so MITRA's deterministic advisory engine can answer it. This is what
// lets one audited rule set serve all nine languages instead of nine forks.
// Chips and typed English are already Latin script — skipping those saves a
// full round trip on the most common interaction while in vernacular mode.
export const isLatinScript = (text) => !/[^\u0000-\u024F\u2000-\u206F\u20A0-\u20CF]/.test(text || '');

export async function translateToEnglish(text, { signal } = {}) {
  if (!text || isLatinScript(text)) return text;
  const data = await sarvamFetch('/translate', {
    signal,
    body: {
      input: text,
      source_language_code: 'auto',
      target_language_code: 'en-IN',
      model: TRANSLATE_MODEL,
      numerals_format: 'international',
    },
  });
  return (data.translated_text || '').trim() || text;
}

// The model selects a narrowly-scoped financial tool; it never writes the
// recommendation itself. The deterministic engine executes the validated call.
export async function selectSarvamAdvisorTool({ messages, tools, signal, system = ADVISOR_SYSTEM_PROMPT }) {
  const data = await sarvamFetch('/v1/chat/completions', {
    signal,
    body: {
      model: ADVISOR_ROUTER_MODEL,
      messages: [
        {
          role: 'system',
          content: system,
        },
        ...messages,
      ],
      tools,
      tool_choice: 'required',
      temperature: 0.1,
      max_tokens: 220,
    },
  });
  const call = data.choices?.[0]?.message?.tool_calls?.[0]?.function;
  if (!call?.name) throw new Error('Sarvam returned no advisor tool');
  let args = {};
  try { args = JSON.parse(call.arguments || '{}'); } catch { throw new Error('Sarvam returned invalid tool arguments'); }
  return { name: call.name, arguments: args };
}

// Cheap connectivity check for the Settings panel.
export async function verifySarvamKey() {
  await sarvamFetch('/text-to-speech', {
    body: {
      inputs: ['Namaste'],
      target_language_code: 'en-IN',
      speaker: DEFAULT_SPEAKER,
      model: TTS_MODEL,
    },
  });
  return true;
}
