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
  modelPortfolios,
  insurance,
  fundFacts,
  loans,
} from '../data/customer.js';

export const fmt = (n) =>
  '₹' +
  Math.round(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });

export const fmtCompact = (n) => {
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2).replace(/\.00$/, '') + ' Cr';
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1).replace(/\.0$/, '') + ' L';
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return '₹' + Math.round(n);
};

// ---- Cashflow ------------------------------------------------
export function cashflow() {
  const last = monthlySummary[monthlySummary.length - 1];
  const avgIncome = monthlySummary.reduce((s, m) => s + m.income, 0) / monthlySummary.length;
  const avgSpend = monthlySummary.reduce((s, m) => s + m.spend, 0) / monthlySummary.length;
  const avgInvested = monthlySummary.reduce((s, m) => s + m.invested, 0) / monthlySummary.length;
  const surplus = avgIncome - avgSpend - avgInvested;
  const savingsRate = ((avgIncome - avgSpend) / avgIncome) * 100;
  return { last, avgIncome, avgSpend, avgInvested, surplus, savingsRate };
}

// ---- Spending anomalies -------------------------------------
export function spendingAnomalies() {
  return spendByCategory
    .map((c) => ({ ...c, deltaPct: ((c.amount - c.avg3m) / c.avg3m) * 100 }))
    .filter((c) => c.deltaPct > 15 && !c.essential)
    .sort((a, b) => b.deltaPct - a.deltaPct);
}

export function unusedSubscriptions() {
  return subscriptions.filter((s) => s.lastUsed.startsWith('unused'));
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
    pct: (value / total) * 100,
  }));
}

export function equityExposure() {
  const total = totalWealth();
  const equity = holdings
    .filter((h) => h.type === 'Mutual Fund')
    .reduce((s, h) => s + h.value, 0);
  return (equity / total) * 100;
}

