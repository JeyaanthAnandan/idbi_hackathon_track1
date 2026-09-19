// ─────────────────────────────────────────────────────────────
// Analytics engine — turns raw banking data into wealth insights.
// Everything MITRA says is computed from here (data-driven, not canned).
// ─────────────────────────────────────────────────────────────
import {
  customer,
  holdings,
  monthlySummary,
  spendByCategory,
  subscriptions,
  goals,
  tax,
  totalWealth,
  market,
  roundupStats,
  dataQuality,
  modelPortfolios,
  insurance,
  fundFacts,
  loans,
} from '../data/customer.js';
import { getAppliedState, hasAction, sumAction } from './portfolioState.js';
import {
  POLICY, POLICY_AS_OF, healthCoverTarget, insurancePremiumRates,
  monthsRemainingInFinancialYear, returnScenario,
} from '../data/policy.js';

export const fmt = (n) =>
  '₹' +
  Math.round(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });

export const fmtCompact = (n) => {
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2).replace(/\.00$/, '') + ' Cr';
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1).replace(/\.0$/, '') + ' L';
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return '₹' + Math.round(n);
};

// Dining spend snaps back to its 3-month average once the "dining alert"
// Money Rule is switched on — the freed-up amount is recoverable surplus.
function diningRecovered() {
  if (!getAppliedState().rules.dining) return 0;
  const d = spendByCategory.find((c) => c.category.startsWith('Dining'));
  return d && d.amount > d.avg3m ? d.amount - d.avg3m : 0;
}

// Savings balance once the "fix my emergency fund" nudge has been actioned —
// topped up to the 6-month target rather than actually moving money around.
export function emergencyFundTarget() {
  const rows = monthlySummary.length ? monthlySummary : [{ spend: 0 }];
  const avgSpend = rows.reduce((sum, row) => sum + Number(row.spend || 0), 0) / rows.length;
  return Math.round(avgSpend * POLICY.emergency.targetMonths);
}

function effectiveSavingsBalance() {
  return hasAction('emergency-fix')
    ? Math.max(customer.savingsBalance, emergencyFundTarget())
    : customer.savingsBalance;
}

// ---- Cashflow ------------------------------------------------
export function cashflow() {
  const rows = monthlySummary.length ? monthlySummary : [{ month: 'No data', income: 0, spend: 0, invested: 0 }];
  const last = rows[rows.length - 1];
  const avgIncome = rows.reduce((s, m) => s + Number(m.income || 0), 0) / rows.length;
  const avgSpendRaw = rows.reduce((s, m) => s + Number(m.spend || 0), 0) / rows.length;
  const rawBaseAvgInvested = rows.reduce((s, m) => s + Number(m.invested || 0), 0) / rows.length;
  // "salary-day auto-invest" is what keeps this baseline SIP going without willpower.
  const baseAvgInvested = getAppliedState().rules.salary ? rawBaseAvgInvested : 0;

  const subsRecovered = sumAction('subs-cancel');
  const avgSpend = Math.max(avgSpendRaw - subsRecovered - diningRecovered(), 0);

  const committedSip = sumAction('sip');
  const roundupAdded = hasAction('roundup') ? roundup().monthly : 0;
  const stepupBonus = getAppliedState().rules.stepup ? Math.round(rawBaseAvgInvested * 0.1) : 0;
  const avgInvested = baseAvgInvested + committedSip + roundupAdded + stepupBonus;

  const protectionCost = sumAction('protection-fix');
  const incomeKnown = dataQuality?.incomeAvailable !== false;
  const surplus = incomeKnown ? avgIncome - avgSpend - avgInvested - protectionCost : 0;
  const savingsRate = incomeKnown && avgIncome > 0 ? ((avgIncome - avgSpend) / avgIncome) * 100 : 0;
  return { last, avgIncome, avgSpend, avgInvested, surplus, savingsRate, incomeKnown };
}

// ---- Spending anomalies -------------------------------------
export function spendingAnomalies() {
  const diningOff = getAppliedState().rules.dining;
  return spendByCategory
    .map((c) => (diningOff && c.category.startsWith('Dining') ? { ...c, amount: c.avg3m } : c))
    .map((c) => ({ ...c, deltaPct: c.avg3m > 0 ? ((c.amount - c.avg3m) / c.avg3m) * 100 : 0 }))
    .filter((c) => c.deltaPct > 15 && !c.essential)
    .sort((a, b) => b.deltaPct - a.deltaPct);
}

