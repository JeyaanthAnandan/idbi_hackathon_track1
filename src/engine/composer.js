// ─────────────────────────────────────────────────────────────
// AI composer — DeepSeek writes MITRA's reply to free-form questions.
//
// The deterministic engine still owns every number: the model is handed the
// customer fact sheet (engine/factSheet.js) with each figure pre-computed and
// formatted, thinks about the actual question, and writes the answer from
// those facts. Before the reply is shown it must pass two gates:
//   • every figure in it must already exist in the facts, the customer's own
//     words or the recent conversation (no invented or re-computed numbers);
//   • the same execution / guaranteed-return checks as every other answer.
// A reply that fails either gate is dropped and the caller falls back to the
// deterministic engine, so the worst case is the old template answer.
// ─────────────────────────────────────────────────────────────
import { buildFactSheet, numbersIn } from './factSheet.js';
import { executeAdvisorTool, validateAdvisorResponse } from './advisorTools.js';
import { complete, parseJSON } from './deepseek.js';

export const COMPOSER_PROMPT_VERSION = 'mitra-composer-2026-10-02.1';

// Cards the reply may attach. Each one renders the engine's own chart or
// simulation for that topic underneath MITRA's words.
const CARDS = {
  show_portfolio: 'holdings and allocation chart',
  analyze_spending: 'spending breakdown with spikes',
  plan_surplus: 'surplus SIP simulation',
  review_goals: 'goal progress and required SIPs',
  tax_guidance: 'Section 80C / ELSS scenario',
  protection_review: 'term and health cover gap',
  loan_comparison: 'loan prepay vs invest comparison',
  escalate_to_human: 'hand the customer to an IDBI relationship manager',
  review_fees: 'fund fee and overlap X-ray',
  review_allocation: 'allocation drift vs target mix',
  review_emergency: 'emergency fund cover and gap',
  review_subscriptions: 'unused subscriptions',
  review_goal_conflicts: 'all goals vs monthly capacity',
  review_health: 'financial health score breakdown',
  review_market: 'synthetic market scenario',
  review_liabilities: 'loans the bank reports',
};

const SYSTEM = `You are MITRA, the AI wealth advisor inside IDBI Bank's mobile app, talking to one Indian retail customer (${COMPOSER_PROMPT_VERSION}).

Answer the customer's actual question directly, like a warm, knowledgeable friend who is also a careful banker.
- Think about what they really need first (their situation, life event, worry), then answer it. Do not answer a different, easier question.
- Use ONLY the facts in CUSTOMER_FACTS for anything about this customer. Connect the answer to their real numbers when relevant.
- Copy every ₹ amount, percentage, month count and score EXACTLY as written in CUSTOMER_FACTS. Never calculate, round, add, convert to lakh/crore, or estimate a new number. If an answer needs a number that is not there, explain what it depends on instead of guessing.
- You may give general Indian personal-finance knowledge (PPF, NPS, ELSS, FD, term vs ULIP, credit cards, home loans, etc.) without numbers that are not in the facts.
- Indian context only: rupees, Indian tax rules, IDBI products. No US concepts like 401k or unemployment benefits.
- Never recommend a specific stock, coin, or fund house; never promise or guarantee returns; never say a transaction, SIP, mandate, policy or callback was executed or booked — anything you suggest is a plan the customer can review.
- Speculative products (crypto, F&O, guaranteed-return schemes): be honest about the risk and relate it to their profile and emergency fund; do not endorse.
- If they ask for a human, or the situation needs one (bereavement, large windfall, complex tax), say an IDBI relationship manager can help and choose card "escalate_to_human".
- If the question is not about money, answer briefly and kindly steer back.
- Style: plain English, 2–5 short sentences, or a one-line intro plus up to 4 short "• " bullet points. No markdown headings, no bold, no emoji. Speak to them as "you".

Return ONLY JSON:
{"reply": "<your answer>", "card": "<one card id from CARDS that best supports the answer, or null>", "followups": ["<up to 3 short next questions the customer might tap, max 6 words each>"]}`;

const SMALL_NUMBERS = new Set(Array.from({ length: 13 }, (_, i) => i)); // list counts, "3 steps", "6 months"