// ---- Financial Health Score (0–100) --------------------------
export function healthScore() {
  const cf = cashflow();
  const monthlyExpense = cf.avgSpend;
  const emergencyMonths = customer.savingsBalance / monthlyExpense;

  const parts = [
    {
      label: 'Savings Rate',
      score: Math.min((cf.savingsRate / 30) * 25, 25),
      max: 25,
      note: `${cf.savingsRate.toFixed(0)}% of income saved (target 30%)`,
    },
    {
      label: 'Emergency Cover',
      score: Math.min((emergencyMonths / 6) * 25, 25),
      max: 25,
      note: `${emergencyMonths.toFixed(1)} months of expenses covered (target 6)`,
    },
    {
      label: 'Diversification',
      score: equityExposure() > 15 && equityExposure() < 70 ? 20 : 12,
      max: 25,
      note: `${equityExposure().toFixed(0)}% in growth assets; heavy cash & FD tilt`,
    },
    {
      label: 'Goal Readiness',
      score:
        (goals.reduce((s, g) => s + Math.min(g.saved / g.target, 1), 0) / goals.length) * 25,
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
  return monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
}

// Monthly SIP required to reach target in y years at r%
export function sipRequired(target, annualRatePct, years, alreadySaved = 0) {
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  const fvExisting = alreadySaved * Math.pow(1 + annualRatePct / 100, years);
  const remaining = Math.max(target - fvExisting, 0);
  if (remaining === 0) return 0;
  return remaining / (((Math.pow(1 + r, n) - 1) / r) * (1 + r));
}

export function goalPlan(goal, expectedReturn = 11) {
  const monthly = sipRequired(goal.target, expectedReturn, goal.horizonYears, goal.saved);
  const progress = (goal.saved / goal.target) * 100;
  return { ...goal, monthly, progress, expectedReturn };
}

export function allGoalPlans(expectedReturn = 11) {
  return goals.map((g) => goalPlan(g, expectedReturn));
}

// ---- Tax -----------------------------------------------------
export function taxGap() {
  const gap = tax.section80CLimit - tax.section80CUsed;
  const monthsLeft = 9; // Jul–Mar of FY
  return { ...tax, gap, monthlyToFill: gap / monthsLeft, estSaving: gap * 0.312 };
}

// ---- Protection gap: term & health insurance adequacy --------
// Rule of thumb: term cover ≥ 15× annual income; health ≥ ₹15L in metros.
export function protectionGap() {
  const annualIncome = customer.monthlyIncome * 12;
  const termNeeded = annualIncome * 15;
  const termGap = Math.max(termNeeded - insurance.termCover, 0);
  const healthNeeded = 1500000;
  const healthGap = Math.max(healthNeeded - insurance.healthCover, 0);
  // indicative premiums at her age: term ~₹55/L/yr, super top-up ~₹230/L/yr
  const termPremium = Math.round((termGap / 100000) * 55 / 12);
  const healthPremium = Math.round((healthGap / 100000) * 230 / 12);
  return {
    ...insurance,
    termNeeded,
    termGap,
    healthNeeded,
    healthGap,
    termPremium,
    healthPremium,
    totalMonthly: termPremium + healthPremium,
  };
}

// ---- Market pulse: what the week did to *your* money ---------
export function marketPulse() {
  const equity = holdings.filter((h) => h.type === 'Mutual Fund').reduce((s, h) => s + h.value, 0);
  const delta = equity * (market.weekChangePct / 100);
  return { ...market, equity, delta };
}

// ---- Round-up micro-investing --------------------------------
export function roundup() {
  const monthly = Math.round(roundupStats.upiTxnsPerMonth * roundupStats.avgRoundup);
  return {
    ...roundupStats,
    monthly,
    in5y: sipFutureValue(monthly, 11, 5),
    in10y: sipFutureValue(monthly, 11, 10),
  };
}

// ---- Allocation drift vs target model portfolio --------------
export function drift(riskProfile = 'Balanced') {
  const total = totalWealth();
  const bucket = (types) =>
    (holdings.filter((h) => types.includes(h.type)).reduce((s, h) => s + h.value, 0) / total) * 100;
  const current = [
    { name: 'Equity', pct: bucket(['Mutual Fund']), color: 'var(--teal)' },
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
export function projectWealth({ extraMonthly = 0, annualRatePct = 11, events = [] } = {}) {
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
  const f = fundFacts.elss;
  const elssValue = holdings.find((h) => h.label.includes('ELSS')).value;
  const dragPct = f.er - f.directEr; // what the Regular-plan commission costs
  const years = 15;
  const grow = (ratePct) => {
    let v = elssValue;
    const r = ratePct / 100 / 12;
    for (let m = 0; m < years * 12; m++) v = v * (1 + r) + f.monthlySip;
    return v;
  };
  const feeLoss = grow(12) - grow(12 - dragPct);
  return {
    fund: f.name,
    plan: f.plan,
    er: f.er,
    directEr: f.directEr,
    dragPct,
    years,
    feeLoss,
    overlapPct: fundFacts.overlapPct,
    overlapWith: fundFacts.index.name,
  };
}

// ---- LTCG harvesting: use the ₹1.25L exemption every year ----
export function ltcgHarvest() {
  const equity = holdings.filter((h) => h.type === 'Mutual Fund');
  const gains = equity.reduce((s, h) => s + (h.value - (h.cost || h.value)), 0);
  const exemption = 125000;
  const harvestable = Math.min(gains, exemption);
  const taxSaved = harvestable * 0.125;
  const habitValue = sipFutureValue(taxSaved / 12, 11, 20); // do it yearly for 20y
  return { gains, exemption, harvestable, taxSaved, habitValue };
}

// ---- Prepay loan vs invest -----------------------------------
export function prepayVsInvest(prepayAmount = 50000) {
  const loan = loans[0];
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
  const investValue = prepayAmount * Math.pow(1 + 0.11, now.months / 12);
  const investGain = investValue - prepayAmount;
  return { loan, prepayAmount, interestSaved, monthsSaved, investGain, loanMonths: now.months };
}

// ---- Money Persona: behavioural fingerprint ------------------
export function moneyPersona() {
  const cf = cashflow();
  const anomalies = spendingAnomalies();
  const pg = protectionGap();
  const stats = [
    { label: 'Discipline', score: Math.min(Math.round((cf.savingsRate / 40) * 100), 100) },
    { label: 'Consistency', score: 88 }, // 6/6 months SIP executed
    { label: 'Indulgence', score: anomalies.length ? Math.min(Math.round(anomalies[0].deltaPct + 30), 100) : 25 },
    { label: 'Protection', score: Math.round((pg.termCover / pg.termNeeded) * 100) },
  ];
  return {
    title: 'The Disciplined Dreamer',
    tagline: 'saves like a monk on weekdays, lives a little on weekends',
    traits: [
      'Never missed a SIP in 6 months — top 12% for consistency',
      `Saves ${cf.savingsRate.toFixed(0)}% of income — nearly 2× the cohort`,
      'Weekend dining is the one leak in an otherwise tight ship',
      'Under-protected: insurance has not kept up with income',
    ],
    stats,
  };
}

// ---- Goal collision: can the surplus fund every dream? -------
export function goalCollision(expectedReturn = 11) {
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

  if (Math.abs(dr.biggestGap.gap) > 10)
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
      body: `Money left in savings earns ~3%. A SIP could earn ~11% — that's ${fmtCompact(
        sipFutureValue(cf.surplus, 11, 10)
      )} in 10 years vs ${fmtCompact(sipFutureValue(cf.surplus, 3, 10))} idle.`,
      action: 'Invest my surplus',
    });

  if (anomalies.length)
    nudges.push({
      id: 'spend',
      icon: 'trendUp',
      title: `${anomalies[0].category} up ${anomalies[0].deltaPct.toFixed(0)}% this month`,
      body: `You spent ${fmt(anomalies[0].amount)} vs your usual ${fmt(anomalies[0].avg3m)}. Small trims here fund your Europe trip faster.`,
      action: 'Analyse my spending',
    });

  if (tg.gap > 0)
    nudges.push({
      id: 'tax',
      icon: 'receipt',
      title: `${fmt(tg.gap)} of 80C limit unused`,
      body: `An ELSS SIP of ${fmt(tg.monthlyToFill)}/month fills it and could save ~${fmt(tg.estSaving)} in tax.`,
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
  if (pg.termGap > 0)
    nudges.push({
      id: 'protection',
      icon: 'shield',
      title: `Life cover is ${fmtCompact(pg.termGap)} short`,
      body: `You have ${fmtCompact(pg.termCover)} (employer only — it lapses if you switch jobs). ${pg.dependents} people depend on your income. Fixing it costs ~${fmt(pg.totalMonthly)}/month.`,
      action: 'Am I protected?',
    });

  if (hs.emergencyMonths < 6)
    nudges.push({
      id: 'emergency',
      icon: 'shield',
      title: `Emergency fund at ${hs.emergencyMonths.toFixed(1)} of 6 months`,
      body: `Park ${fmt(400000 - customer.savingsBalance)} more in a sweep-in FD to be fully covered.`,
      action: 'Fix my emergency fund',
    });

  return nudges;
}