export function unusedSubscriptions() {
  if (hasAction('subs-cancel')) return [];
  return subscriptions.filter((s) => String(s.lastUsed || '').startsWith('unused'));
}

export function subscriptionWaste() {
  return unusedSubscriptions().reduce((s, x) => s + x.amount, 0);
}

// ---- Portfolio ----------------------------------------------
export function allocation() {
  const total = totalWealth();
  const buckets = {};
  holdings.forEach((h) => {
    buckets[h.type] = (buckets[h.type] || 0) + h.value;
  });
  return Object.entries(buckets).map(([type, value]) => ({
    type,
    value,
    pct: total > 0 ? (value / total) * 100 : 0,
  }));
}

export function equityExposure() {
  const total = totalWealth();
  const equity = holdings
    .filter((h) => ['Mutual Fund', 'Stocks'].includes(h.type))
    .reduce((s, h) => s + h.value, 0);
  return total > 0 ? (equity / total) * 100 : 0;
}

// ---- Financial Health Score (0–100) --------------------------
export function healthScore() {
  const cf = cashflow();
  const monthlyExpense = cf.avgSpend;
  const emergencyMonths = monthlyExpense > 0
    ? effectiveSavingsBalance() / monthlyExpense
    : (effectiveSavingsBalance() > 0 ? 99 : 0);

  const parts = [
    {
      label: 'Savings Rate',
      score: Math.max(0, Math.min((cf.savingsRate / 30) * 25, 25)),
      max: 25,
      note: `${cf.savingsRate.toFixed(0)}% of income saved (target 30%)`,
    },
    {
      label: 'Emergency Cover',
      score: Math.min((emergencyMonths / POLICY.emergency.targetMonths) * 25, 25),
      max: 25,
      note: `${emergencyMonths.toFixed(1)} months of expenses covered (target ${POLICY.emergency.targetMonths})`,
    },
    {
      label: 'Diversification',
      score: equityExposure() > 15 && equityExposure() < 70 ? 20 : 12,
      max: 25,
      note: `${equityExposure().toFixed(0)}% in growth assets under the prototype asset mapping`,
    },
    {
      label: 'Goal Readiness',
      score: goals.length
        ? (goals.reduce((s, g) => s + Math.min(g.target > 0 ? g.saved / g.target : 0, 1), 0) / goals.length) * 25
        : 0,
      max: 25,
      note: 'Weighted progress across your 4 goals',
    },
  ];
  const total = Math.round(parts.reduce((s, p) => s + p.score, 0));
  const grade = total >= 75 ? 'Excellent' : total >= 55 ? 'Good' : total >= 35 ? 'Fair' : 'Needs Work';
  return { total, grade, parts, emergencyMonths };
}

// ---- SIP math ------------------------------------------------
// Future value of a monthly SIP at annual rate r% for y years
export function sipFutureValue(monthly, annualRatePct, years) {
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return monthly * n;
  return monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
}

// Monthly SIP required to reach target in y years at r%
export function sipRequired(target, annualRatePct, years, alreadySaved = 0) {
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  const fvExisting = alreadySaved * Math.pow(1 + annualRatePct / 100, years);
  const remaining = Math.max(target - fvExisting, 0);
  if (remaining === 0) return 0;
  if (r === 0) return n > 0 ? remaining / n : 0;
  return remaining / (((Math.pow(1 + r, n) - 1) / r) * (1 + r));
}

export function goalPlan(goal, expectedReturn = returnScenario('Balanced').base) {
  const monthly = sipRequired(goal.target, expectedReturn, goal.horizonYears, goal.saved);
  const progress = goal.target > 0 ? (goal.saved / goal.target) * 100 : 0;
  return { ...goal, monthly, progress, expectedReturn };
}

export function allGoalPlans(expectedReturn = returnScenario('Balanced').base) {
  return goals.map((g) => goalPlan(g, expectedReturn));
}

