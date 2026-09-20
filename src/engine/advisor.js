// ─────────────────────────────────────────────────────────────
// MITRA's brain — hybrid conversational engine.
// 1. Intent detection (keyword + pattern scoring) → deterministic,
//    data-grounded answers with rich inline widgets. Works offline.
// 2. Optional LLM fallback (Claude API) for free-form questions,
//    grounded with the same computed financial context.
// Every response: { text, meta?, widget?, chips?, mood? }
// `meta` is the provenance stamp — what the engine computed to say this.
// ─────────────────────────────────────────────────────────────
import {
  customer,
  holdings,
  monthlySummary,
  spendByCategory,
  modelPortfolios,
  totalWealth,
  dataQuality,
} from '../data/customer.js';
import {
  fmt,
  fmtCompact,
  cashflow,
  spendingAnomalies,
  unusedSubscriptions,
  subscriptionWaste,
  allocation,
  equityExposure,
  healthScore,
  sipFutureValue,
  sipRequired,
  allGoalPlans,
  goalPlan,
  taxGap,
  marketPulse,
  roundup,
  drift,
  protectionGap,
  emergencyFundTarget,
  xray,
  ltcgHarvest,
  prepayVsInvest,
  moneyPersona,
  goalCollision,
} from './analytics.js';
import { peers } from '../data/customer.js';
import { goals } from '../data/customer.js';
import { sumAction } from './portfolioState.js';
import { POLICY, returnScenario } from '../data/policy.js';

const INTENTS = [
  { id: 'greeting', kw: ['hi', 'hello', 'hey', 'namaste', 'good morning', 'good evening'] },
  { id: 'portfolio', kw: ['portfolio', 'holdings', 'net worth', 'wealth', 'my investments', 'where is my money', 'asset'] },
  // A single bank snapshot cannot support a trend, but it does carry a
  // verified balance breakdown. That is the most useful thing one month of
  // connected data can say, so it gets its own intent instead of being
  // buried inside the data-coverage answer.
  { id: 'balances', kw: ['balance', 'balances', 'available balance', 'lien', 'lien amount', 'how much do i have', 'how much can i spend', 'what is usable', 'usable', 'spendable', 'withdrawable', 'usable cash', 'clear balance'] },
  { id: 'spending', kw: ['spend', 'spending', 'expense', 'expenses', 'where did my money', 'analyse my spending', 'analyze'] },
  { id: 'surplus', kw: ['surplus', 'invest my surplus', 'idle', 'extra money', 'start sip', 'start a sip', 'invest more', 'where should i invest'] },
  { id: 'goals', kw: ['goal', 'goals', 'europe', 'trip', 'house', 'home', 'down payment', 'retirement', 'retire'] },
  { id: 'tax', kw: ['tax', '80c', 'elss', 'save tax'] },
  { id: 'subscriptions', kw: ['subscription', 'subscriptions', 'recurring', 'unused'] },
  { id: 'emergency', kw: ['emergency', 'rainy day', 'safety net'] },
  { id: 'health', kw: ['health score', 'financial health', 'score', 'how am i doing', 'am i doing well'] },
  { id: 'fdvsmf', kw: ['fd vs', 'fixed deposit vs', 'fd or mutual', 'fd or sip', 'is fd better', 'mutual fund vs fd'] },
  { id: 'risky', kw: ['market crash', 'market fall', 'risky', 'is it safe', 'lose money', 'market down', 'scared', 'worried'] },
  { id: 'recommend', kw: ['recommend', 'suggestion', 'what should i do', 'advice', 'plan for me', 'ideal portfolio'] },
  { id: 'sipcalc', kw: ['calculate', 'sip of', 'how much will', 'if i invest'] },
  { id: 'market', kw: ['market', 'nifty', 'sensex', 'markets today', 'market pulse', 'how are markets', 'बाज़ार'] },
  { id: 'rebalance', kw: ['rebalance', 'drift', 'allocation off', 'rebalance my portfolio'] },
  { id: 'roundup', kw: ['round up', 'roundup', 'round-up', 'spare change', 'micro invest'] },
  { id: 'benchmark', kw: ['peers', 'people like me', 'others like me', 'benchmark', 'compare me', 'am i ahead', 'am i behind'] },
  { id: 'fraud', kw: ['scam', 'fraud', 'guaranteed return', 'guaranteed returns', 'double my money', 'double money', 'ponzi', 'telegram tip', 'whatsapp tip', 'hot stock tip', '30% return', 'crypto scheme', 'chit fund offer'] },
  { id: 'insurance', kw: ['insurance', 'insured', 'term plan', 'term cover', 'health cover', 'protect my family', 'am i protected', 'nominee', 'life cover'] },
  { id: 'human', kw: ['human', 'real person', 'relationship manager', 'talk to rm', 'talk to someone', 'branch', 'call me', 'speak to advisor', 'human advisor'] },
  { id: 'xray', kw: ['x-ray my portfolio', 'xray my portfolio', 'x-ray', 'xray', 'fund fees', 'expense ratio', 'overlap', 'portfolio doctor', 'hidden fees', 'regular plan', 'direct plan'] },
  { id: 'harvest', kw: ['harvest', 'ltcg', 'capital gains', 'tax harvest', 'harvesting'] },
  { id: 'prepay', kw: ['prepay', 'pre-pay', 'foreclose', 'pay off my loan', 'loan or invest', 'prepay or invest', 'education loan', 'close my loan'] },
  { id: 'persona', kw: ['persona', 'money personality', 'kind of spender', 'my money style', 'money dna', 'what am i like with money'] },
  { id: 'collision', kw: ['collision', 'conflict', 'competing goals', 'goal priority', 'prioritise my goals', 'prioritize my goals', 'enough for all my goals', 'afford all my goals'] },
];

// Intents whose answer is arithmetic over connected balances or transactions.
// With nothing connected these either hit the trend gate (whose policy-version
// wording presumes a statement) or compute over zeros and report ₹0 as a fact.
// Intents with their own specific "not connected" answer — portfolio, tax,
// insurance, goals, peers, xray, harvest, prepay — are deliberately excluded.
const NO_DATA_INTENTS = new Set([
  'greeting', 'spending', 'surplus', 'health', 'persona',
  'collision', 'emergency', 'recommend', 'rebalance', 'roundup',
]);

// Hindi keyword hints (STT in hi-IN returns Devanagari)
const HI_KW = {
  portfolio: ['पोर्टफोलियो', 'निवेश दिखाओ', 'मेरा पैसा'],
  spending: ['खर्च', 'खर्चा'],
  surplus: ['निवेश करो', 'सरप्लस', 'बचत निवेश'],
  goals: ['लक्ष्य', 'सपने', 'गोल'],
  tax: ['टैक्स', 'कर बचत'],
  health: ['सेहत', 'स्कोर', 'हेल्थ'],
  greeting: ['नमस्ते', 'नमस्कार', 'हैलो'],
};

