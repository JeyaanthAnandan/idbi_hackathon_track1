// ─────────────────────────────────────────────────────────────
// DeepSeek engine — constrained AI utilities for MITRA.
// The model writes replies to open questions from engine-computed facts
// (engine/composer.js), selects advisor tools, translates, and does
// schema-validated extraction/classification. It never computes a figure.
//
// The whole app works without the AI (rule engine + hand-written Hindi).
// The model runs behind the MITRA API at /api/ai/complete, which holds the
// key and picks the model; the browser never sees either, and nothing in the
// web bundle names the provider.
// ─────────────────────────────────────────────────────────────
import { POLICY } from '../data/policy.js';
import { ADVISOR_SYSTEM_PROMPT, boundedChatMessages } from './advisorPrompt.js';
import { serverAi } from './aiTransport.js';

const ENDPOINT = '/api/ai/complete';

export const hasDeepSeek = () => serverAi().llm;

async function deepSeekRequest(body, signal) {
  if (!serverAi().llm) throw new Error('no-ai');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI ${res.status} ${(await res.text()).slice(0, 240)}`);
  return res.json();
}

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
// `thinking` turns on the model's reasoning pass. It is used for composing
// answers to open questions; short utility calls keep it off for speed.
export async function complete({ system, messages, json = false, thinking = false, temperature = 0.4, maxTokens = 700, signal }) {
  const data = await deepSeekRequest({
    messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
    thinking: { type: thinking ? 'enabled' : 'disabled' },
    temperature,
    max_tokens: maxTokens,
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  }, signal || AbortSignal.timeout(thinking ? 30000 : 12000));
  const msg = data.choices?.[0]?.message || {};
  return { content: msg.content || '', reasoning: msg.reasoning_content || '' };
}

export async function selectDeepSeekAdvisorTool({ messages, tools, signal, system = ADVISOR_SYSTEM_PROMPT }) {
  const data = await deepSeekRequest({
    messages: [{ role: 'system', content: system }, ...messages],
    tools,
    tool_choice: 'required',
    thinking: { type: 'disabled' },
    temperature: 0.1,
    max_tokens: 220,
  }, signal);
  const call = data.choices?.[0]?.message?.tool_calls?.[0]?.function;
  if (!call?.name) throw new Error('AI returned no advisor tool');
  let args = {};
  try { args = JSON.parse(call.arguments || '{}'); } catch { throw new Error('AI returned invalid tool arguments'); }
  return { name: call.name, arguments: args };
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

export function chatMessages(history, userText) {
  return boundedChatMessages(history, userText);
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
Judge against Indian norms: guaranteed returns above ${POLICY.offerChecks.highReturnClaimPct}% trigger this policy's high-return flag; market-linked products should not promise assured returns; urgency, personal-UPI collection, unregistered entities, and Telegram/WhatsApp tips are classic scams. score = safety (100 safe, 0 dangerous).`,
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