// ---- Tax -----------------------------------------------------
export function taxGap() {
  const available = tax?.dataAvailable !== false;
  const regimeConfirmed = Boolean(tax?.regimeConfirmed);
  const eligibleRegime = POLICY.tax.section80CEligibleRegimes.includes(tax?.regime);
  const section80CLimit = Number(tax?.section80CLimit || POLICY.tax.section80CLimit);
  const rawUsed = Number(tax?.section80CUsed || 0);
  const filled = hasAction('sip', 'tax');
  const section80CUsed = filled ? section80CLimit : rawUsed;
  const originalGap = Math.max(section80CLimit - rawUsed, 0);
  const gap = Math.max(section80CLimit - section80CUsed, 0);
  const monthsLeft = monthsRemainingInFinancialYear(POLICY_AS_OF);
  const marginalRate = Number(tax?.marginalRate || POLICY.tax.fallbackMarginalRate);
  return {
    ...tax,
    available,
    regimeConfirmed,
    eligibleRegime,
    section80CLimit,
    section80CUsed,
    gap,
    filled,
    monthsLeft,
    monthlyToFill: monthsLeft > 0 ? gap / monthsLeft : gap,
    marginalRate,
    estSaving: available && regimeConfirmed && eligibleRegime ? (filled ? originalGap : gap) * marginalRate : null,
  };
}

// ---- Protection gap: term & health insurance adequacy --------
// Rule of thumb: term cover ≥ 15× annual income; health ≥ ₹15L in metros.
export function protectionGap() {
  const available = insurance?.dataAvailable !== false;
  const fixed = hasAction('protection-fix');
  const annualIncome = customer.monthlyIncome * 12;
  const termNeeded = annualIncome * POLICY.insurance.termIncomeMultiple;
  const healthNeeded = healthCoverTarget(customer.city);
  const termCover = fixed ? termNeeded : Number(insurance?.termCover || 0);
  const healthCover = fixed ? healthNeeded : Number(insurance?.healthCover || 0);
  const termGap = Math.max(termNeeded - termCover, 0);
  const healthGap = Math.max(healthNeeded - healthCover, 0);
  const rates = insurancePremiumRates(customer.age);
  const gapTermPremium = Math.round((Math.max(termNeeded - Number(insurance?.termCover || 0), 0) / 100000) * rates.termAnnual / 12);
  const gapHealthPremium = Math.round((Math.max(healthNeeded - Number(insurance?.healthCover || 0), 0) / 100000) * rates.healthAnnual / 12);
  return {
    ...insurance,
    available,
    termCover,
    healthCover,
    termNeeded,
    termGap,
    healthNeeded,
    healthGap,
    fixed,
    termPremium: fixed ? 0 : gapTermPremium,
    healthPremium: fixed ? 0 : gapHealthPremium,
    // once fixed, this is the ongoing cost being paid (locked in when accepted)
    totalMonthly: available ? (fixed ? sumAction('protection-fix') : gapTermPremium + gapHealthPremium) : 0,
    policyVersion: POLICY.version,
  };
}

// ---- Market pulse: what the week did to *your* money ---------
export function marketPulse() {
  const equity = holdings.filter((h) => ['Mutual Fund', 'Stocks'].includes(h.type)).reduce((s, h) => s + h.value, 0);
  const delta = equity * (market.weekChangePct / 100);
  return { ...market, equity, delta };
}

// ---- Round-up micro-investing --------------------------------
export function roundup() {
  const baseReturn = returnScenario('Balanced').base;
  const monthly = Math.round(roundupStats.upiTxnsPerMonth * roundupStats.avgRoundup);
  return {
    ...roundupStats,
    monthly,
    in5y: sipFutureValue(monthly, baseReturn, 5),
    in10y: sipFutureValue(monthly, baseReturn, 10),
  };
}

// ---- Allocation drift vs target model portfolio --------------
export function drift(riskProfile = 'Balanced') {
  const total = totalWealth();
  const bucket = (types) =>
    total > 0 ? (holdings.filter((h) => types.includes(h.type)).reduce((s, h) => s + h.value, 0) / total) * 100 : 0;
  const current = [
    { name: 'Equity', pct: bucket(['Mutual Fund', 'Stocks']), color: 'var(--teal)' },
    { name: 'Debt / FD', pct: bucket(['Fixed Deposit']), color: 'var(--teal-2)' },
    { name: 'Gold', pct: bucket(['Gold']), color: 'var(--amber)' },
    { name: 'Cash', pct: bucket(['Savings Account']), color: 'var(--slate)' },
  ];
  const targets = {
    Conservative: { Equity: 20, 'Debt / FD': 50, Gold: 15, Cash: 15 },
    Balanced: { Equity: 55, 'Debt / FD': 30, Gold: 10, Cash: 5 },
    Aggressive: { Equity: 70, 'Debt / FD': 15, Gold: 5, Cash: 10 },
  }[riskProfile];
  const target = current.map((c) => ({ ...c, pct: targets[c.name] }));
  const gaps = current
    .map((c) => ({ name: c.name, gap: targets[c.name] - c.pct }))
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  return { current, target, biggestGap: gaps[0], expectedReturn: modelPortfolios[riskProfile].expectedReturn };
}

