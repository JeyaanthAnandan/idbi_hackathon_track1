// ─────────────────────────────────────────────────────────────
// DeepSeek engine — MITRA's LLM brain.
// DeepSeek's API is OpenAI-compatible, so one thin client powers four
// standout capabilities, each grounded in the customer's computed data:
//   1. Reasoning mode   (deepseek-reasoner / R1) — visible chain-of-thought
//   2. Vernacular AI     — translate any reply into 8 Indian languages
//   3. Offer Analyzer    — scam / mis-selling detection with a verdict
//   4. NL goal creation  — turn plain English into a structured goal
//
// The whole app works WITHOUT a key (rule engine + hardcoded Hindi). Paste
// a key in Settings and these light up. Prototype note: for a real bank the
// key must live server-side — here it's client-side for a zero-backend demo.
// ─────────────────────────────────────────────────────────────
import { financialContext } from './advisor.js';

const KEY_STORAGE = 'mitra_deepseek_key';
const BASE = 'https://api.deepseek.com/chat/completions';
export const MODEL_CHAT = 'deepseek-chat';       // DeepSeek-V3
export const MODEL_REASONER = 'deepseek-reasoner'; // DeepSeek-R1

export const getDeepSeekKey = () => localStorage.getItem(KEY_STORAGE) || '';
export const setDeepSeekKey = (k) => localStorage.setItem(KEY_STORAGE, (k || '').trim());
export const hasDeepSeek = () => !!getDeepSeekKey();

// 8 languages — the accessibility story for a public-sector bank.
export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English', short: 'A' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी', short: 'अ' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்', short: 'அ' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు', short: 'అ' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা', short: 'অ' },
  { code: 'mr', label: 'Marathi', native: 'मराठी', short: 'म' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી', short: 'ગ' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ', short: 'ಕ' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം', short: 'മ' },
];
export const langLabel = (code) => LANGUAGES.find((l) => l.code === code)?.label || 'English';

// speech-synth BCP-47 tags per language
export const SPEECH_LANG = {
  en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', bn: 'bn-IN',
  mr: 'mr-IN', gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN',
};

// ── low-level: non-streaming completion ──────────────────────
export async function complete({ system, messages, model = MODEL_CHAT, json = false, temperature = 0.4, maxTokens = 700 }) {
  const key = getDeepSeekKey();
  if (!key) throw new Error('no-key');
  const body = {
    model,
    messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
    temperature,
    max_tokens: maxTokens,
  };
  if (json) body.response_format = { type: 'json_object' };
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('DeepSeek ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const data = await res.json();
  const msg = data.choices?.[0]?.message || {};
  return { content: msg.content || '', reasoning: msg.reasoning_content || '' };
}

// robust JSON extraction (models sometimes wrap in prose / code fences)
export function parseJSON(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch { /* try to slice */ }
  const a = cleaned.indexOf('{');
  const b = cleaned.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(cleaned.slice(a, b + 1)); } catch { /* give up */ }
  }
  return null;
}

// ── streaming reasoner: emits chain-of-thought, then the answer ──
// onReasoning(chunk) fires with R1's thinking tokens (the demo "wow");
// onAnswer(chunk) fires with the final answer tokens.
export async function reasonStream({ system, messages, onReasoning, onAnswer, signal }) {
  const key = getDeepSeekKey();
  if (!key) throw new Error('no-key');
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    signal,
    body: JSON.stringify({
      model: MODEL_REASONER,
      messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
      stream: true,
      max_tokens: 900,
    }),
  });
  if (!res.ok) throw new Error('DeepSeek ' + res.status);
  if (!res.body) {
    // environment without streaming — fall back to a single completion
    const { content, reasoning } = await complete({ system, messages, model: MODEL_REASONER });
    if (reasoning) onReasoning?.(reasoning);
    onAnswer?.(content);
    return { reasoning, answer: content };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let reasoning = '';
  let answer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') continue;
      let json;
      try { json = JSON.parse(payload); } catch { continue; }
      const delta = json.choices?.[0]?.delta || {};
      if (delta.reasoning_content) { reasoning += delta.reasoning_content; onReasoning?.(delta.reasoning_content); }
      if (delta.content) { answer += delta.content; onAnswer?.(delta.content); }
    }
  }
  return { reasoning, answer };
}

// ── Feature 1: grounded free-form answer with visible reasoning ──
export function chatMessages(history, userText) {
  return [
    ...history.slice(-6).map((m) => ({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text })),
    { role: 'user', content: userText },
  ];
}

// ── Feature 2: translate a finished reply, preserving all numbers ──
export async function translate(text, langCode) {
  if (langCode === 'en' || !text) return text;
  const target = langLabel(langCode);
  const { content } = await complete({
    system: `You are a translator for an Indian banking app. Translate the user's message into ${target}. Rules: keep ALL numbers, ₹ amounts, %, years, and product names (SIP, ELSS, FD, 80C, NIFTY) EXACTLY as-is. Keep it warm and conversational. Output ONLY the translation, nothing else.`,
    messages: [{ role: 'user', content: text }],
    temperature: 0.2,
    maxTokens: 600,
  });
  return content.trim() || text;
}

// ── Feature 3: analyze a suspicious investment/insurance offer ──
export async function analyzeOffer(offerText) {
  const { content } = await complete({
    system: `You are MITRA, a fraud-aware financial guardian for IDBI Bank customers in India. Analyze the investment/insurance/loan offer the user pastes. Respond ONLY with JSON of this exact shape:
{"verdict":"safe|caution|avoid","score":0-100,"headline":"one short sentence","redFlags":["..."],"hiddenCosts":["..."],"realityCheck":"one line on whether the returns/claims are realistic vs SEBI/RBI norms","action":"one clear next step"}
Judge against Indian norms: guaranteed returns above ~8% are a red flag; SEBI-registered products can't promise fixed market returns; urgency, personal-UPI collection, unregistered entities, and Telegram/WhatsApp tips are classic scams. score = safety (100 safe, 0 dangerous).`,
    messages: [{ role: 'user', content: offerText }],
    json: true,
    temperature: 0.2,
    maxTokens: 600,
  });
  return parseJSON(content);
}

// ── Feature 4: extract a structured goal from plain English ──
export async function extractGoal(text) {
  const { content } = await complete({
    system: `Extract a financial goal from the user's message for an Indian wealth app. Respond ONLY with JSON:
{"ok":true,"name":"short goal name","target":<rupees as integer>,"years":<number>,"note":"one friendly line"}
If they gave no clear amount, estimate a sensible ₹ cost in India and set "estimated":true. If it isn't a goal at all, return {"ok":false}. Convert lakh/crore to integers (1 lakh=100000, 1 crore=10000000).`,
    messages: [{ role: 'user', content: text }],
    json: true,
    temperature: 0.3,
    maxTokens: 300,
  });
  return parseJSON(content);
}

export { financialContext };
