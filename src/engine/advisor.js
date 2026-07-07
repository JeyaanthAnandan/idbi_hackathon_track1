// ─────────────────────────────────────────────────────────────
// MITRA's brain — hybrid conversational engine.
// 1. Intent detection (keyword + pattern scoring) → deterministic,
//    data-grounded answers with rich inline widgets. Works offline.
// 2. Optional LLM fallback (Claude API) for free-form questions,
//    grounded with the same computed financial context.
// Every response: { text, widget?, chips?, mood? }
// ─────────────────────────────────────────────────────────────
import {
  customer,
  holdings,
  monthlySummary,
  spendByCategory,
  modelPortfolios,
  totalWealth,
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
  xray,
  ltcgHarvest,
  prepayVsInvest,
  moneyPersona,
  goalCollision,
} from './analytics.js';
import { peers } from '../data/customer.js';
import { goals } from '../data/customer.js';

const INTENTS = [
  { id: 'greeting', kw: ['hi', 'hello', 'hey', 'namaste', 'good morning', 'good evening'] },
  { id: 'portfolio', kw: ['portfolio', 'holdings', 'net worth', 'wealth', 'my investments', 'where is my money', 'asset'] },
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
  let best = { id: null, score: 0 };
  for (const intent of INTENTS) {
    let score = 0;
    for (const kw of intent.kw) if (t.includes(kw)) score += kw.split(' ').length;
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
function parseSipQuery(text) {
  const t = text.toLowerCase().replace(/,/g, '');
  const amtMatch = t.match(/(?:₹|rs\.?\s*)?(\d{3,7})(?:\s*(?:per month|\/month|monthly|pm))?/);
  const yrMatch = t.match(/(\d{1,2})\s*(?:years|year|yrs|yr)/);
  return {
    amount: amtMatch ? parseInt(amtMatch[1]) : 10000,
    years: yrMatch ? parseInt(yrMatch[1]) : 10,
  };
}

const firstName = customer.name.split(' ')[0];

// ── Hindi response overlays (vernacular = accessibility) ──────
// Same computed numbers, Hindi phrasing. Full coverage via Bhashini in prod.
const HI_TEXT = {
  greeting: () => {
    const cf = cashflow();
    const hs = healthScore();
    return {
      text: `नमस्ते ${firstName}! मैं MITRA हूँ — आपकी दौलत की दोस्त। आपका फाइनेंशियल हेल्थ स्कोर ${hs.total}/100 है, और हर महीने ${fmt(cf.surplus)} बिना काम के पड़े हैं। बताइए, इन्हें आपके सपनों पर लगाएँ?`,
      chips: ['सरप्लस निवेश करो', 'मेरा पोर्टफोलियो दिखाओ', 'खर्च का विश्लेषण करो', 'टैक्स बचाओ'],
    };
  },
  surplus: () => {
    const cf = cashflow();
    const monthly = Math.floor(cf.surplus / 500) * 500;
    return {
      text: `आपके 6 महीने के लेन-देन देखकर, आप आराम से ${fmt(monthly)}/महीना और निवेश कर सकती हैं — जीवनशैली पर कोई असर नहीं। 10 साल में यह लगभग ${fmtCompact(sipFutureValue(monthly, 11, 10))} बन सकता है, जबकि बचत खाते में सिर्फ ${fmtCompact(sipFutureValue(monthly, 3, 10))}। SIP शुरू करें?`,
      chips: ['हाँ, SIP शुरू करो', 'मेरे लक्ष्य दिखाओ'],
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
      text: `जून में आपने ${fmt(cf.last.spend)} खर्च किए। सबसे बड़ा उछाल: ${a ? `बाहर खाना — ${fmt(a.amount)}, यानी औसत से ${a.deltaPct.toFixed(0)}% ज़्यादा` : 'कोई नहीं'}। थोड़ी सी कटौती आपके यूरोप ट्रिप को जल्दी पूरा कर देगी!`,
      chips: ['सरप्लस निवेश करो', 'मेरे लक्ष्य दिखाओ'],
    };
  },
  goals: () => ({
    text: `आपके 4 लक्ष्य ट्रैक पर हैं। यूरोप ट्रिप को थोड़ा ध्यान चाहिए — किसी भी लक्ष्य पर टैप करें, मैं पूरा प्लान बना दूँगी।`,
    chips: ['यूरोप ट्रिप का प्लान बनाओ', 'सरप्लस निवेश करो'],
  }),
  tax: () => {
    const tg = taxGap();
    return {
      text: `आपने 80C की ₹1.5 लाख सीमा में से सिर्फ ${fmt(tg.section80CUsed)} इस्तेमाल किए हैं — ${fmt(tg.gap)} बाकी है। ELSS SIP से यह भर जाए तो करीब ${fmt(tg.estSaving)} टैक्स बचेगा, और इक्विटी ग्रोथ अलग से। शुरू करें?`,
      chips: ['हाँ, ELSS SIP शुरू करो', 'मेरा पोर्टफोलियो दिखाओ'],
    };
  },
  health: () => {
    const hs = healthScore();
    return {
      text: `आपका फाइनेंशियल हेल्थ स्कोर ${hs.total}/100 है — ${hs.grade}। बचत की आदत शानदार है; बस बहुत सारा पैसा बेकार पड़ा है। नीचे के दो सुझाव मानिए, स्कोर 80 पार हो जाएगा।`,
      chips: ['सरप्लस निवेश करो', 'टैक्स बचाओ'],
    };
  },
  risky: () => ({
    text: `घबराना बिल्कुल स्वाभाविक है, ${firstName} जी। पर याद रखिए — आपके लक्ष्य 2 से 26 साल दूर हैं, और भारतीय बाज़ार में हर 5+ साल की अवधि ने धैर्यवान SIP निवेशकों को इनाम दिया है। गिरावट में आपकी SIP सस्ते में ज़्यादा यूनिट खरीदती है। आपका इमरजेंसी फंड सुरक्षित है, इसलिए कभी घबराकर बेचना नहीं पड़ेगा।`,
    chips: ['मेरा पोर्टफोलियो दिखाओ', 'सरप्लस निवेश करो'],
  }),
};

export function respond(text, riskProfile = 'Balanced', lang = 'en') {
  const base = respondCore(text, riskProfile);
  if (!base || lang !== 'hi') return base;
  const intent = detectIntent(text);
  const hi = HI_TEXT[intent]?.();
  return hi ? { ...base, text: hi.text, chips: hi.chips } : base;
}

function respondCore(text, riskProfile = 'Balanced') {
  const intent = detectIntent(text);
  const cf = cashflow();
  const hs = healthScore();

  switch (intent) {
    case 'greeting':
      return {
        mood: 'happy',
        text: `Hi ${firstName}, I've been keeping an eye on your money. Your Financial Health Score is ${hs.total}/100 (${hs.grade}) and I've spotted ${fmt(cf.surplus)} sitting idle each month. Want me to put it to work?`,
        chips: ['Invest my surplus', 'Show my portfolio', 'Analyse my spending', 'Am I protected?', "How's my financial health?"],
      };

    case 'portfolio': {
      const alloc = allocation();
      return {
        mood: 'proud',
        text: `Your total wealth with us is ${fmtCompact(totalWealth())}. Here's the split — notice that ${(
          alloc.find((a) => a.type === 'Savings Account').pct +
          alloc.find((a) => a.type === 'Fixed Deposit').pct
        ).toFixed(0)}% sits in low-growth savings & FDs while only ${equityExposure().toFixed(0)}% is in growth assets. For a ${customer.age}-year-old with a ${riskProfile} profile, I'd nudge more toward equity.`,
        widget: { type: 'allocation', data: { alloc, holdings, total: totalWealth() } },
        chips: ['What should my ideal portfolio be?', 'Invest my surplus', 'Show my goals'],
      };
    }

    case 'spending': {
      const anomalies = spendingAnomalies();
      const a = anomalies[0];
      return {
        mood: 'thinking',
        text: `You spent ${fmt(cf.last.spend)} in June against income of ${fmt(cf.last.income)}. ${
          a
            ? `Biggest jump: ${a.category} at ${fmt(a.amount)} — that's ${a.deltaPct.toFixed(0)}% above your 3-month average. `
            : ''
        }Trimming just the excess (${fmt(a ? a.amount - a.avg3m : 0)}) redirected to your Europe Trip SIP gets you there ~2 months sooner.`,
        widget: { type: 'spending', data: { categories: spendByCategory, months: monthlySummary } },
        chips: ['Show unused subscriptions', 'Invest my surplus', 'Show my goals'],
      };
    }

    case 'surplus': {
      const monthly = Math.floor(cf.surplus / 500) * 500;
      const fv10 = sipFutureValue(monthly, 11, 10);
      const fvIdle = sipFutureValue(monthly, 3, 10);
      const p = modelPortfolios[riskProfile];
      return {
        mood: 'excited',
        text: `Based on 6 months of your cashflow, you can comfortably invest ${fmt(monthly)}/month more without touching your lifestyle. In a ${riskProfile.toLowerCase()} portfolio (~${p.expectedReturn}% p.a.), that becomes ${fmtCompact(
          sipFutureValue(monthly, p.expectedReturn, 10)
        )} in 10 years — versus ${fmtCompact(fvIdle)} if it stays in savings. Shall I set up the SIP mandate?`,
        widget: {
          type: 'sip',
          data: { monthly, rate: p.expectedReturn, years: 10, fv: sipFutureValue(monthly, p.expectedReturn, 10), fvIdle },
        },
        why: [
          `6-month average: income ${fmt(cf.avgIncome)} − spends ${fmt(cf.avgSpend)} − existing SIP ${fmt(cf.avgInvested)} = ${fmt(cf.surplus)} surplus`,
          `Rounded down to ${fmt(monthly)} to keep a buffer for irregular months`,
          `${p.expectedReturn}% assumption comes from your ${riskProfile} model portfolio, not a promise`,
        ],
        chips: ['Yes, set up this SIP', 'Show ideal portfolio split', 'Make it ₹15,000 instead'],
        cta: { label: `Start SIP of ${fmt(monthly)}/mo`, type: 'sip-setup', amount: monthly },
      };
    }

    case 'goals': {
      const plans = allGoalPlans(modelPortfolios[riskProfile].expectedReturn);
      const behind = plans.filter((g) => g.progress < 40 && g.horizonYears <= 3);
      return {
        mood: 'thinking',
        text: `Here's where your 4 goals stand. ${
          behind.length
            ? `Your ${behind[0].name} needs attention — you'd need ${fmt(behind[0].monthly)}/month to stay on track.`
            : 'You are broadly on track!'
        } Tap any goal and I'll build a plan for it.`,
        widget: { type: 'goals', data: { plans } },
        chips: ['Plan my Europe trip', 'Plan retirement', 'Invest my surplus'],
      };
    }

    case 'tax': {
      const tg = taxGap();
      return {
        mood: 'thinking',
        text: `You've used ${fmt(tg.section80CUsed)} of your ₹1.5L Section 80C limit — ${fmt(tg.gap)} still unused. An ELSS SIP of ${fmt(
          Math.ceil(tg.monthlyToFill / 100) * 100
        )}/month for the rest of the FY fills the gap, could save ~${fmt(tg.estSaving)} in tax, AND builds equity wealth. Double win. Want me to set it up?`,
        widget: { type: 'tax', data: tg },
        why: [
          `80C tracked from your ELSS SIP + EPF deductions visible in salary credits: ${fmt(tg.section80CUsed)} used`,
          `Gap ${fmt(tg.gap)} ÷ 9 months left in FY = ${fmt(tg.monthlyToFill)}/month`,
          `Tax saving estimated at 31.2% marginal rate (old regime); I'll compare regimes before you commit`,
        ],
        chips: ['Yes, start the ELSS SIP', 'Old vs new regime?', 'Show my portfolio'],
        cta: { label: 'Start tax-saver SIP', type: 'sip-setup', amount: Math.ceil(tg.monthlyToFill / 100) * 100 },
      };
    }

    case 'subscriptions': {
      const unused = unusedSubscriptions();
      const waste = subscriptionWaste();
      return {
        mood: 'thinking',
        text: `I found ${unused.length} subscriptions you haven't used in months, costing ${fmt(waste)}/month (${fmt(
          waste * 12
        )}/year). Cancelled and redirected into your Europe Trip SIP, that alone adds ${fmtCompact(sipFutureValue(waste, 11, 2))} in 2 years.`,
        widget: { type: 'subs', data: { unused, waste } },
        chips: ['Invest my surplus', 'Analyse my spending'],
      };
    }

    case 'emergency': {
      const need = 400000;
      const gap = need - customer.savingsBalance;
      return {
        mood: 'thinking',
        text: `Your safety net covers ${hs.emergencyMonths.toFixed(1)} months of expenses — the target is 6 months (${fmtCompact(
          need
        )}). You're ${fmt(gap)} short. I suggest a sweep-in FD: your money earns FD rates (~7%) but stays withdrawable instantly. Move ${fmt(
          Math.min(gap, 100000)
        )} now and auto-top-up ${fmt(10000)}/month?`,
        chips: ['Yes, set up sweep-in FD', "What's a sweep-in FD?", 'Show my health score'],
      };
    }

    case 'health':
      return {
        mood: hs.total >= 55 ? 'proud' : 'thinking',
        text: `Your Financial Health Score is ${hs.total}/100 — ${hs.grade}. Strongest area: savings discipline. Weakest: too much idle cash and FD-heavy allocation for your age. Fix the two nudges below and you'd cross 80.`,
        widget: { type: 'health', data: hs },
        chips: ['Invest my surplus', 'Fix my emergency fund', 'Help me save tax'],
      };

    case 'fdvsmf': {
      const amt = 10000;
      return {
        mood: 'thinking',
        text: `Honest answer: both have a place. FDs (~7%) are for money you need in 1–3 years — guaranteed, sleep-easy. Equity funds (~11–13% long-term) are for 5+ year goals but swing along the way. ${fmt(
          amt
        )}/month for 10 years: FD grows to ${fmtCompact(sipFutureValue(amt, 7, 10))}, an index fund historically to ${fmtCompact(
          sipFutureValue(amt, 12, 10)
        )}. Your mix should follow your goals, not either-or.`,
        widget: {
          type: 'compare',
          data: {
            rows: [
              { label: 'Safety', fd: 'Capital guaranteed', mf: 'Market-linked' },
              { label: 'Best for', fd: '1–3 yr goals', mf: '5+ yr goals' },
              { label: '₹10K/mo → 10 yrs', fd: fmtCompact(sipFutureValue(amt, 7, 10)), mf: fmtCompact(sipFutureValue(amt, 12, 10)) },
              { label: 'Tax', fd: 'Interest taxed at slab', mf: 'LTCG 12.5% above ₹1.25L' },
            ],
          },
        },
        chips: ['Show ideal portfolio split', 'Invest my surplus'],
      };
    }

    case 'risky':
      return {
        mood: 'happy',
        text: `Totally fair to feel that way, ${firstName}. Here's the perspective: you're ${customer.age} — your goals are 2 to 26 years away. Historically, every 5+ year period in Indian equities has rewarded patient SIP investors, and market dips actually buy you more units. Your plan also keeps ${hs.emergencyMonths.toFixed(0)} months of expenses in safe assets, so you never sell in panic. I'll rebalance you automatically if markets get frothy. Deal?`,
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
      const fv = sipFutureValue(amount, 11, years);
      const invested = amount * years * 12;
      return {
        mood: 'excited',
        text: `${fmt(amount)}/month for ${years} years at ~11% p.a. grows to ${fmtCompact(fv)}. You'd invest ${fmtCompact(invested)} and earn ${fmtCompact(
          fv - invested
        )} in returns — compounding doing the heavy lifting.`,
        widget: { type: 'sip', data: { monthly: amount, rate: 11, years, fv, fvIdle: sipFutureValue(amount, 3, years) } },
        chips: ['Start this SIP', 'Try ₹20,000 for 15 years'],
      };
    }

    case 'market': {
      const mp = marketPulse();
      const up = mp.delta >= 0;
      return {
        mood: up ? 'happy' : 'thinking',
        text: `${mp.index} is ${up ? 'up' : 'down'} ${Math.abs(mp.weekChangePct)}% this week — your equity holdings ${up ? 'gained' : 'lost'} about ${fmt(Math.abs(mp.delta))}. ${mp.headline} My advice stays the same: your SIPs buy through every cycle, so short-term moves are noise for your 5+ year goals.`,
        widget: { type: 'pulse', data: mp },
        chips: ['Rebalance my portfolio', 'Is it safe if markets crash?', 'Show my portfolio'],
      };
    }

    case 'rebalance': {
      const dr = drift(riskProfile);
      const g = dr.biggestGap;
      return {
        mood: 'thinking',
        text: `Against your ${riskProfile} target, the biggest drift is ${g.name}: ${Math.abs(g.gap).toFixed(0)}% ${g.gap > 0 ? 'below' : 'above'} where it should be. Rather than selling anything (and triggering tax), I'll redirect your new SIPs toward ${g.gap > 0 ? g.name.toLowerCase() : 'the underweight assets'} until you're back on target. Approve the glide path?`,
        widget: { type: 'drift', data: dr },
        why: [
          `Current mix computed from live holdings: ${dr.current.map((c) => `${c.name} ${c.pct.toFixed(0)}%`).join(', ')}`,
          `Target mix for ${riskProfile} profile: ${dr.target.map((c) => `${c.name} ${c.pct}%`).join(', ')}`,
          'SIP-based rebalancing avoids capital-gains tax and exit loads vs. sell-and-buy',
        ],
        chips: ['Yes, set the glide path', 'Show ideal portfolio split', 'Show my portfolio'],
        cta: { label: 'Approve SIP glide path', type: 'sip-setup', amount: 10000 },
      };
    }

    case 'roundup': {
      const ru = roundup();
      return {
        mood: 'excited',
        text: `Fun one! You make ~${ru.upiTxnsPerMonth} UPI payments a month. If I round each up to the nearest ₹50 and sweep the change into a liquid fund, that's ${fmt(ru.monthly)}/month invested without you ever feeling it — ${fmtCompact(ru.in5y)} in 5 years, ${fmtCompact(ru.in10y)} in 10. Investing that literally happens while you pay for chai. Switch it on?`,
        why: [
          `${ru.upiTxnsPerMonth} UPI debits/month detected in your account (6-month average)`,
          `Average round-up to nearest ₹50: ${fmt(ru.avgRoundup)} per transaction`,
          `Projection at 11% p.a. equity index returns, compounded monthly`,
        ],
        chips: ['Turn on Round-Up investing', 'Invest my surplus', 'Show my goals'],
        cta: { label: `Enable Round-Up (${fmt(ru.monthly)}/mo)`, type: 'roundup', amount: ru.monthly },
      };
    }

    case 'benchmark': {
      return {
        mood: 'proud',
        text: `You're doing better than ${peers.percentile}% of people like you (${peers.cohort}). Your savings rate and SIP discipline are well above the median — the one place the cohort beats you is tax-limit utilisation. Fix that 80C gap and you'd be in the top 10%.`,
        widget: { type: 'peers', data: peers },
        chips: ['Help me save tax', "How's my financial health?", 'Invest my surplus'],
      };
    }

    case 'fraud':
      return {
        mood: 'thinking',
        text: `I'm glad you asked me before acting — that instinct just protected your wealth. Any "guaranteed" return above ~8% is a red flag: SEBI-regulated products cannot guarantee market returns. Run every offer through my 30-second check below. And remember — if it can't wait 24 hours, it's not an investment, it's a trap.`,
        widget: {
          type: 'shield',
          data: {
            checks: [
              { flag: '"Guaranteed" 15–30% returns', why: 'Legitimate products can\'t guarantee above FD rates (~7%)' },
              { flag: 'Urgency — "offer closes tonight"', why: 'Real investments never expire in hours' },
              { flag: 'WhatsApp / Telegram tips', why: 'SEBI-registered advisors don\'t cold-message' },
              { flag: 'Pay to a personal UPI / account', why: 'Regulated firms collect only in their own name' },
              { flag: 'Unregistered entity', why: 'Verify on sebi.gov.in / RBI\'s sachet portal' },
            ],
          },
        },
        why: [
          'Framework based on SEBI investor-protection advisories and RBI Sachet guidelines',
          'MITRA also watches your outgoing transfers for first-time high-value payees and known mule-account patterns',
        ],
        chips: ['Check an offer I received', 'Where should I invest instead?', 'Talk to a human advisor'],
      };

    case 'insurance': {
      const pg = protectionGap();
      return {
        mood: 'thinking',
        text: `Honest check, ${firstName}: growth is on track, but protection isn't. Your ${fmtCompact(pg.termCover)} life cover is employer-provided — it vanishes the day you switch jobs — and ${pg.dependents} people depend on your income. You need ${fmtCompact(pg.termNeeded)} (15× income). Health cover has a ${fmtCompact(pg.healthGap)} gap too. Total fix: about ${fmt(pg.totalMonthly)}/month — less than your unused subscriptions.`,
        widget: { type: 'protection', data: pg },
        why: [
          `Term need = 15 × annual income (${fmt(customer.monthlyIncome * 12)}) = ${fmtCompact(pg.termNeeded)}`,
          `Employer cover excluded from adequacy since it isn't portable`,
          `Premiums indicative for age ${customer.age}, non-smoker; exact quote at issuance`,
        ],
        chips: ['Fix my protection gap', 'Show my health score', 'Talk to a human advisor'],
        cta: { label: `Fix protection · ${fmt(pg.totalMonthly)}/mo`, type: 'sip-setup', amount: pg.totalMonthly },
      };
    }

    case 'human': {
      const hsNow = healthScore();
      return {
        mood: 'happy',
        text: `Of course — some decisions deserve a human across the table, and IDBI has 2,000+ branches of them. I've booked a callback from an IDBI wealth RM and prepared a briefing so you won't have to repeat yourself. I'll sit in on the call too, if you want the numbers handy.`,
        widget: {
          type: 'handoff',
          data: {
            rm: 'Rohit Menon · Wealth RM, Nariman Point',
            slot: 'Tomorrow, 11:00 AM',
            brief: [
              `${customer.name}, ${customer.age} · ${riskProfile} profile · Health score ${hsNow.total}/100`,
              `Wealth ${fmtCompact(totalWealth())} · surplus ${fmt(cashflow().surplus)}/mo idle`,
              `Open items: 80C gap ${fmt(taxGap().gap)}, protection gap, equity under-allocation`,
              'Interested in: home purchase planning (6-yr horizon)',
            ],
          },
        },
        chips: ['Continue with MITRA for now', 'Show my goals'],
      };
    }

    case 'xray': {
      const xr = xray();
      return {
        mood: 'thinking',
        text: `I ran an X-ray on your funds and found two things worth your attention. One: your ${xr.fund} is a ${xr.plan} plan charging ${xr.er}% — the identical Direct plan costs ${xr.directEr}%. That invisible ${xr.dragPct.toFixed(1)}% commission compounds to ${fmtCompact(xr.feeLoss)} lost over ${xr.years} years. Two: it overlaps ${xr.overlapPct}% with your ${xr.overlapWith} — you're paying active fees for stocks you already own passively. Want me to switch you to Direct?`,
        widget: { type: 'xray', data: xr },
        why: [
          `Expense ratios from AMC fact sheets: Regular ${xr.er}% vs Direct ${xr.directEr}%`,
          `Fee-loss projection: same fund, same returns, only the fee differs, ${xr.years}-year horizon with your current SIP`,
          `Overlap computed on top-25 holdings of both funds`,
        ],
        chips: ['Switch me to Direct plans', 'Show my portfolio', 'Harvest my capital gains'],
        cta: { label: 'Switch to Direct plan', type: 'sip-setup', amount: 3000 },
      };
    }

    case 'harvest': {
      const lh = ltcgHarvest();
      return {
        mood: 'excited',
        text: `Here's a completely legal trick most people never use: long-term equity gains up to ₹1.25 lakh a year are tax-free. You're sitting on ${fmt(lh.gains)} of unrealised gains. Sell and instantly re-buy before March 31st — your cost basis resets, and ${fmt(lh.taxSaved)} of future tax quietly disappears. Do this every year and the habit alone compounds to ${fmtCompact(lh.habitValue)} over 20 years. Ten minutes of work, I'll handle the orders.`,
        widget: { type: 'harvest', data: lh },
        why: [
          `Unrealised LTCG across your equity funds: ${fmt(lh.gains)} (current value minus purchase cost)`,
          `Section 112A exempts ₹1,25,000 of LTCG per FY; harvesting uses it before it lapses`,
          `Tax saved = harvested gains × 12.5% LTCG rate; exit-load-free units only`,
        ],
        chips: ['Yes, harvest my gains', 'X-ray my portfolio', 'Help me save tax'],
        cta: { label: `Harvest ${fmt(lh.harvestable)} tax-free`, type: 'sip-setup', amount: 0 },
      };
    }

    case 'prepay': {
      const pv = prepayVsInvest(50000);
      const better = pv.interestSaved > pv.investGain * 0.7; // risk-adjust the equity path
      return {
        mood: 'thinking',
        text: `The eternal question! Your education loan: ${fmt(pv.loan.balance)} left at ${pv.loan.rate}%. Prepaying ${fmt(pv.prepayAmount)} saves ${fmt(pv.interestSaved)} in interest and finishes it ${pv.monthsSaved} months early — a guaranteed ${pv.loan.rate}% return. Investing the same could make ${fmt(Math.round(pv.investGain))} at 11%, but that's not guaranteed. At ${pv.loan.rate}%, the maths says ${better ? 'prepay — a risk-free 10.5% beats a risky 11%' : 'invest'}. And the peace of being debt-free? That compounds too.`,
        widget: {
          type: 'compare',
          data: {
            rows: [
              { label: 'Certainty', fd: '100% guaranteed', mf: 'Market-linked' },
              { label: `₹50K outcome (${Math.round(pv.loanMonths / 12)} yrs)`, fd: `saves ${fmt(pv.interestSaved)}`, mf: `may earn ${fmt(Math.round(pv.investGain))}` },
              { label: 'Loan ends', fd: `${pv.monthsSaved} months earlier`, mf: 'on schedule' },
              { label: 'MITRA says', fd: 'Prepay this one', mf: 'Invest after loan closes' },
            ],
          },
        },
        why: [
          `Amortization on actual loan: ${fmt(pv.loan.balance)} @ ${pv.loan.rate}%, EMI ${fmt(pv.loan.emi)}, ${pv.loan.monthsLeft} months left`,
          'Prepayment return is guaranteed; equity return is expected, so it is risk-adjusted before comparing',
        ],
        chips: ['Prepay ₹50,000 now', 'Invest my surplus instead', 'Show my goals'],
        cta: { label: `Prepay ${fmt(pv.prepayAmount)} · save ${fmt(pv.interestSaved)}`, type: 'sip-setup', amount: pv.prepayAmount },
      };
    }

    case 'persona': {
      const mp = moneyPersona();
      return {
        mood: 'proud',
        text: `I've watched six months of your money moves, ${firstName}, and here's your Money Persona: **${mp.title}** — ${mp.tagline}. It's a strong profile; the two things holding you back are idle cash and thin insurance. Want the full card?`,
        widget: { type: 'persona', data: mp },
        chips: ['Am I protected?', 'Invest my surplus', 'Compare me with my peers'],
      };
    }

    case 'collision': {
      const gc = goalCollision(modelPortfolios[riskProfile].expectedReturn);
      return {
        mood: 'thinking',
        text: `Time for honest maths. Funding all four goals on schedule needs ${fmt(gc.needTotal)}/month — you have ${fmt(gc.capacity)}/month of investing capacity. That's a ${fmt(gc.deficit)} collision. Rather than pretending, here's my triage: fully fund the emergency fund and home first, keep retirement compounding, and push the Europe trip out ~8 months. Dreams don't die in this plan — they just queue politely.`,
        widget: { type: 'collision', data: gc },
        why: [
          `Required SIPs computed per goal at ${modelPortfolios[riskProfile].expectedReturn}% expected return`,
          `Capacity = investable surplus ${fmt(cashflow().surplus)} + current SIP ${fmt(cashflow().avgInvested)}`,
          'Priority order: safety → committed goals → compounding → lifestyle',
        ],
        chips: ['Apply this plan', 'Open the Time Machine', 'Show my goals'],
        cta: { label: 'Apply the triage plan', type: 'sip-setup', amount: gc.capacity },
      };
    }

    default:
      return null; // hand off to LLM if configured, else graceful fallback
  }
}