// ---- Wealth Time Machine: project net worth to age 60 --------
// Returns yearly series + the age of financial freedom (corpus ≥ 25×
// annual expenses, expenses inflating 4%/yr). `events` are life events:
// { age, oneTime, monthlyDelta } — a cost at that age and/or a lasting
// change to monthly investing capacity.
export function projectWealth({ extraMonthly = 0, annualRatePct = returnScenario('Balanced').base, events = [] } = {}) {
  const startAge = customer.age;
  const endAge = 60;
  const cf = cashflow();
  const baseMonthly = cf.avgInvested;
  const r = annualRatePct / 100 / 12;
  let wealth = totalWealth();
  let annualExpense = cf.avgSpend * 12;
  let monthlyDelta = 0;
  const series = [{ age: startAge, wealth, invested: wealth, freedomTarget: annualExpense * 25 }];
  let invested = wealth;
  let fireAge = null;

  for (let age = startAge; age < endAge; age++) {
    for (const ev of events) {
      if (ev.age === age) {
        wealth = Math.max(wealth - (ev.oneTime || 0), 0);
        monthlyDelta += ev.monthlyDelta || 0;
      }
    }
    const monthly = Math.max(baseMonthly + extraMonthly + monthlyDelta, 0);
    for (let m = 0; m < 12; m++) {
      wealth = wealth * (1 + r) + monthly;
      invested += monthly;
    }
    annualExpense *= 1.04;
    const freedomTarget = annualExpense * 25;
    if (fireAge === null && wealth >= freedomTarget) fireAge = age + 1;
    series.push({ age: age + 1, wealth, invested, freedomTarget });
  }
  return { series, fireAge, wealthAt60: wealth, invested };
}

// ---- Portfolio X-Ray: hidden fees + overlap ------------------
export function xray() {
  const switched = hasAction('direct-switch');
  const f = fundFacts?.elss;
  const elssHolding = holdings.find((h) => String(h.label || '').includes('ELSS'));
  if (!f || !elssHolding) return { available: false, reason: 'Fund plan and expense-ratio data are not connected.' };
  const elssValue = elssHolding.value;
  const regularDragPct = f.er - f.directEr; // what the Regular-plan commission costs
  const dragPct = switched ? 0 : regularDragPct;
  const years = 15;
  const grow = (ratePct) => {
    let v = elssValue;
    const r = ratePct / 100 / 12;
    for (let m = 0; m < years * 12; m++) v = v * (1 + r) + f.monthlySip;
    return v;
  };
  const grossReturn = returnScenario('Balanced').bull;
  const feeLossAvoided = grow(grossReturn) - grow(grossReturn - regularDragPct); // what staying Regular would have cost
  const feeLoss = switched ? 0 : feeLossAvoided;
  return {
    available: true,
    fund: f.name,
    plan: switched ? 'Direct' : f.plan,
    er: switched ? f.directEr : f.er,
    regularEr: f.er,
    directEr: f.directEr,
    dragPct,
    years,
    feeLoss,
    feeLossAvoided,
    switched,
    overlapPct: fundFacts.overlapPct,
    overlapWith: fundFacts.index.name,
    grossReturn,
  };
}

// ---- LTCG harvesting: use the ₹1.25L exemption every year ----
export function ltcgHarvest() {
  const harvested = hasAction('harvest');
  const equity = holdings.filter((h) => ['Mutual Fund', 'Stocks'].includes(h.type));
  const gains = equity.reduce((s, h) => s + (h.value - (h.cost || h.value)), 0);
  const exemption = POLICY.tax.ltcgEquityExemption;
  const harvestable = harvested ? 0 : Math.max(0, Math.min(gains, exemption));
  const taxSaved = harvestable * POLICY.tax.ltcgEquityRate;
  const habitValue = sipFutureValue((harvested ? sumAction('harvest') : taxSaved) / 12, returnScenario('Balanced').base, 20);
  return { gains, exemption, harvestable, taxSaved, habitValue, harvested };
}

