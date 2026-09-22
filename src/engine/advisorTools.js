import { respond, analyzeOfferOffline, suggestPrompts, capabilityAnswer } from './advisor.js';
import { POLICY } from '../data/policy.js';

const TOOL_NAMES = new Set([
  'show_portfolio', 'analyze_spending', 'plan_surplus', 'review_goals',
  'tax_guidance', 'protection_review', 'loan_comparison', 'check_offer',
  'escalate_to_human', 'explain_concept', 'decline_high_risk',
  'review_fees', 'review_harvesting', 'review_allocation', 'review_emergency',
  'review_subscriptions', 'review_goal_conflicts', 'review_health', 'review_peers', 'review_market', 'review_liabilities', 'clarify_request',
]);

const CONCEPTS = new Set(['sip', 'mutual_fund', 'fixed_deposit', 'diversification', 'risk', 'emergency_fund', 'general']);
const ACTION_TYPES = new Set([
  'sip-setup', 'roundup', 'protection-fix', 'direct-switch', 'harvest',
  'prepay', 'subs-cancel', 'emergency-fix', 'rm-handoff',
]);

export const ADVISOR_TOOL_DEFINITIONS = [
  ['show_portfolio', 'Show holdings, allocation, or net worth.'],
  ['analyze_spending', 'Analyze spending, expenses, or cashflow.'],
  ['plan_surplus', 'Plan what to do with investable monthly surplus.'],
  ['review_goals', 'Review existing goals and required contributions.'],
  ['tax_guidance', 'Explain tax-saving opportunities from connected, confirmed tax data.'],
  ['protection_review', 'Review insurance protection adequacy.'],
  ['loan_comparison', 'Compare loan prepayment with investing.'],
  ['check_offer', 'Check suspicious investment or insurance offer text.'],
  ['escalate_to_human', 'Prepare a human relationship-manager handoff.'],
  ['explain_concept', 'Explain a general financial concept without personalized product advice.'],
  ['decline_high_risk', 'Decline stock tips, guaranteed returns, tax evasion, credential requests, or unsupported transactions.'],
  ['review_fees', 'Review fund fees and portfolio overlap.'],
  ['review_harvesting', 'Simulate capital-gains harvesting.'],
  ['review_allocation', 'Review allocation drift and rebalancing.'],
  ['review_emergency', 'Review emergency savings cover.'],
  ['review_subscriptions', 'Review recurring subscription spending.'],
  ['review_goal_conflicts', 'Prioritize competing goals within available cashflow.'],
  ['review_health', 'Review financial health score.'],
  ['review_peers', 'Compare with available synthetic peer benchmarks.'],
  ['review_market', 'Show the synthetic market scenario, not live prices.'],
  ['review_liabilities', 'Report the loans and overdue status the bank lists for the customer.'],
  ['clarify_request', 'Ask for clarification when a request is ambiguous or unsupported.'],
].map(([name, description]) => ({
  type: 'function',
  function: {
    name,
    description,
    parameters: name === 'explain_concept'
      ? { type: 'object', additionalProperties: false, properties: { concept: { type: 'string', enum: Array.from(CONCEPTS) } }, required: ['concept'] }
      : name === 'check_offer'
        ? { type: 'object', additionalProperties: false, properties: { offerText: { type: 'string', maxLength: 4000 } }, required: ['offerText'] }
        : { type: 'object', additionalProperties: false, properties: {} },
  },
}));

export function validateAdvisorToolCall(value) {
  if (!value || typeof value !== 'object' || !TOOL_NAMES.has(value.name)) return { ok: false, error: 'Unknown advisor tool' };
  if (!value.arguments || typeof value.arguments !== 'object' || Array.isArray(value.arguments)) return { ok: false, error: 'Arguments must be an object' };
  const args = value.arguments;
  const allowed = value.name === 'explain_concept' ? ['concept'] : value.name === 'check_offer' ? ['offerText'] : [];
  if (Object.keys(args).some((key) => !allowed.includes(key))) return { ok: false, error: 'Unexpected tool arguments' };
  if (value.name === 'explain_concept' && !CONCEPTS.has(args.concept)) return { ok: false, error: 'Invalid concept' };
  if (value.name === 'check_offer' && (typeof args.offerText !== 'string' || !args.offerText.trim() || args.offerText.length > 4000)) {
    return { ok: false, error: 'Invalid offer text' };
  }
  if (!['explain_concept', 'check_offer'].includes(value.name) && Object.keys(args).length) return { ok: false, error: 'Unexpected tool arguments' };
  return { ok: true, value: { name: value.name, arguments: args } };
}