export function fallbackResponse() {
  return {
    mood: 'thinking',
    text: `I want to give you a precise, data-backed answer for that. Meanwhile, here's what I can dig into right now — or connect an AI key in settings for open-ended questions.`,
    chips: ['Show my portfolio', 'Analyse my spending', 'Invest my surplus', 'Help me save tax'],
  };
}

// Grounding context sent to the LLM so free-form answers stay personal
export function financialContext(riskProfile) {
  const cf = cashflow();
  const hs = healthScore();
  const tg = taxGap();
  return `You are MITRA, IDBI Bank's warm, trustworthy AI wealth advisor avatar. Reply in 2-4 short sentences, always grounded in this customer's real data. Use ₹ and Indian number formats. Never give guaranteed-return promises; add brief risk framing for market products.
Customer: ${customer.name}, ${customer.age}, ${customer.segment}, ${customer.city}. Risk profile: ${riskProfile}.
Total wealth: ${fmt(totalWealth())}. Savings balance: ${fmt(customer.savingsBalance)}. Monthly income ${fmt(cf.avgIncome)}, avg spend ${fmt(cf.avgSpend)}, current SIP ${fmt(cf.avgInvested)}/mo, investable surplus ${fmt(cf.surplus)}/mo. Savings rate ${cf.savingsRate.toFixed(0)}%.
Financial health score: ${hs.total}/100 (${hs.grade}). Emergency cover: ${hs.emergencyMonths.toFixed(1)}/6 months.
Holdings: ${holdings.map((h) => `${h.label} ${fmt(h.value)}`).join('; ')}.
Goals: ${goals.map((g) => `${g.name} target ${fmt(g.target)} in ${g.horizonYears}y, saved ${fmt(g.saved)}`).join('; ')}.
80C used ${fmt(tg.section80CUsed)} of ₹1,50,000.`;
}