export function detectIntent(text) {
  const t = text.toLowerCase();
  if (/\b(?:calculate|simulate|try|if i invest|sip of)\b.*\d|\b\d[\d,.]*\s*(?:k|lakh|crore)?\s*(?:per month|monthly|\/mo|for \d)/i.test(t)) return 'sipcalc';
  let best = { id: null, score: 0 };
  for (const intent of INTENTS) {
    let score = 0;
    for (const kw of intent.kw) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(?:^|\\W)${escaped}(?=$|\\W)`, 'i').test(t)) score = Math.max(score, kw.length);
    }
    if (score > best.score) best = { id: intent.id, score };
  }
  if (!best.id) {
    for (const [id, kws] of Object.entries(HI_KW)) {
      if (kws.some((kw) => text.includes(kw))) return id;
    }
  }
  return best.id;
}

// Extract "₹X for Y years" style numbers for the SIP calculator intent
export function parseSipQuery(text) {
  const t = text.toLowerCase().replace(/,/g, '');
  const amtMatch = t.match(/(?:₹|rs\.?\s*)(\d+(?:\.\d+)?)\s*(k|lakh|lac|crore)?\b|\b(\d+(?:\.\d+)?)\s*(k|lakh|lac|crore)\b|\b(\d{3,9})(?:\s*(?:per month|\/month|monthly|pm))?/);
  const yrMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:years|year|yrs|yr)\b/);
  const unit = amtMatch?.[2] || amtMatch?.[4];
  return {
    amount: amtMatch ? Number(amtMatch[1] || amtMatch[3] || amtMatch[5]) * ({ k: 1000, lakh: 100000, lac: 100000, crore: 10000000 }[unit] || 1) : null,
    years: yrMatch ? Number(yrMatch[1]) : null,
  };
}

const firstName = customer.name.split(' ')[0];
// The lightest-priority goal name, used as flavour text in a few responses —
// resolved from data so it reads correctly for any persona, not just Priya's "Europe Trip".
const flavourGoalName = () => goals.find((g) => g.id === 'travel')?.name || goals[goals.length - 1]?.name || 'goal';
const goalName = (id) => goals.find((g) => g.id === id)?.name || id;

// ── Hindi response overlays (vernacular = accessibility) ──────
// Same computed numbers, Hindi phrasing. Full coverage via Bhashini in prod.
const HI_TEXT = {
  greeting: () => {
    const cf = cashflow();
    const hs = healthScore();
    if (!cf.incomeKnown) return {
      text: `नमस्ते ${firstName}! मैं MITRA हूँ — आपकी दौलत की दोस्त। आपका फाइनेंशियल हेल्थ स्कोर ${hs.total}/100 है। आय की पुष्टि होने पर मैं आपका मासिक सरप्लस निकालूँगी।`,
      chips: ['मेरा पोर्टफोलियो दिखाओ', 'खर्च का विश्लेषण करो', 'टैक्स बचाओ'],
    };
    return {
      text: `नमस्ते ${firstName}! मैं MITRA हूँ — आपकी दौलत की दोस्त। आपका फाइनेंशियल हेल्थ स्कोर ${hs.total}/100 है, और हर महीने ${fmt(cf.surplus)} बिना काम के पड़े हैं। बताइए, इन्हें आपके सपनों पर लगाएँ?`,
      chips: ['सरप्लस निवेश करो', 'मेरा पोर्टफोलियो दिखाओ', 'खर्च का विश्लेषण करो', 'टैक्स बचाओ'],
    };
  },
  surplus: (riskProfile = 'Balanced') => {
    const cf = cashflow();
    const monthly = Math.floor(cf.surplus / 500) * 500;
    const baseReturn = returnScenario(riskProfile).base;
    return {
      text: `आपके ${monthlySummary.length} महीनों के लेन-देन से ${fmt(monthly)}/महीना सरप्लस दिखता है। ${baseReturn}% बेस सिनेरियो में यह 10 साल में लगभग ${fmtCompact(sipFutureValue(monthly, baseReturn, 10))} हो सकता है, जबकि ${POLICY.returns.savings}% सेविंग्स सिनेरियो में ${fmtCompact(sipFutureValue(monthly, POLICY.returns.savings, 10))}। मार्केट रिटर्न की गारंटी नहीं है।`,
      chips: ['SIP सिनेरियो दिखाओ', 'मेरे लक्ष्य दिखाओ'],
    };
  },
  portfolio: () => ({
    text: `आपकी कुल संपत्ति ${fmtCompact(totalWealth())} है। ध्यान दीजिए — ज़्यादातर पैसा बचत खाते और FD में है, और सिर्फ ${equityExposure().toFixed(0)}% ग्रोथ एसेट्स में। आपकी उम्र में थोड़ा और इक्विटी बेहतर रहेगा।`,
    chips: ['सरप्लस निवेश करो', 'मेरे लक्ष्य दिखाओ'],
  }),
  spending: () => {
    const cf = cashflow();
    const a = spendingAnomalies()[0];
    return {
      text: `${cf.last.month} में आपने ${fmt(cf.last.spend)} खर्च किए। सबसे बड़ा बदलाव: ${a ? `${a.category} — ${fmt(a.amount)}, यानी पिछले औसत से ${a.deltaPct.toFixed(0)}% ज़्यादा` : 'कोई महत्वपूर्ण उछाल नहीं'}।`,
      chips: ['सरप्लस निवेश करो', 'मेरे लक्ष्य दिखाओ'],
    };
  },
  goals: () => ({
    text: `आपके ${goals.length} लक्ष्य जुड़े हैं। किसी भी लक्ष्य पर टैप करें; मैं नीति-आधारित मासिक जरूरत दिखाऊँगी।`,
    chips: [`${flavourGoalName()} का प्लान दिखाओ`, 'सरप्लस निवेश करो'],
  }),
  tax: () => {
    const tg = taxGap();
    return {
      text: `पुष्ट ${tg.regime} regime डेटा के अनुसार, ${fmt(tg.section80CLimit)} की 80C सीमा में ${fmt(tg.section80CUsed)} उपयोग हुआ है और ${fmt(tg.gap)} बाकी है। अनुमानित टैक्स बचत ${fmt(tg.estSaving)} है; निवेश से पहले पात्रता की पुष्टि करें।`,
      chips: ['ELSS सिनेरियो दिखाओ', 'मेरा पोर्टफोलियो दिखाओ'],
    };
  },
  health: () => {
    const hs = healthScore();
    return {
      text: `आपका फाइनेंशियल हेल्थ स्कोर ${hs.total}/100 है — ${hs.grade}। यह जुड़े डेटा पर आधारित संकेतक है, गारंटी नहीं; नीचे हर हिस्से का हिसाब देख सकते हैं।`,
      chips: ['सरप्लस निवेश करो', 'टैक्स बचाओ'],
    };
  },
  risky: () => ({
    text: `घबराना स्वाभाविक है, ${firstName} जी। मार्केट-लिंक्ड निवेश कई वर्षों तक भी गिर सकते हैं। लंबी अवधि, विविधीकरण और पर्याप्त इमरजेंसी फंड जोखिम घटा सकते हैं, खत्म नहीं।`,
    chips: ['मेरा पोर्टफोलियो दिखाओ', 'सरप्लस निवेश करो'],
  }),
};

export function respond(text, riskProfile = 'Balanced', lang = 'en') {
  if (!modelPortfolios[riskProfile]) riskProfile = 'Balanced';
  const base = respondCore(text, riskProfile);
  if (!base || lang !== 'hi') return base;
  // The static Hindi templates assume a complete demo profile. Preserve the
  // qualified observed-data response; the translation layer may translate it.
  if (dataQuality.connections?.some(s => s.mode?.startsWith('IDBI_'))) return base;
  if (base.widget?.type?.endsWith('-unavailable')) return base;
  const intent = detectIntent(text);
  const hi = HI_TEXT[intent]?.(riskProfile);
  return hi ? { ...base, text: hi.text, chips: hi.chips } : base;
}

function respondCore(text, riskProfile = 'Balanced') {
  const intent = detectIntent(text);
  const cf = cashflow();
  const hs = healthScore();
  const movement = dataQuality.observedCashMovement;
  const bankSnapshots = (dataQuality.connections || []).filter(s => s.mode?.startsWith('IDBI_'));
  const snapshotDate = dataQuality.dataAsOf;
  const snapshotNote = bankSnapshots.length ? ` This is sandbox data observed through ${snapshotDate || 'an unspecified date'}, not a current balance check.` : '';

  // Nothing connected at all (the risk-quiz path stops here). The policy-gate
  // wording below assumes a statement exists and reads as a malfunction when
  // there is no data to gate — say what is actually missing, and what still works.
  const nothingConnected = !holdings.length && !(movement?.transactionCount > 0);
  if (nothingConnected && NO_DATA_INTENTS.has(intent)) {
    return {
      mood: 'happy',
      text: intent === 'greeting'
        ? `Hi ${firstName}. Your ${riskProfile} risk profile is saved, but no account or statement is connected yet, so I have no balances or transactions to work from. Use “Connect / refresh data” above to fetch your IDBI sandbox accounts or upload a CSV statement. Until then I can still explain any investment concept, run a SIP or goal what-if on an amount you give me, and check a suspicious offer for scam signals.`
        : `I have no connected accounts or transactions yet, so there is nothing for me to calculate that from — I will not estimate it. Use “Connect / refresh data” above to fetch your IDBI sandbox accounts or upload a CSV statement. In the meantime, give me an amount and a timeframe and I will run the projection on your numbers instead.`,
      widget: { type: 'data-quality-unavailable', data: { reason: 'No financial data connected' } },
      chips: ['Calculate ₹5,000 for 10 years', 'What is a SIP?', 'Check an offer'],
    };
  }

  // Everything a single verified snapshot supports, named up front, so the
  // customer is steered at the four answers that work instead of discovering
  // the eight that cannot by hitting each one.
  const BANK_SNAPSHOT_CHIPS = ['What is usable right now?', 'Analyse my spending', 'Show my portfolio', 'What data do I need?'];
  if (intent === 'greeting' && bankSnapshots.length && movement) {
    return { mood: 'happy', text: `Hi ${firstName}, your IDBI sandbox snapshot contains ${movement.transactionCount} transactions and ${holdings.length} holding(s), with reported balances totalling ${fmt(totalWealth())}. From one statement period I can break down what is actually usable, explain the recorded cash movements, and show exactly which data is still missing. I will not score your finances or propose an amount to invest on this much history.${snapshotNote}`, chips: BANK_SNAPSHOT_CHIPS };
  }

  // Balance composition — reported vs available vs effective vs lien. Every
  // figure here is returned by the account-enquiry API; nothing is derived.
  if (intent === 'balances') {
    const accounts = (dataQuality.connections || []).flatMap(s => s.accounts || []);
    const withBalances = accounts.filter(a => Number.isFinite(a.availableBalance) || Number.isFinite(a.lienBalance) || Number.isFinite(a.balance));
    if (!withBalances.length) {
      return { mood: 'thinking', text: 'No connected account has reported a balance breakdown, so I cannot tell you what is usable. Connect an IDBI sandbox account and the reported, available, effective-available and lien amounts will all be shown here.', chips: ['What data do I need?', 'Show my portfolio'] };
    }
    const lines = withBalances.map((a) => [
      Number.isFinite(a.balance) ? `a reported balance of ${fmt(a.balance)}` : null,
      Number.isFinite(a.availableBalance) ? `available ${fmt(a.availableBalance)}` : null,
      Number.isFinite(a.effectiveAvailableBalance) ? `effective available ${fmt(a.effectiveAvailableBalance)}` : null,
      Number.isFinite(a.lienBalance) && a.lienBalance > 0 ? `${fmt(a.lienBalance)} under lien` : null,
    ].filter(Boolean).join(', ')).filter(Boolean);
    const lien = withBalances.reduce((sum, a) => sum + (Number.isFinite(a.lienBalance) ? a.lienBalance : 0), 0);
    const spendable = withBalances.reduce((sum, a) => sum + (Number.isFinite(a.effectiveAvailableBalance) ? a.effectiveAvailableBalance : Number.isFinite(a.availableBalance) ? a.availableBalance : 0), 0);
    return {
      mood: 'happy',
      text: `The bank reports ${lines.join('; ')}. Treat ${fmt(spendable)} as the usable figure, not the headline balance${lien > 0 ? ` — ${fmt(lien)} is held under lien and cannot be withdrawn` : ''}. These are the bank's own reported amounts, not a figure I derived.${snapshotNote}`,
      why: [
        'Source: IDBI account-enquiry API (365), reported balance types',
        'Effective available balance is used as usable cash where the bank supplies it',
        'No income, spending or investment assumption is applied to these figures',
      ],
      chips: ['Analyse my spending', 'Show my portfolio', 'What data do I need?'],
    };
  }
  if (/what data|data coverage|data quality|connected data|data missing/i.test(text)) {
    const accounts = bankSnapshots.flatMap(s => s.accounts || []);
    const balances = accounts.map(a => [Number.isFinite(a.availableBalance) ? `available balance ${fmt(a.availableBalance)}` : null, Number.isFinite(a.effectiveAvailableBalance) ? `effective available balance ${fmt(a.effectiveAvailableBalance)}` : null, Number.isFinite(a.lienBalance) ? `lien amount ${fmt(a.lienBalance)}` : null].filter(Boolean).join(', ')).filter(Boolean);
    return { mood: 'thinking', text: `I have ${holdings.length} connected holding(s) and ${movement?.transactionCount || 0} transactions across ${dataQuality.transactionMonths} observed months. ${cf.incomeKnown ? 'Income-labelled credits are present.' : 'Identifiable income is missing; credits alone do not establish salary.'} ${balances.length ? `The bank reports ${balances.join('; ')}. ` : ''}Tax, insurance and full loan details require separate verified sources. ${bankSnapshots.flatMap(s => s.warnings || []).join(' ')}${snapshotNote}`, chips: bankSnapshots.length ? ['What is usable right now?', 'Analyse my spending', 'Show my portfolio'] : ['Show my portfolio', 'Analyse my spending'] };
  }
  if (intent === 'spending' && movement && (!cf.incomeKnown || dataQuality.transactionMonths < POLICY.confidence.minimumMonthsForTrend || bankSnapshots.length)) {
    // The running balance carried on each transaction and the balance the
    // account-enquiry API reports can be on entirely different scales in this
    // sandbox. Narrating both as fact without saying so is the contradiction
    // a reader notices first, so the answer owns it.
    const reconciliation = bankSnapshots.flatMap(s => s.warnings || []).filter(w => /reconcil/i.test(w));
    const uncategorised = spendByCategory.length === 1 && spendByCategory[0].category === 'Other';
    return { mood: 'thinking', text: `Across ${movement.transactionCount} supplied transactions from ${movement.fromDate || 'an unknown start date'} to ${movement.toDate || 'an unknown end date'}, credits total ${fmt(movement.totalCredits)} and debits total ${fmt(movement.totalDebits)}: a net ${movement.net >= 0 ? 'inflow' : 'outflow'} of ${fmt(Math.abs(movement.net))}. This describes cash movement; transfers and unclear narrations can prevent identifying income or consumption. ${cf.incomeKnown ? 'Income-labelled credits are available, but this sample alone does not establish investable surplus.' : 'I cannot estimate salary or investable surplus from unlabelled credits.'}${uncategorised ? ' Every narration in this statement is unlabelled, so all of it sits in one uncategorised bucket — no merchant or category breakdown is possible from it.' : ''}${reconciliation.length ? ' Note that these debits are not reconciled against the reported account balance: the running balances on these transactions and the balance the bank reports are on different scales, so do not read the two together.' : ''}${snapshotNote}`, widget: { type: 'spending', data: { categories: spendByCategory, months: monthlySummary } }, chips: ['What is usable right now?', 'What data do I need?', 'Show my portfolio'] };
  }
  if ((['health', 'persona', 'collision'].includes(intent) && !hs.available) || (['recommend', 'rebalance', 'surplus', 'emergency'].includes(intent) && bankSnapshots.length && (dataQuality.portfolioComplete === false || !cf.incomeKnown))) {
    // Name the specific missing input rather than the generic set, and hand
    // back the answers this data *can* support instead of a dead end.
    const missing = [
      !cf.incomeKnown ? 'an identifiable income credit' : null,
      dataQuality.transactionMonths < POLICY.confidence.minimumMonthsForTrend
        ? `${POLICY.confidence.minimumMonthsForTrend} months of history (I have ${dataQuality.transactionMonths})` : null,
      dataQuality.portfolioComplete === false ? 'your investments outside this bank' : null,
    ].filter(Boolean);
    const missingPhrase = missing.length > 1
      ? `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}`
      : missing[0] || 'more complete financial coverage';
    return { mood: 'thinking', text: `I can't answer that from what's connected. This needs ${missingPhrase} — and I won't extrapolate it from a single statement period. What this snapshot does support: the usable-balance breakdown, the recorded cash movements, and your bank-side holdings.${snapshotNote}`, widget: { type: 'data-quality-unavailable', data: { reason: 'Incomplete financial coverage', missing } }, chips: BANK_SNAPSHOT_CHIPS };
  }
  const trendIntents = new Set(['greeting', 'spending', 'surplus', 'health', 'persona', 'collision', 'emergency']);
  if (trendIntents.has(intent) && dataQuality.transactionMonths < POLICY.confidence.minimumMonthsForTrend) {
    return {
      mood: 'thinking',
      text: `I have only ${dataQuality.transactionMonths} observed transaction month${dataQuality.transactionMonths === 1 ? '' : 's'}. Policy ${POLICY.version} requires ${POLICY.confidence.minimumMonthsForTrend} before personalized trend advice, so I will not extrapolate yet.`,
      widget: { type: 'data-quality-unavailable', data: { observedMonths: dataQuality.transactionMonths, requiredMonths: POLICY.confidence.minimumMonthsForTrend } },
      chips: ['Show my portfolio', 'Talk to a human advisor'],
    };
  }

  switch (intent) {
    case 'greeting':
      if (!cf.incomeKnown) return {
        mood: 'happy',
        meta: `Health score ${hs.total} · income not supplied`,
        text: `Hi ${firstName}, I can see your connected balances and transactions. I do not have an identifiable salary or income credit yet, so I will not estimate a monthly surplus. You can still ask me to review your portfolio or supplied spending.`,
        chips: ['Show my portfolio', 'Analyse my spending', 'What data do I need?'],
      };
      return {
        mood: 'happy',
        meta: `Health score ${hs.total} · surplus detected`,
        text: `Hi ${firstName}, I've been keeping an eye on your money. Your Financial Health Score is ${hs.total}/100 (${hs.grade}) and I've spotted ${fmt(cf.surplus)} sitting idle each month. Want me to put it to work?`,
        chips: ['Invest my surplus', 'Show my portfolio', 'Check an offer', 'Am I protected?', "How's my financial health?"],
      };

    case 'portfolio': {
      const alloc = allocation();
      const lowGrowthPct = alloc
        .filter((item) => ['Savings Account', 'Fixed Deposit'].includes(item.type))
        .reduce((sum, item) => sum + item.pct, 0);
      return {
        mood: 'proud',
        text: totalWealth() > 0
          ? `Your connected balances total ${fmtCompact(totalWealth())}. ${lowGrowthPct.toFixed(0)}% sits in savings and FDs while ${equityExposure().toFixed(0)}% is in growth assets.${dataQuality.portfolioComplete === false ? ' This is a partial portfolio; unconnected investments and liabilities are not included, so this is not net worth or a basis for rebalancing.' : ` I would compare this mix with your ${riskProfile} target before proposing a change.`}${snapshotNote}`
          : 'I do not have a connected holding balance yet, so I will not infer an allocation. Connect holdings or upload a supported CSV to run the review.',
        widget: { type: 'allocation', data: { alloc, holdings, total: totalWealth() } },
        // On a bank-only snapshot the usual follow-ups (surplus, goals, target
        // mix) all refuse, so offer the ones this data actually answers.
        chips: dataQuality.portfolioComplete === false
          ? BANK_SNAPSHOT_CHIPS.filter((chip) => chip !== 'Show my portfolio')
          : ['What should my ideal portfolio be?', 'Invest my surplus', 'Show my goals'],
      };
    }

    case 'spending': {
      const anomalies = spendingAnomalies();
      const a = anomalies[0];
      return {
        mood: 'thinking',
        text: `You spent ${fmt(cf.last.spend)} in ${cf.last.month} against income of ${fmt(cf.last.income)}. ${
          a
            ? `Biggest jump: ${a.category} at ${fmt(a.amount)} — that's ${a.deltaPct.toFixed(0)}% above your 3-month average. `
            : ''
        }The observed excess is ${fmt(a ? a.amount - a.avg3m : 0)}; you can model redirecting it to ${flavourGoalName()} without assuming a fixed timeline benefit.`,
        widget: { type: 'spending', data: { categories: spendByCategory, months: monthlySummary } },
        chips: ['Show unused subscriptions', 'Invest my surplus', 'Show my goals'],
      };
    }

    case 'surplus': {
      if (!cf.incomeKnown) return {
        mood: 'thinking',
        text: 'I cannot estimate a monthly surplus yet because the connected statement has no identifiable income credit. Add a statement with salary or other income narration, then I can calculate it without guessing.',
        chips: ['Analyse my spending', 'Show my portfolio', 'Talk to a human advisor'],
      };
      if (cf.surplus <= 0) return {
        mood: 'thinking', text: `Your observed monthly cashflow has a ${fmt(Math.abs(cf.surplus))} shortfall. There is no additional surplus to invest in this scenario. Review spending and existing commitments first.`,
        chips: ['Analyse my spending', 'Show my goals', 'Talk to a human advisor'],
      };
      const monthly = Math.floor(cf.surplus / 500) * 500;
      const fvIdle = sipFutureValue(monthly, POLICY.returns.savings, 10);
      const p = modelPortfolios[riskProfile];
      const scenario = returnScenario(riskProfile);
      return {
        mood: 'excited',
        text: `Based on ${monthlySummary.length} observed months, the modelled surplus is ${fmt(monthly)}/month. In the ${riskProfile.toLowerCase()} base scenario (${p.expectedReturn}% p.a.), it could become ${fmtCompact(
          sipFutureValue(monthly, p.expectedReturn, 10)
        )} in 10 years, versus ${fmtCompact(fvIdle)} in the savings scenario. Market returns are not guaranteed.`,
        widget: {
          type: 'sip',
          data: {
            monthly, rate: p.expectedReturn, years: 10,
            fv: sipFutureValue(monthly, p.expectedReturn, 10), fvIdle,
            band: {
              bear: sipFutureValue(monthly, scenario.bear, 10),
              base: sipFutureValue(monthly, scenario.base, 10),
              bull: sipFutureValue(monthly, scenario.bull, 10),
            },
          },
        },
        why: [
          `${monthlySummary.length}-month average: income ${fmt(cf.avgIncome)} − spends ${fmt(cf.avgSpend)} − existing SIP ${fmt(cf.avgInvested)} = ${fmt(cf.surplus)} surplus`,
          `Rounded down to ${fmt(monthly)} to keep a buffer for irregular months`,
          `${p.expectedReturn}% assumption comes from your ${riskProfile} model portfolio, not a promise`,
        ],
        chips: ['Simulate this SIP', 'Show ideal portfolio split', 'Make it ₹15,000 instead'],
        cta: { label: `Review simulated SIP · ${fmt(monthly)}/mo`, type: 'sip-setup', amount: monthly, source: 'surplus' },
      };
    }

    case 'goals': {
      const plans = allGoalPlans(modelPortfolios[riskProfile].expectedReturn);
      if (!plans.length) return { mood: 'thinking', text: 'No goals have been recorded yet. Tell me a target amount and timeframe to start a simulation.', chips: ['Calculate ₹5,000 for 10 years'] };
      const behind = plans.filter((g) => g.progress < 40 && g.horizonYears <= 3);
      return {
        mood: 'thinking',
        text: `${plans.some((g) => g.estimated) ? 'These are suggested starter goals, not goals you have confirmed. ' : ''}Here's where your ${plans.length} goals stand. ${
          behind.length
            ? `Your ${behind[0].name} needs attention — you'd need ${fmt(behind[0].monthly)}/month to stay on track.`
            : 'You are broadly on track!'
        } Tap any goal and I'll build a plan for it.`,
        widget: { type: 'goals', data: { plans } },
        chips: [`Plan my ${flavourGoalName()}`, 'Plan retirement', 'Invest my surplus'],
      };
    }

    case 'tax': {
      const tg = taxGap();
      if (!tg.available || !tg.regimeConfirmed || !tg.eligibleRegime) {
        return {
          mood: 'thinking',
          text: tg.regimeConfirmed && !tg.eligibleRegime
            ? `Section 80C is not applied under the confirmed ${tg.regime} regime in policy ${POLICY.version}, so I will not recommend an 80C tax-saving SIP.`
            : 'Your tax regime and verified 80C usage are not connected, so I will not estimate a tax-saving SIP yet. Confirm those two facts first and I can calculate the eligible gap.',
          widget: { type: 'tax-unavailable', data: { reason: tg.regimeConfirmed ? 'Confirmed regime is not 80C-eligible' : 'Tax regime or verified utilisation is missing', policyVersion: POLICY.version } },
          chips: ['Show my portfolio', 'Talk to a human advisor'],
        };
      }
      return {
        mood: 'thinking',
        text: `Based on your confirmed ${tg.regime} regime data, you have used ${fmt(tg.section80CUsed)} of the ${fmt(tg.section80CLimit)} Section 80C limit. A modelled ELSS SIP of ${fmt(
          Math.ceil(tg.monthlyToFill / 100) * 100
        )}/month for the rest of the FY fills the eligible gap and could save about ${fmt(tg.estSaving)} at the confirmed marginal rate. Confirm eligibility before investing; equity returns are not guaranteed.`,
        widget: { type: 'tax', data: tg },
        why: [
          `80C tracked from your ELSS SIP + EPF deductions visible in salary credits: ${fmt(tg.section80CUsed)} used`,
          `Gap ${fmt(tg.gap)} ÷ ${tg.monthsLeft} months left in FY = ${fmt(tg.monthlyToFill)}/month`,
          `Tax saving estimated at ${(tg.marginalRate * 100).toFixed(1)}% confirmed marginal rate`,
        ],
        chips: ['Simulate the ELSS SIP', 'Old vs new regime?', 'Show my portfolio'],
        cta: { label: 'Review simulated tax-saver SIP', type: 'sip-setup', amount: Math.ceil(tg.monthlyToFill / 100) * 100, source: 'tax' },
      };
    }

    case 'subscriptions': {
      const unused = unusedSubscriptions();
      const waste = subscriptionWaste();
      if (!unused.length) {
        return {
          mood: 'proud',
          text: 'There are no verified unused subscriptions to remove. A statement can show recurring payments, but it cannot tell me whether you use a service. Confirm usage with the provider before cancelling.',
          chips: ['Invest my surplus', 'Show my goals'],
        };
      }
      return {
        mood: 'thinking',
        text: `I found ${unused.length} subscriptions you haven't used in months, costing ${fmt(waste)}/month (${fmt(
          waste * 12
        )}/year). If cancelled and redirected into your ${flavourGoalName()} SIP, the ${returnScenario(riskProfile).base}% base scenario models ${fmtCompact(sipFutureValue(waste, returnScenario(riskProfile).base, 2))} in 2 years.`,
        widget: { type: 'subs', data: { unused, waste } },
        chips: ['Invest my surplus', 'Analyse my spending'],
        cta: { label: `Simulate cancelling ${unused.length} subscriptions`, type: 'subs-cancel', amount: waste },
      };
    }

    case 'emergency': {
      const need = emergencyFundTarget();
      const gap = Math.max(need - customer.savingsBalance, 0);
      if (hs.emergencyMonths >= POLICY.emergency.targetMonths) {
        return {
          mood: 'proud',
          text: `Your safety net is fully funded — ${hs.emergencyMonths.toFixed(1)} months of expenses covered. Nothing to fix here; that surplus can now go straight to your goals.`,
          chips: ['Invest my surplus', 'Show my goals'],
        };
      }
      return {
        mood: 'thinking',
        text: `Your safety net covers ${hs.emergencyMonths.toFixed(1)} months of expenses — policy ${POLICY.version} targets ${POLICY.emergency.targetMonths} months (${fmtCompact(
          need
        )}). The gap is ${fmt(gap)}. A sweep-in FD scenario uses ${POLICY.returns.fixedDeposit}% p.a.; actual rates, liquidity, and penalties depend on the product. Simulate ${fmt(
          Math.min(gap, 100000)
        )} now?`,
        chips: ['Simulate sweep-in FD', "What's a sweep-in FD?", 'Show my health score'],
        cta: { label: `Simulate ${fmt(Math.min(gap, 100000))} sweep-in`, type: 'emergency-fix', amount: Math.min(gap, 100000) },
      };
    }

    case 'health': {
      const rankedParts = [...hs.parts].sort((a, b) => (b.score / b.max) - (a.score / a.max));
      return {
        mood: hs.total >= 55 ? 'proud' : 'thinking',
        text: `Your Financial Health Score is ${hs.total}/100 — ${hs.grade}. The strongest calculated area is ${rankedParts[0]?.label || 'not available'}; the weakest is ${rankedParts.at(-1)?.label || 'not available'}. This is an explainable planning indicator, not a credit score or outcome guarantee.`,
        widget: { type: 'health', data: hs },
        chips: ['Invest my surplus', 'Fix my emergency fund', 'Help me save tax'],
      };
    }

    case 'fdvsmf': {
      const amt = 10000;
      const fdRate = POLICY.returns.fixedDeposit;
      const equityRate = returnScenario(riskProfile).base;
      return {
        mood: 'thinking',
        text: `Both have a place. This policy models an FD at ${fdRate}% and a ${riskProfile.toLowerCase()} market-linked portfolio at ${equityRate}%. ${fmt(
          amt
        )}/month for 10 years models ${fmtCompact(sipFutureValue(amt, fdRate, 10))} in the FD scenario and ${fmtCompact(
          sipFutureValue(amt, equityRate, 10)
        )} in the market scenario. Actual FD terms vary and market returns are not guaranteed.`,
        widget: {
          type: 'compare',
          data: {
            rows: [
              { label: 'Safety', fd: 'Capital guaranteed', mf: 'Market-linked' },
              { label: 'Best for', fd: '1–3 yr goals', mf: '5+ yr goals' },
              { label: '₹10K/mo → 10 yrs', fd: fmtCompact(sipFutureValue(amt, fdRate, 10)), mf: fmtCompact(sipFutureValue(amt, equityRate, 10)) },
              { label: 'Tax', fd: 'Interest generally taxed at slab', mf: `LTCG ${(POLICY.tax.ltcgEquityRate * 100).toFixed(1)}% above ${fmt(POLICY.tax.ltcgEquityExemption)}` },
            ],
          },
        },
        chips: ['Show ideal portfolio split', 'Invest my surplus'],
      };
    }

    case 'risky':
      return {
        mood: 'happy',
        text: `Totally fair to feel that way, ${firstName}. Market-linked investments can lose value, including over multi-year periods. A longer horizon, diversified allocation, and ${hs.emergencyMonths.toFixed(0)} months of emergency cover can reduce the chance that you must sell during a fall; they do not remove risk.`,
        chips: ['Show ideal portfolio split', 'How is my money protected?', 'Invest my surplus'],
      };

    case 'recommend': {
      const p = modelPortfolios[riskProfile];
      return {
        mood: 'proud',
        text: `For your ${riskProfile} profile at age ${customer.age}, here's the portfolio I recommend (~${p.expectedReturn}% expected p.a.). Your current mix is ${equityExposure().toFixed(
          0
        )}% growth assets — this plan moves you there gradually via SIPs, no lump-sum timing risk.`,
        widget: { type: 'model', data: { profile: riskProfile, ...p } },
        chips: ['Invest my surplus', 'Compare FD vs mutual funds', 'Show my goals'],
      };
    }

    case 'sipcalc': {
      const { amount, years } = parseSipQuery(text);
      if (!(amount > 0 && amount <= 10000000 && years > 0 && years <= 60)) return {
        mood: 'thinking', text: 'What monthly amount and investment period should I simulate? For example: ₹5,000 per month for 10 years. Use a positive amount up to ₹1 crore and a period up to 60 years.',
        chips: ['Calculate ₹5,000 for 10 years'],
      };
      const scenarioRate = returnScenario(riskProfile).base;
      const fv = sipFutureValue(amount, scenarioRate, years);
      const invested = amount * years * 12;
      return {
        mood: 'excited',
        text: `${fmt(amount)}/month for ${years} years at the ${scenarioRate}% policy base scenario models ${fmtCompact(fv)}. You would contribute ${fmtCompact(invested)}, with ${fmtCompact(
          fv - invested
        )} from modelled growth. Market returns are not guaranteed.`,
        widget: { type: 'sip', data: { monthly: amount, rate: scenarioRate, years, fv, fvIdle: sipFutureValue(amount, POLICY.returns.savings, years) } },
        chips: ['Simulate this SIP', 'Try ₹20,000 for 15 years'],
      };
    }

    case 'market': {
      const mp = marketPulse();
      const up = mp.delta >= 0;
      return {
        mood: up ? 'happy' : 'thinking',
        text: `This is a synthetic market scenario, not a live quote. A ${Math.abs(mp.weekChangePct)}% ${up ? 'rise' : 'fall'} in ${mp.index} models an approximate ${fmt(Math.abs(mp.delta))} ${up ? 'gain' : 'loss'} on your equity exposure. Actual fund and stock performance will differ.`,
        widget: { type: 'pulse', data: mp },
        chips: ['Rebalance my portfolio', 'Is it safe if markets crash?', 'Show my portfolio'],
      };
    }

    case 'rebalance': {
      if (!holdings.length) return { mood: 'thinking', text: 'No holding balances are connected, so I cannot measure allocation drift. Upload holdings first.', chips: ['Show my portfolio'] };
      const dr = drift(riskProfile);
      const g = dr.biggestGap;
      return {
        mood: 'thinking',
        text: `Against your ${riskProfile} target, the biggest drift is ${g.name}: ${Math.abs(g.gap).toFixed(0)}% ${g.gap > 0 ? 'below' : 'above'} target. The simulation directs new SIPs toward ${g.gap > 0 ? g.name.toLowerCase() : 'underweight assets'}; it does not place orders.`,
        widget: { type: 'drift', data: dr },
        why: [
          `Current mix computed from live holdings: ${dr.current.map((c) => `${c.name} ${c.pct.toFixed(0)}%`).join(', ')}`,
          `Target mix for ${riskProfile} profile: ${dr.target.map((c) => `${c.name} ${c.pct}%`).join(', ')}`,
          'SIP-based rebalancing avoids capital-gains tax and exit loads vs. sell-and-buy',
        ],
        chips: ['Simulate the glide path', 'Show ideal portfolio split', 'Show my portfolio'],
        cta: { label: 'Simulate SIP glide path', type: 'sip-setup', amount: 10000, source: 'rebalance' },
      };
    }

    case 'roundup': {
      if (!roundup().upiTxnsPerMonth) return { mood: 'thinking', text: 'UPI transaction counts and round-up amounts are not available in this data. I cannot estimate round-up investing yet.', chips: ['Analyse my spending'] };
      const ru = roundup();
      return {
        mood: 'excited',
        text: `You make about ${ru.upiTxnsPerMonth} UPI payments a month. A round-up simulation estimates ${fmt(ru.monthly)}/month, modelling ${fmtCompact(ru.in5y)} in 5 years and ${fmtCompact(ru.in10y)} in 10 years at the policy base return. Market returns are not guaranteed.`,
        why: [
          `${ru.upiTxnsPerMonth} UPI debits/month detected in your account (6-month average)`,
          `Average round-up to nearest ₹50: ${fmt(ru.avgRoundup)} per transaction`,
          `Projection at ${returnScenario('Balanced').base}% p.a. policy base return, compounded monthly`,
        ],
        chips: ['Simulate Round-Up investing', 'Invest my surplus', 'Show my goals'],
        cta: { label: `Simulate Round-Up (${fmt(ru.monthly)}/mo)`, type: 'roundup', amount: ru.monthly },
      };
    }

    case 'benchmark': {
      if (peers.percentile == null || !peers.metrics?.length) {
        return { mood: 'thinking', text: 'I do not have an approved anonymised peer cohort for this profile, so I will not invent a percentile.', chips: ['Show my portfolio', "How's my financial health?"] };
      }
      return {
        mood: 'proud',
        text: `In this synthetic comparison, your profile is at percentile ${peers.percentile} within ${peers.cohort}. ${peers.metrics.map((m) => `${m.label}: ${m.you}${m.unit} versus cohort median ${m.median}${m.unit}`).join('; ')}. These are demo benchmarks, not observed customer rankings.`,
        widget: { type: 'peers', data: peers },
        chips: ['Help me save tax', "How's my financial health?", 'Invest my surplus'],
      };
    }

    case 'fraud':
      return {
        mood: 'thinking',
        text: `A claimed guaranteed return above ${POLICY.offerChecks.highReturnClaimPct}% triggers this policy's high-risk flag; market-linked products should not promise assured returns. Verify the entity and product independently before paying or sharing credentials.`,
        widget: {
          type: 'shield',
          data: {
            checks: [
              { flag: `"Guaranteed" returns above ${POLICY.offerChecks.highReturnClaimPct}%`, why: `Above policy threshold; FD base assumption is ${POLICY.returns.fixedDeposit}%` },
              { flag: 'Urgency — "offer closes tonight"', why: 'Real investments never expire in hours' },
              { flag: 'WhatsApp / Telegram tips', why: 'SEBI-registered advisors don\'t cold-message' },
              { flag: 'Pay to a personal UPI / account', why: 'Regulated firms collect only in their own name' },
              { flag: 'Unregistered entity', why: 'Verify on sebi.gov.in / RBI\'s sachet portal' },
            ],
          },
        },
        why: [
          'Framework based on SEBI investor-protection advisories and RBI Sachet guidelines',
          'This prototype checks the text you provide; it does not monitor transfers or consult a mule-account database',
        ],
        chips: ['Check an offer I received', 'Where should I invest instead?', 'Talk to a human advisor'],
      };

    case 'insurance': {
      const pg = protectionGap();
      if (!pg.available) {
        return {
          mood: 'thinking',
          text: 'Insurance policy data is not connected, so I cannot calculate a protection gap reliably. Add policy details or ask an IDBI advisor to review them with you.',
          widget: { type: 'protection-unavailable', data: { reason: 'Insurance cover and portability are missing' } },
          chips: ['Talk to a human advisor', 'Show my health score'],
        };
      }
      return {
        mood: 'thinking',
        text: `The connected policy data shows ${fmtCompact(pg.termCover)} life cover${pg.portable === false ? ', marked non-portable,' : ''} and ${pg.dependents} dependants. Policy ${POLICY.version} uses ${POLICY.insurance.termIncomeMultiple}× annual income, giving a ${fmtCompact(pg.termNeeded)} term target; the health-cover gap is ${fmtCompact(pg.healthGap)}. The indicative additional premium is ${fmt(pg.totalMonthly)}/month, subject to underwriting and insurer quotes.`,
        widget: { type: 'protection', data: pg },
        why: [
          `Term need = ${POLICY.insurance.termIncomeMultiple} × annual income (${fmt(customer.monthlyIncome * 12)}) = ${fmtCompact(pg.termNeeded)}`,
          pg.portable === false ? 'Connected cover is marked non-portable' : 'Portability status included from the connected policy record',
          `Premiums indicative for age ${customer.age}, non-smoker; exact quote at issuance`,
        ],
        chips: ['Fix my protection gap', 'Show my health score', 'Talk to a human advisor'],
        cta: { label: `Simulate protection plan · ${fmt(pg.totalMonthly)}/mo`, type: 'protection-fix', amount: pg.totalMonthly },
      };
    }

    case 'human': {
      const hsNow = healthScore();
      const taxNow = taxGap();
      const protectionNow = protectionGap();
      const openItems = [
        taxNow.available && taxNow.eligibleRegime && taxNow.gap > 0 ? `80C gap ${fmt(taxNow.gap)}` : null,
        protectionNow.available && (protectionNow.termGap > 0 || protectionNow.healthGap > 0) ? 'protection gap' : null,
        totalWealth() > 0 ? 'allocation review' : 'holdings data required',
      ].filter(Boolean).join(', ');
      return {
        mood: 'happy',
        text: `Of course. I have prepared a reviewable briefing from the facts used in this conversation. Submit the sandbox request below to demonstrate how an IDBI wealth RM handoff would work; no real callback is booked by this prototype.`,
        widget: {
          type: 'handoff',
          data: {
            rm: 'IDBI Wealth RM queue · sandbox',
            slot: 'Not submitted',
            brief: [
              `${customer.name}, ${customer.age} · ${riskProfile} profile · Health score ${hsNow.total}/100`,
              `Wealth ${fmtCompact(totalWealth())} · surplus ${fmt(cashflow().surplus)}/mo idle`,
              `Open items: ${openItems || 'general plan review'}`,
              `Goals: ${goals.map((goal) => `${goal.name} (${goal.horizonYears}y)`).join(', ') || 'none connected'}`,
            ],
          },
        },
        chips: ['Continue with MITRA for now', 'Show my goals'],
        cta: { label: 'Submit simulated RM handoff', type: 'rm-handoff', amount: 0 },
      };
    }

    case 'xray': {
      const xr = xray();
      if (!xr.available) {
        return {
          mood: 'thinking',
          text: `I cannot run a trustworthy fund X-ray yet: ${xr.reason} Upload fund plan, expense-ratio, and underlying-holdings data first.`,
          widget: { type: 'xray-unavailable', data: xr },
          chips: ['Show my portfolio', 'Talk to a human advisor'],
        };
      }
      if (xr.switched) {
        return {
          mood: 'proud',
          text: `The active planning scenario models ${xr.fund} as a Direct plan at ${xr.er}% instead of ${xr.regularEr}%. It estimates ${fmtCompact(xr.feeLossAvoided)} less fee drag over ${xr.years} years; no switch order has been placed.`,
          widget: { type: 'xray', data: xr },
          chips: ['Show my portfolio', 'Harvest my capital gains'],
        };
      }
      return {
        mood: 'thinking',
        text: `The fund facts show ${xr.fund} as a ${xr.plan} plan charging ${xr.er}%, versus ${xr.directEr}% for its Direct plan. At the ${xr.grossReturn}% gross-return assumption, the fee difference models ${fmtCompact(xr.feeLoss)} over ${xr.years} years. It also reports ${xr.overlapPct}% overlap with ${xr.overlapWith}; review taxes and exit load before any switch.`,
        widget: { type: 'xray', data: xr },
        why: [
          `Supplied fund facts: Regular ${xr.er}% vs Direct ${xr.directEr}%`,
          `Fee-loss projection: same fund, same returns, only the fee differs, ${xr.years}-year horizon with your current SIP`,
          'Overlap is supplied in the demo fund facts; underlying holdings are not independently fetched',
        ],
        chips: ['Switch me to Direct plans', 'Show my portfolio', 'Harvest my capital gains'],
        cta: { label: 'Simulate Direct-plan switch', type: 'direct-switch', amount: 0 },
      };
    }

    case 'harvest': {
      if (!holdings.some((h) => ['Mutual Fund', 'Stocks'].includes(h.type) && Number.isFinite(h.cost))) return { mood: 'thinking', text: 'Holding values and purchase costs are required to estimate unrealised gains. Connect those facts before a harvesting simulation.', chips: ['Show my portfolio'] };
      const lh = ltcgHarvest();
      if (lh.harvested) {
        return {
          mood: 'proud',
          text: `The current planning scenario already includes ${fmt(sumAction('harvest'))} of estimated tax saving for this FY. No sale or repurchase order has been placed.`,
          widget: { type: 'harvest', data: lh },
          chips: ['X-ray my portfolio', 'Help me save tax', 'Show my portfolio'],
        };
      }
      return {
        mood: 'excited',
        text: `Under policy ${POLICY.version}, eligible long-term equity gains have a ${fmt(lh.exemption)} annual exemption. Connected holdings show ${fmt(lh.gains)} of unrealised gains, so the model estimates up to ${fmt(lh.taxSaved)} of tax impact from harvesting. Eligibility, holding period, exit load, and transaction timing must be confirmed by a tax professional before any orders.`,
        widget: { type: 'harvest', data: lh },
        why: [
          `Unrealised LTCG across your equity funds: ${fmt(lh.gains)} (current value minus purchase cost)`,
          `Section 112A exempts ₹1,25,000 of LTCG per FY; harvesting uses it before it lapses`,
          `Tax saved = harvested gains × 12.5% LTCG rate; exit-load-free units only`,
        ],
        chips: ['Simulate harvesting', 'X-ray my portfolio', 'Help me save tax'],
        cta: { label: `Simulate ${fmt(lh.harvestable)} harvest`, type: 'harvest', amount: lh.taxSaved, harvestable: lh.harvestable },
      };
    }

    case 'prepay': {
      const pv = prepayVsInvest(50000, riskProfile);
      if (!pv.available) {
        return { mood: 'thinking', text: 'No verified active-loan data is connected, so I cannot compare prepayment with investing.', chips: ['Show my portfolio', 'Talk to a human advisor'] };
      }
      if (pv.loan.balance <= 0) {
        return {
          mood: 'proud',
          text: `The current scenario models your ${pv.loan.name} as fully repaid${pv.prepaidSoFar ? ` after ${fmt(pv.prepaidSoFar)} of simulated prepayments` : ''}. No payment has been submitted; the freed EMI can be tested as a SIP scenario.`,
          chips: ['Invest my surplus', 'Show my goals'],
        };
      }
      const better = pv.interestSaved > pv.investGain * 0.7; // risk-adjust the equity path
      const investRate = pv.investRate;
      return {
        mood: 'thinking',
        text: `The connected ${pv.loan.name.toLowerCase()} has ${fmt(pv.loan.balance)} outstanding at ${pv.loan.rate}%. A ${fmt(pv.prepayAmount)} prepayment models ${fmt(pv.interestSaved)} lower interest and ${pv.monthsSaved} fewer months. Investing the same amount models ${fmt(Math.round(pv.investGain))} of growth at the ${investRate}% base scenario, which is not guaranteed. On this risk-adjusted comparison, ${better ? 'prepayment ranks higher' : 'investing ranks higher'}.`,
        widget: {
          type: 'compare',
          data: {
            rows: [
              { label: 'Certainty', fd: 'Contractual loan saving', mf: 'Market-linked' },
              { label: `₹50K outcome (${Math.round(pv.loanMonths / 12)} yrs)`, fd: `saves ${fmt(pv.interestSaved)}`, mf: `may earn ${fmt(Math.round(pv.investGain))}` },
              { label: 'Loan ends', fd: `${pv.monthsSaved} months earlier`, mf: 'on schedule' },
              { label: 'Scenario comparison', fd: better ? 'Ranks higher' : 'Ranks lower', mf: better ? 'Ranks lower' : 'Ranks higher' },
            ],
          },
        },
        why: [
          `Amortization on actual loan: ${fmt(pv.loan.balance)} @ ${pv.loan.rate}%, EMI ${fmt(pv.loan.emi)}, ${pv.loan.monthsLeft} months left`,
          `Loan interest saving is contractual; the ${investRate}% market return is only a policy scenario`,
        ],
        chips: ['Simulate ₹50,000 prepayment', 'Invest my surplus instead', 'Show my goals'],
        cta: { label: `Simulate ${fmt(pv.prepayAmount)} prepayment`, type: 'prepay', amount: pv.prepayAmount },
      };
    }

    case 'persona': {
      const mp = moneyPersona();
      return {
        mood: 'proud',
        text: `Across ${mp.observedMonths} observed months, your Money Persona is **${mp.title}** — ${mp.tagline}. The card below shows the calculated traits and any missing protection evidence.`,
        widget: { type: 'persona', data: mp },
        chips: ['Am I protected?', 'Invest my surplus', 'Compare me with my peers'],
      };
    }

    case 'collision': {
      const gc = goalCollision(modelPortfolios[riskProfile].expectedReturn);
      return {
        mood: 'thinking',
        text: `Funding ${goals.length} goals on schedule needs ${fmt(gc.needTotal)}/month against ${fmt(gc.capacity)}/month of investing capacity. ${gc.deficit > 0 ? `The shortfall is ${fmt(gc.deficit)}/month. Review the priority-based funding amounts below; underfunded goals need a revised amount or date.` : 'The current scenario has enough capacity for these goal contributions.'}`,
        widget: { type: 'collision', data: gc },
        why: [
          `Required SIPs computed per goal at ${modelPortfolios[riskProfile].expectedReturn}% expected return`,
          `Capacity = investable surplus ${fmt(cashflow().surplus)} + current SIP ${fmt(cashflow().avgInvested)}`,
          'Priority order: safety → committed goals → compounding → lifestyle',
        ],
        chips: ['Simulate this plan', 'Open the Time Machine', 'Show my goals'],
        cta: { label: `Simulate triage plan · +${fmt(cf.surplus)}/mo`, type: 'sip-setup', amount: Math.max(cf.surplus, 0), source: 'collision' },
      };
    }

    default:
      return null; // hand off to LLM if configured, else graceful fallback
  }
}