// ---- Prepay loan vs invest -----------------------------------
export function prepayVsInvest(prepayAmount = 50000, riskProfile = 'Balanced') {
  const prepaidSoFar = sumAction('prepay');
  if (!loans.length || !loans[0]?.balance) return { available: false, prepaidSoFar };
  const loan = { ...loans[0], balance: Math.max(loans[0].balance - prepaidSoFar, 0) };
  const interestRemaining = (balance, emi, rate, cap = 600) => {
    let b = balance, interest = 0, months = 0;
    const r = rate / 100 / 12;
    while (b > 0 && months < cap) {
      const i = b * r;
      interest += i;
      b = b + i - emi;
      months++;
    }
    return { interest, months };
  };
  const now = interestRemaining(loan.balance, loan.emi, loan.rate);
  const after = interestRemaining(Math.max(loan.balance - prepayAmount, 0), loan.emi, loan.rate);
  const interestSaved = now.interest - after.interest;
  const monthsSaved = now.months - after.months;
  const investRate = returnScenario(riskProfile).base;
  const investValue = prepayAmount * Math.pow(1 + investRate / 100, now.months / 12);
  const investGain = investValue - prepayAmount;
  return { available: true, loan, prepayAmount, interestSaved, monthsSaved, investGain, investRate, loanMonths: now.months, prepaidSoFar };
}

// ---- Money Persona: behavioural fingerprint ------------------
export function moneyPersona() {
  const cf = cashflow();
  const anomalies = spendingAnomalies();
  const pg = protectionGap();
  const investedMonths = monthlySummary.filter((month) => Number(month.invested || 0) > 0).length;
  return buildMoneyPersona({
    observedMonths: monthlySummary.length,
    investedMonths,
    savingsRate: cf.savingsRate,
    largestAnomaly: anomalies[0] || null,
    protection: pg.available ? { termCover: pg.termCover, termNeeded: pg.termNeeded, termGap: pg.termGap } : null,
  });
}

export function buildMoneyPersona({ observedMonths, investedMonths, savingsRate, largestAnomaly, protection }) {
  const consistency = observedMonths ? Math.round((investedMonths / observedMonths) * 100) : 0;
  const discipline = Math.max(0, Math.min(Math.round((savingsRate / 40) * 100), 100));
  const protectionScore = protection?.termNeeded > 0 ? Math.min(Math.round((protection.termCover / protection.termNeeded) * 100), 100) : null;
  const stats = [
    { label: 'Discipline', score: discipline },
    { label: 'Consistency', score: consistency },
    { label: 'Indulgence', score: largestAnomaly ? Math.min(Math.round(largestAnomaly.deltaPct + 30), 100) : 25 },
    { label: 'Protection', score: protectionScore ?? 0 },
  ];
  const title = consistency >= 80 && discipline >= 60
    ? 'The Disciplined Dreamer'
    : consistency < 50 || discipline < 35 ? 'The Resilient Rebuilder' : 'The Steady Builder';
  const tagline = title === 'The Disciplined Dreamer'
    ? 'consistent investing with room to put idle cash to work'
    : title === 'The Resilient Rebuilder'
      ? 'building stronger habits one practical step at a time'
      : 'growing steadily with a balanced money rhythm';
  return {
    title,
    tagline,
    observedMonths,
    traits: [
      `${investedMonths} of ${observedMonths} observed months included an investment`,
      `Savings rate is ${savingsRate.toFixed(0)}% of observed income`,
      largestAnomaly ? `${largestAnomaly.category} is the largest recent discretionary spike` : 'No material discretionary-spend spike detected',
      protection ? (protection.termGap > 0 ? 'Protection has not kept up with income' : 'Life protection meets the current policy rule') : 'Protection data is not connected yet',
    ],
    stats,
  };
}

// ---- Goal collision: can the surplus fund every dream? -------
export function goalCollision(expectedReturn = returnScenario('Balanced').base) {
  const cf = cashflow();
  const plans = allGoalPlans(expectedReturn);
  const needTotal = plans.reduce((s, g) => s + g.monthly, 0);
  const capacity = cf.surplus + cf.avgInvested;
  const deficit = Math.max(needTotal - capacity, 0);
  // priority-weighted funding proposal within capacity
  const order = ['emergency', 'home', 'retire', 'travel'];
  let remaining = capacity;
  const proposal = order
    .map((id) => plans.find((p) => p.id === id))
    .filter(Boolean)
    .map((g) => {
      const alloc = Math.min(g.monthly, remaining);
      remaining -= alloc;
      return { id: g.id, name: g.name, icon: g.icon, need: g.monthly, alloc, funded: g.monthly ? alloc / g.monthly : 1 };
    });
  return { plans, needTotal, capacity, deficit, proposal };
}