const PROMPTS = {
  show_portfolio: 'show my portfolio',
  analyze_spending: 'analyse my spending',
  plan_surplus: 'invest my surplus',
  review_goals: 'show my goals',
  tax_guidance: 'help me save tax',
  protection_review: 'am i protected',
  loan_comparison: 'prepay my loan or invest',
  escalate_to_human: 'talk to a human advisor',
  review_fees: 'xray my portfolio', review_harvesting: 'harvest capital gains',
  review_allocation: 'rebalance my portfolio', review_emergency: 'emergency fund',
  review_subscriptions: 'unused subscriptions', review_goal_conflicts: 'afford all my goals',
  review_health: 'financial health score', review_peers: 'compare me with peers', review_market: 'market pulse',
  review_liabilities: 'what do i owe',
};

const EDUCATION = {
  sip: 'A SIP invests a fixed amount at regular intervals. It builds discipline and buys more units when markets are lower, but market-linked returns are not guaranteed.',
  mutual_fund: 'A mutual fund pools investors’ money into a disclosed portfolio. Check its riskometer, costs, horizon, and whether it fits your risk profile before investing.',
  fixed_deposit: 'A fixed deposit offers a stated rate for a defined tenure. It is useful for capital stability and shorter goals, while interest is generally taxable at your applicable slab.',
  diversification: 'Diversification spreads risk across asset types and issuers. It reduces dependence on one outcome, although it cannot eliminate market loss.',
  risk: 'Investment risk includes temporary volatility and permanent loss. A suitable plan matches the product’s risk, the goal horizon, and your ability and willingness to absorb a fall.',
  emergency_fund: `An emergency fund is liquid money reserved for shocks. MITRA’s current policy target is ${POLICY.emergency.targetMonths} months of essential expenses.`,
  general: 'I can explain investing concepts and calculate from connected data, but I will not invent facts or recommend an unsupported transaction.',
};

// A clarification that reads the question instead of ignoring it.
//
// The old behaviour was one fixed sentence asking the customer to pick a
// category. Asked twice it was identical both times, so a customer whose
// phrasing the router could not place got the same non-answer on every turn
// and had no way forward. Three things changed:
//   • near-miss topics from the question itself become pressable buttons;
//   • with no near miss at all, say what MITRA can do rather than ask again;
//   • a repeat is never the same message — it escalates to the capability
//     list and a human handoff.
// `clarifier: true` is what the next turn reads to know it is repeating.
export function clarifyResponse({ text = '', repeated = false, hint = '' } = {}) {
  const suggestions = suggestPrompts(text, 3);
  const prompts = suggestions.map((item) => item.prompt);
  const tail = hint ? ` ${hint}` : '';

  // Asked twice, the question is not going to be understood by asking a third
  // time. Offer the closest topics once more and a human who can read it.
  if (repeated) {
    return {
      mood: 'thinking',
      clarifier: true,
      text: `I am still not placing that one, and asking again will not help. ${prompts.length ? `The nearest things I can answer are ${prompts.map((prompt) => `“${prompt}”`).join(' and ')}. ` : 'I work from your connected spending, balances, holdings, goals, protection and loans. '}If none of those is it, I can hand this to a human advisor who can read the question properly.${tail}`,
      chips: [...new Set([...prompts, 'Talk to a human advisor', 'What can you do?'])].slice(0, 4),
    };
  }

  // Nothing in the question resembles a supported topic, so asking the
  // customer to pick a category they have never seen is useless. Show the list.
  if (!prompts.length) {
    const capability = capabilityAnswer();
    return {
      mood: 'thinking',
      clarifier: true,
      text: `I could not match that to anything I can calculate, so rather than guess — here is what I can do. ${capability.text}${tail}`,
      chips: [...new Set([...capability.chips, 'Talk to a human advisor'])].slice(0, 4),
    };
  }

  const quoted = String(text).trim().replace(/\s+/g, ' ').slice(0, 60);
  // Quoting the chip verbatim would double up its own question mark.
  const options = prompts.map((prompt) => `“${prompt.replace(/\?$/, '')}”`);
  return {
    mood: 'thinking',
    clarifier: true,
    text: `I am not sure which part of ${quoted ? `“${quoted}”` : 'that'} you want me to work on. Did you mean ${options.length > 1 ? `${options.slice(0, -1).join(', ')} or ${options.at(-1)}` : options[0]}? Pick one and I will answer it from your connected data — or ask what I can do for everything I cover.${tail}`,
    chips: [...prompts, 'What can you do?'].slice(0, 4),
  };
}