// ── Offline Offer X-Ray: same verdict shape as the DeepSeek version, but a
// deterministic keyword/regex scorer so the scam-check works with no AI key.
const OFFER_SIGNALS = [
  {
    id: 'guarantee',
    weight: 30,
    re: /guarantee(d)?|assured returns?|fixed returns?|risk[- ]?free|zero[- ]?risk|no risk/i,
    flag: 'Claims "guaranteed" / "assured" / risk-free returns',
  },
  {
    id: 'highpct',
    weight: 25,
    re: /(\d{2,3})\s?%/,
    test: (t, m) => m && parseInt(m[1], 10) > POLICY.offerChecks.highReturnClaimPct,
    flag: `Claims returns above the ${POLICY.offerChecks.highReturnClaimPct}% offer-review threshold`,
  },
  {
    id: 'urgency',
    weight: 20,
    re: /(offer|deal|scheme) (closes|ends)|hurry|act now|limited (time|seats|slots)|today only|expires (tonight|today|soon)|last chance/i,
    flag: 'Creates urgency to decide immediately',
  },
  {
    id: 'personalpay',
    weight: 25,
    re: /personal (upi|account|number)|pay to my|individual (bank )?account|(gpay|phonepe|paytm) (id|number) *[:\-]/i,
    flag: 'Asks for payment to a personal UPI ID / account rather than a registered entity',
  },
  {
    id: 'channel',
    weight: 15,
    re: /whatsapp|telegram|forwarded as received|sms tip|cold call|dm(ed)? me/i,
    flag: 'Arrived via an unsolicited WhatsApp/Telegram/SMS channel',
  },
  {
    id: 'unregistered',
    weight: 20,
    re: /not sebi registered|un-?registered|offshore broker|unlisted broker|no license needed/i,
    flag: 'No verifiable SEBI/RBI registration mentioned',
  },
  {
    id: 'pyramid',
    weight: 25,
    re: /refer (and earn|\d+ friends)|pyramid|\bmlm\b|multi-level|binary plan|join under me|downline/i,
    flag: 'Reward structure resembles a referral / pyramid scheme, not an investment',
  },
  {
    id: 'upfrontfee',
    weight: 15,
    re: /processing fee|advance fee|registration fee|activation fee|unlock fee|gst extra before/i,
    flag: 'Requires an upfront "processing/activation" fee before any payout',
    hidden: true,
  },
];