// The customer may write "20k" or "3 lakh" and the reply will say ₹20,000 /
// ₹3,00,000 — the same figure, so both forms are allowed.
const MULTIPLIER = { k: 1e3, thousand: 1e3, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, l: 1e5, crore: 1e7, crores: 1e7, cr: 1e7 };
export function expandShorthand(text) {
  return Array.from(String(text || '').matchAll(/(\d+(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?|l|crores?|cr)\b/gi),
    (m) => String(Math.round(Number(m[1]) * MULTIPLIER[m[2].toLowerCase()]))).join(' ');
}

export function figuresGrounded(reply, sources) {
  const allowed = new Set(sources.flatMap((source) => [...numbersIn(source), ...numbersIn(expandShorthand(source))]));
  SMALL_NUMBERS.forEach((n) => allowed.add(n));
  const unknown = numbersIn(reply).filter((n) => !allowed.has(n) && !(n >= 1990 && n <= 2100 && Number.isInteger(n)));
  return { ok: unknown.length === 0, unknown };
}

// Bullets sometimes arrive inline ("… • a • b"); put each on its own line.
const tidy = (value) => (typeof value === 'string'
  ? value.trim().replace(/[ \t]+•\s+/g, '\n• ').replace(/\n{3,}/g, '\n\n').slice(0, 1200)
  : '');

// One grounded AI answer: ask DeepSeek (thinking on) for the JSON reply,
// retry a blank JSON-mode answer once without JSON mode, and give a reply
// quoting a figure not found in `sources` one rewrite before rejecting it.
// Shared by the customer composer and the RM copilot (engine/rmComposer.js).
export async function composeGrounded({ system, user, sources, signal, completeFn = complete }) {
  const ask = (json, correction = '') => completeFn({
    system,
    messages: [{ role: 'user', content: user + correction }],
    json,
    thinking: true,
    temperature: 0.4,
    maxTokens: 3000,
    signal,
  });
  let { content, reasoning } = await ask(true);
  // A blank JSON-mode answer gets one retry with JSON mode off; the prompt
  // still asks for the same JSON shape, which parseJSON extracts.
  if (!parseJSON(content)?.reply) ({ content, reasoning } = await ask(false));
  let parsed = parseJSON(content);
  let reply = tidy(parsed?.reply);
  if (!reply) return { rejected: 'empty reply' };

  // A figure that can't be traced to the facts gets one chance at a rewrite
  // before the reply is dropped — usually a general market statistic that can
  // be said in words just as well.
  let grounded = figuresGrounded(reply, sources);
  if (!grounded.ok) {
    ({ content, reasoning } = await ask(true, `\n\nYOUR PREVIOUS DRAFT used figures that are not in the facts: ${grounded.unknown.join(', ')}. Rewrite the answer without those numbers — describe them in words (for example "sharp falls" instead of a percentage). Every remaining figure must appear in the facts or the user's own words.`));
    parsed = parseJSON(content);
    reply = tidy(parsed?.reply);
    if (!reply) return { rejected: 'empty reply after rewrite' };
    grounded = figuresGrounded(reply, sources);
  }
  if (!grounded.ok) return { rejected: `figures not in facts: ${grounded.unknown.join(', ')}` };
  return { parsed, reply, reasoning };
}

export function cleanFollowups(list, fallback = []) {
  const chips = (Array.isArray(list) ? list : [])
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim().replace(/\s+/g, ' '))
    .filter((item) => item.length > 2 && item.length <= 60);
  return [...new Set(chips.length ? chips : fallback)].slice(0, 3);
}

export async function composeAnswer({ text, history = [], riskProfile = 'Balanced', engineHint = null, signal, completeFn = complete }) {
  const facts = buildFactSheet(riskProfile);
  const turns = history.filter((m) => ['user', 'mitra'].includes(m.from) && typeof m.text === 'string').slice(-6);
  const hintText = engineHint?.text ? `\n\nENGINE_NOTE (a pre-computed answer for the closest built-in topic; use it only if it fits the question):\n${engineHint.text}` : '';
  // The conversation goes in as a transcript inside one message. Passing it
  // as separate chat turns makes DeepSeek's JSON mode intermittently return
  // only whitespace.
  const transcript = turns.length
    ? `\n\nRECENT_CONVERSATION (oldest first; resolve "it", "that", "my fund" from here):\n${turns.map((m) => `${m.from === 'user' ? 'Customer' : 'MITRA'}: ${m.text.slice(0, 1200)}`).join('\n')}`
    : '';
  const user = `CUSTOMER_FACTS:\n${facts}${hintText}${transcript}\n\nCARDS: ${Object.entries(CARDS).map(([id, label]) => `${id} (${label})`).join('; ')}\n\nCUSTOMER QUESTION: ${String(text).slice(0, 2000)}`;

  const out = await composeGrounded({ system: SYSTEM, user, sources: [facts, text, engineHint?.text || '', ...turns.map((m) => m.text)], signal, completeFn });
  if (out.rejected) return out;
  const { parsed, reply, reasoning } = out;

  const card = Object.hasOwn(CARDS, parsed.card) ? parsed.card : null;
  const cardResponse = card ? executeAdvisorTool({ name: card, arguments: {} }, riskProfile) : null;
  const response = {
    mood: cardResponse?.mood || 'happy',
    text: reply,
    ...(cardResponse?.widget ? { widget: cardResponse.widget } : {}),
    ...(cardResponse?.cta ? { cta: cardResponse.cta } : {}),
    chips: cleanFollowups(parsed.followups, cardResponse?.chips || ['Show my portfolio', 'Talk to a human advisor']),
    why: ['Reply written by MITRA’s AI from the engine-computed fact sheet; every figure was checked against it before display'],
    toolRouted: true,
    reasoned: Boolean(reasoning),
  };
  const checked = validateAdvisorResponse(response);
  if (!checked.ok) return { rejected: checked.error };
  return { response: checked.value };
}