// ---- The "one big insight" for proactive nudging -------------
export function topNudges(riskProfile = 'Balanced') {
  const cf = cashflow();
  const hs = healthScore();
  const anomalies = spendingAnomalies();
  const waste = subscriptionWaste();
  const tg = taxGap();
  const dr = drift(riskProfile);
  const nudges = [];

  if (totalWealth() > 0 && Math.abs(dr.biggestGap.gap) > 10 && !hasAction('sip', 'rebalance'))
    nudges.push({
      id: 'drift',
      icon: 'scale',
      title: `Portfolio ${Math.abs(dr.biggestGap.gap).toFixed(0)}% ${dr.biggestGap.gap > 0 ? 'under' : 'over'} target in ${dr.biggestGap.name.toLowerCase()}`,
      body: `Your mix has drifted from your ${riskProfile} target. Gradual SIP-based rebalancing fixes it without timing risk.`,
      action: 'Rebalance my portfolio',
    });

  if (cf.surplus > 5000)
    nudges.push({
      id: 'surplus',
      icon: 'bulb',
      title: `${fmt(cf.surplus)} idle every month`,
      body: `Policy scenarios use ${POLICY.returns.savings}% for savings and ${returnScenario(riskProfile).base}% for the ${riskProfile.toLowerCase()} base case. That models ${fmtCompact(
        sipFutureValue(cf.surplus, returnScenario(riskProfile).base, 10)
      )} in 10 years vs ${fmtCompact(sipFutureValue(cf.surplus, POLICY.returns.savings, 10))} in savings; market returns are not guaranteed.`,
      action: 'Invest my surplus',
    });

  if (anomalies.length)
    nudges.push({
      id: 'spend',
      icon: 'trendUp',
      title: `${anomalies[0].category} up ${anomalies[0].deltaPct.toFixed(0)}% this month`,
      body: `You spent ${fmt(anomalies[0].amount)} vs your usual ${fmt(anomalies[0].avg3m)}. Redirecting the excess can accelerate ${goals.find((goal) => goal.id === 'travel')?.name || 'your next goal'}.`,
      action: 'Analyse my spending',
    });

  if (tg.available && tg.regimeConfirmed && tg.eligibleRegime && tg.gap > 0)
    nudges.push({
      id: 'tax',
      icon: 'receipt',
      title: `${fmt(tg.gap)} of 80C limit unused`,
      body: `An ELSS SIP of ${fmt(tg.monthlyToFill)}/month fills it and could save ~${fmt(tg.estSaving)} in tax over ${tg.monthsLeft} months.`,
      action: 'Help me save tax',
    });

  if (waste > 0)
    nudges.push({
      id: 'subs',
      icon: 'scissors',
      title: `${fmt(waste)}/month on unused subscriptions`,
      body: `${unusedSubscriptions().length} subscriptions haven't been used in months. That's ${fmt(waste * 12)}/year.`,
      action: 'Show unused subscriptions',
    });

  const pg = protectionGap();
  if (pg.available && pg.termGap > 0)
    nudges.push({
      id: 'protection',
      icon: 'shield',
      title: `Life cover is ${fmtCompact(pg.termGap)} short`,
      body: `You have ${fmtCompact(pg.termCover)} (employer only — it lapses if you switch jobs). ${pg.dependents} people depend on your income. Fixing it costs ~${fmt(pg.totalMonthly)}/month.`,
      action: 'Am I protected?',
    });

  const emergencyTarget = emergencyFundTarget();
  if (emergencyTarget > 0 && hs.emergencyMonths < POLICY.emergency.targetMonths)
    nudges.push({
      id: 'emergency',
      icon: 'shield',
      title: `Emergency fund at ${hs.emergencyMonths.toFixed(1)} of ${POLICY.emergency.targetMonths} months`,
      body: `Park ${fmt(Math.max(emergencyTarget - customer.savingsBalance, 0))} more in a sweep-in FD to be fully covered.`,
      action: 'Fix my emergency fund',
    });

  return nudges;
}