export function executeAdvisorTool(call, riskProfile = 'Balanced', context = {}) {
  const checked = validateAdvisorToolCall(call);
  if (!checked.ok) return null;
  const { name, arguments: args } = checked.value;
  if (PROMPTS[name]) return respond(PROMPTS[name], riskProfile, 'en');
  if (name === 'clarify_request') return clarifyResponse(context);
  if (name === 'check_offer') {
    const result = analyzeOfferOffline(args.offerText);
    return {
      mood: result.verdict === 'avoid' ? 'thinking' : 'happy',
      text: result.headline,
      widget: { type: 'offer', data: result },
      chips: ['Check another offer', 'Talk to a human advisor'],
    };
  }
  if (name === 'explain_concept') return { mood: 'happy', text: EDUCATION[args.concept], chips: ['Show my portfolio', 'Review my goals'] };
  if (name === 'decline_high_risk') {
    return {
      mood: 'thinking',
      text: 'I can’t provide guaranteed-return claims, individual stock tips, tax-evasion steps, request credentials, or execute an unverified transaction. I can explain the risks or prepare a human-advisor handoff.',
      chips: ['Talk to a human advisor', 'Show my portfolio'],
    };
  }
  return null;
}

const UNSAFE_EXECUTION = /\b(orders? (?:was |were |has been |have been )?placed|trade executed|mandate (?:was |has been )?created|callback booked|coverage (?:is )?active|switched successfully)\b/i;
const GUARANTEE_CLAIM = /\b(?:will|shall)\s+(?:definitely\s+)?(?:return|earn|grow|double)\b/i;

export function validateAdvisorResponse(response) {
  if (!response || typeof response !== 'object' || typeof response.text !== 'string' || !response.text.trim()) {
    return { ok: false, error: 'Advisor response must contain text' };
  }
  if (response.widget && (typeof response.widget.type !== 'string' || !response.widget.data || typeof response.widget.data !== 'object')) {
    return { ok: false, error: 'Invalid widget payload' };
  }
  if (response.cta && (!Number.isFinite(response.cta.amount) || response.cta.amount < 0 || !ACTION_TYPES.has(response.cta.type))) {
    return { ok: false, error: 'Invalid action payload' };
  }
  const claimsOnly = response.text.replace(/\bno\b[^.!?]{0,80}\b(?:orders?|mandate|callback|coverage|switch)[^.!?]*/gi, '');
  if (UNSAFE_EXECUTION.test(claimsOnly)) return { ok: false, error: 'Unsupported execution claim' };
  if (GUARANTEE_CLAIM.test(response.text)) return { ok: false, error: 'Guaranteed-return claim' };
  return { ok: true, value: response };
}

export function figuresPreserved(source, translated) {
  const figures = (value) => (String(value || '').match(/\d+(?:[.,]\d+)*/g) || []).map((item) => item.replace(/,/g, ''));
  const same = (a, b) => { a.sort(); b.sort(); return a.length === b.length && a.every((item, index) => item === b[index]); };
  const percentages = (value) => Array.from(String(value || '').matchAll(/(\d+(?:[.,]\d+)*)\s*%/g), (m) => m[1].replace(/,/g, ''));
  // Word order changes between languages. Compare quantities as a multiset,
  // but keep percentage bindings so an amount cannot become a return rate.
  return same(figures(source), figures(translated)) && same(percentages(source), percentages(translated));
}

export function validateOfferAnalysis(value) {
  const verdicts = new Set(['safe', 'caution', 'avoid']);
  if (!value || !verdicts.has(value.verdict) || !Number.isFinite(value.score) || value.score < 0 || value.score > 100) return null;
  return {
    verdict: value.verdict,
    score: value.score,
    headline: String(value.headline || '').slice(0, 300),
    redFlags: Array.isArray(value.redFlags) ? value.redFlags.slice(0, 8).map(String) : [],
    hiddenCosts: Array.isArray(value.hiddenCosts) ? value.hiddenCosts.slice(0, 8).map(String) : [],
    realityCheck: String(value.realityCheck || '').slice(0, 500),
    action: String(value.action || '').slice(0, 500),
  };
}

export function validateGoalDraft(value) {
  if (!value || value.ok !== true || typeof value.name !== 'string' || !value.name.trim()) return null;
  const target = Number(value.target);
  const years = Number(value.years);
  if (!Number.isFinite(target) || target < 1000 || target > 1000000000 || !Number.isFinite(years) || years <= 0 || years > 60) return null;
  return { ok: true, name: value.name.trim().slice(0, 80), target: Math.round(target), years, estimated: Boolean(value.estimated), note: String(value.note || '').slice(0, 300) };
}