export function analyzeOfferOffline(text) {
  const redFlags = [];
  const hiddenCosts = [];
  let score = 100;
  let highPct = null;

  for (const sig of OFFER_SIGNALS) {
    const m = text.match(sig.re);
    if (!m) continue;
    if (sig.test && !sig.test(text, m)) continue;
    if (sig.id === 'highpct') highPct = parseInt(m[1], 10);
    score -= sig.weight;
    if (sig.hidden) hiddenCosts.push(sig.flag);
    else redFlags.push(sig.flag);
  }
  score = Math.max(score, 0);

  const verdict = score >= 70 ? 'safe' : score >= 40 ? 'caution' : 'avoid';
  const headline = {
    safe: 'Nothing obviously alarming here, but always verify before you commit.',
    caution: "A few things don't add up — worth a closer look before proceeding.",
    avoid: 'This carries multiple classic scam signals — please do not proceed.',
  }[verdict];
  const realityCheck = highPct
    ? `A claimed ${highPct}% return can't legally be guaranteed by any SEBI-regulated product in India — that's a red flag by itself, not a bonus.`
    : 'No unrealistic return claim detected, but that alone doesn\'t make an offer legitimate — always verify the entity independently.';
  const action = {
    safe: 'Still verify SEBI/AMFI registration on sebi.gov.in before investing, and never send money to a personal account.',
    caution: 'Verify the entity on sebi.gov.in / RBI\'s Sachet portal before sending any money, and never pay to a personal UPI or account.',
    avoid: 'Do not send money or share OTPs/KYC details. Report it on RBI\'s Sachet portal (sachet.rbi.org.in) if it keeps contacting you.',
  }[verdict];

  return { verdict, score, headline, redFlags, hiddenCosts, realityCheck, action, offline: true };
}

// `hasAI` changes what this admits to. With an AI engine configured, reaching
// here means the network call failed — telling the customer to "connect a key"
// they already have reads as broken. Without one, the hint is the right advice.
export function fallbackResponse(hasAI = false) {
  return {
    mood: 'thinking',
    text: hasAI
      ? `I couldn't reach my reasoning engine just then — looks like a connection hiccup. Ask me again in a moment, or pick one of these and I'll answer from your data right now.`
      : `I want to give you a precise, data-backed answer for that. Meanwhile, here's what I can dig into right now — or connect an AI key in settings for open-ended questions.`,
    chips: ['Show my portfolio', 'Analyse my spending', 'Invest my surplus', 'Help me save tax'],
  };
}
