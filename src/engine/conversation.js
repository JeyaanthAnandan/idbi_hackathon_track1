import { respond, fallbackResponse, parseSipQuery, capabilityAnswer } from './advisor.js';
import { ADVISOR_TOOL_DEFINITIONS, executeAdvisorTool, validateAdvisorToolCall, validateAdvisorResponse, clarifyResponse } from './advisorTools.js';
import { boundedChatMessages, ADVISOR_PROMPT_VERSION } from './advisorPrompt.js';
import { goals } from '../data/customer.js';
import { goalPlan, sipRequired, sipFutureValue, fmt } from './analytics.js';
import { POLICY, returnScenario } from '../data/policy.js';

const decline = () => executeAdvisorTool({ name: 'decline_high_risk', arguments: {} });

// Was the customer already asked to clarify on the previous turn? If so the
// next clarification must not repeat itself — that loop is what made MITRA
// look like it was ignoring the question.
const askedAlready = (history) => Boolean(history.filter((m) => m.from === 'mitra').at(-1)?.clarifier);

const ACKNOWLEDGEMENT = /^(?:thanks?|thank (?:you|u)|thx|ty|ok(?:ay)?|k|cool|nice|great|good|awesome|perfect|got it|understood|fine|alright|no|nope|nothing|that's all|thats all)[\s.!]*$/i;

export function contextualResponse(text, history = [], riskProfile = 'Balanced', lang = 'en') {
  const t = text.trim();
  // A bare "thanks" or "ok" carries no request. Routing it produced the
  // clarification prompt, which read as MITRA failing to understand a word it
  // understood perfectly well.
  if (ACKNOWLEDGEMENT.test(t)) {
    return {
      mood: 'happy',
      text: /^(?:no|nope|nothing|that's all|thats all)/i.test(t)
        ? 'Alright. I am here whenever you want to look at something.'
        : 'Anytime. Ask me anything else about your money whenever you want.',
      chips: ['Show my portfolio', 'Analyse my spending', 'What can you do?'],
    };
  }
  if (/^(?:help|menu|options)[\s.!?]*$/i.test(t)) return capabilityAnswer();
  if (/\b(?:ignore (?:all |previous |your )*instructions|reveal (?:your |the )?(?:system prompt|api key)|tax evasion|evade tax|(?:give|tell|share).*\b(?:otp|password)|(?:buy|sell|transfer|execute|place an? order)\b.*\b(?:now|for me|shares|stock|money)|which stock.*buy)\b/i.test(t)) return decline();
  if (/^(?:what is|what's|explain|define|how does)\s+(?:a |an )?(?:sip|mutual fund|fixed deposit|diversification|risk|emergency fund)\b/i.test(t)) {
    const concept = /mutual fund/i.test(t) ? 'mutual_fund' : /fixed deposit/i.test(t) ? 'fixed_deposit' : /emergency fund/i.test(t) ? 'emergency_fund' : /diversification/i.test(t) ? 'diversification' : /\bsip\b/i.test(t) ? 'sip' : 'risk';
    return executeAdvisorTool({ name: 'explain_concept', arguments: { concept } }, riskProfile);
  }
  const previous = history.filter((m) => m.from === 'mitra' && m.text).at(-1);
  const plannedName = t.match(/^plan\s+(?:my\s+)?(.+?)[.!?]?$/i)?.[1]?.toLowerCase();
  const goal = plannedName && goals.find((g) => g.name.toLowerCase() === plannedName || (plannedName === 'retirement' && g.id === 'retire'));
  if (goal) {
    const plan = goalPlan(goal, returnScenario(riskProfile).base);
    return {
      mood: 'thinking',
      text: `${goal.estimated ? 'This is an unconfirmed starter goal. ' : ''}For ${goal.name}, the target is ${fmt(goal.target)} in ${goal.horizonYears} years, with ${fmt(goal.saved)} already allocated. The ${plan.expectedReturn}% scenario estimates ${fmt(plan.monthly)}/month. Returns are not guaranteed.`,
      widget: { type: 'goals', data: { plans: [plan] } },
      chips: ['Show my goals', 'Afford all my goals'],
    };
  }
  if (/^(?:(?:add|create|new|set)\s+(?:a\s+)?goal|goal[:\-]|i want (?:to (?:buy|save|afford)|a |an )|i need\s+(?:₹|rs\.?\s*)?\d|save (?:up )?for)/i.test(t)) {
    const values = parseSipQuery(t);
    const years = values.years ?? (/next year/i.test(t) ? 1 : null);
    if (!(values.amount > 0 && values.amount <= 1000000000 && years > 0 && years <= 60)) return {
      mood: 'thinking', text: 'Tell me the goal, target cost and timeframe together—for example, “I want to buy a car for ₹8 lakh in 3 years.” I will use your amount instead of guessing the price.', chips: ['Show my goals'],
    };
    const rate = returnScenario(riskProfile).base;
    const monthly = sipRequired(values.amount, rate, years);
    return { mood: 'thinking', text: `For your proposed ${fmt(values.amount)} goal in ${years} years, the ${rate}% policy scenario estimates ${fmt(monthly)}/month from zero starting savings. This is a goal simulation; it has not been added to your saved goals. Returns are not guaranteed.`,
      widget: { type: 'sip', data: { monthly, rate, years, fv: values.amount, fvIdle: sipFutureValue(monthly, POLICY.returns.savings, years) } },
      chips: ['Show my goals', 'Afford all my goals'],
    };
  }
  if (/^(?:why|explain (?:that|this)|how did you (?:calculate|get|arrive))\b/i.test(t)) {
    if (!previous) return { mood: 'thinking', text: 'There is no earlier answer of mine to explain yet. Ask me for a review or a calculation first, and then “why?” will show the exact figures and formula behind it.', chips: ['Show my portfolio', 'Analyse my spending', 'What can you do?'] };
    const passport = previous.passport;
    const evidence = passport?.evidence?.map((item) => `${item.field}: ${item.value}`).join('; ');
    return {
      text: evidence ? `For the previous answer, I used ${evidence}. Formula: ${passport.formula || 'the stated policy calculation'}. Data date: ${passport.dataAsOf || 'unknown'}.`
        : `The previous answer was: ${previous.text}\nI do not have further recorded evidence for that answer. Ask for a specific calculation or review.`,
      mood: 'thinking', chips: ['Show my portfolio', 'Talk to a human advisor'],
    };
  }
  if (/^(?:yes|do it|go ahead|proceed|simulate this sip)[.!]?$/i.test(t)) {
    if (!previous?.cta) return { mood: 'thinking', clarifier: true, text: 'Which plan should I simulate? Please name the action or give the amount and period.', chips: ['Calculate ₹5,000 for 10 years', 'Invest my surplus', 'Show my goals'] };
    return { text: 'Review the simulation below and use its button to apply it to your what-if plan. No bank transaction is submitted.', mood: 'thinking', cta: previous.cta };
  }
  if (/^(?:what about|and|instead|make (?:it|that)|try|for)\b/i.test(t) && /\d/.test(t)) {
    const prior = previous?.widget?.type === 'sip' ? previous.widget.data : null;
    if (!prior) return { mood: 'thinking', clarifier: true, text: 'What monthly amount and period should I use? For example: calculate ₹5,000 for 10 years.', chips: ['Calculate ₹5,000 for 10 years', 'Invest my surplus'] };
    const values = parseSipQuery(t);
    return respond(`calculate ₹${values.amount ?? prior.monthly} for ${values.years ?? prior.years} years`, riskProfile, lang);
  }
  return respond(t, riskProfile, lang);
}

// Shared by the chat UI and regression tests. Providers only choose tools.
export async function answerConversation({ text, history = [], riskProfile = 'Balanced', lang = 'en', routers = [], timeoutMs = 8000 }) {
  const direct = contextualResponse(text, history, riskProfile, lang);
  if (direct) return { ...direct, engineMode: 'DETERMINISTIC', promptVersion: ADVISOR_PROMPT_VERSION };
  const context = { text, repeated: askedAlready(history) };
  // A router that gives up is not an answer. Earlier this returned the first
  // clarify_request it received, so a weak first provider could veto a second
  // one that would have picked a real tool. Hold the clarification and only
  // fall back to it once every provider has had its turn.
  let deferred = null;
  for (const router of routers) {
    const controller = new AbortController();
    let timer;
    try {
      const candidate = await Promise.race([
        router({ messages: boundedChatMessages(history, text), tools: ADVISOR_TOOL_DEFINITIONS, signal: controller.signal }),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Router timeout')); }, timeoutMs); }),
      ]);
      const checked = validateAdvisorToolCall(candidate);
      const safe = validateAdvisorResponse(checked.ok ? executeAdvisorTool(checked.value, riskProfile, context) : null);
      if (safe.ok && checked.value.name === 'clarify_request') { deferred = safe.value; continue; }
      if (safe.ok) return { ...safe.value, toolRouted: true, engineMode: 'STRUCTURED_TOOL', promptVersion: ADVISOR_PROMPT_VERSION };
    } catch { /* try the next configured provider, then clarify */ }
    finally { clearTimeout(timer); }
  }
  if (deferred) return { ...deferred, toolRouted: true, engineMode: 'CLARIFICATION', promptVersion: ADVISOR_PROMPT_VERSION };
  // Every provider failed outright — that is an outage, not an ambiguous
  // question, so say so. With no provider configured at all there is nothing
  // to apologise for: answer with the closest supported questions instead.
  if (routers.length) return { ...fallbackResponse(true), engineMode: 'PROVIDER_FALLBACK', promptVersion: ADVISOR_PROMPT_VERSION };
  return {
    ...clarifyResponse({ ...context, hint: 'For open-ended questions outside these, connect an AI key in settings.' }),
    engineMode: 'CLARIFICATION',
    promptVersion: ADVISOR_PROMPT_VERSION,
  };
}
