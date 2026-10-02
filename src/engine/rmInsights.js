// ─────────────────────────────────────────────────────────────
// RM-side analytics — the same policy rules as engine/analytics.js, but
// as pure functions of a persona object instead of the one active
// customer. The customer app only ever looks at one person; a
// relationship manager looks across a whole book, so every figure here
// takes the persona as an argument.
//
// The formulas deliberately mirror analytics.js line for line (health
// score, surplus, 80C gap, protection gap, drift). test/rm-console.test.js
// checks that both give the same numbers for the demo customers, so the
// banker and the customer can never be shown different facts.
// ─────────────────────────────────────────────────────────────
import {
  POLICY, healthCoverTarget, insurancePremiumRates,
  monthsRemainingInFinancialYear, returnScenario,
} from '../data/policy.js';

const EQUITY = ['Mutual Fund', 'Stocks'];

const TARGETS = {
  Conservative: { Equity: 20, 'Debt / FD': 50, Gold: 15, Cash: 15 },
  Balanced: { Equity: 55, 'Debt / FD': 30, Gold: 10, Cash: 5 },
  Aggressive: { Equity: 70, 'Debt / FD': 15, Gold: 5, Cash: 10 },
};

const sum = (rows, pick) => rows.reduce((s, r) => s + Number(pick(r) || 0), 0);

export function sipRequired(target, annualRatePct, years, alreadySaved = 0) {
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  const fvExisting = alreadySaved * Math.pow(1 + annualRatePct / 100, years);
  const remaining = Math.max(target - fvExisting, 0);
  if (remaining === 0) return 0;
  if (r === 0) return n > 0 ? remaining / n : 0;
  return remaining / (((Math.pow(1 + r, n) - 1) / r) * (1 + r));
}

export function bookCashflow(p) {
  const rows = p.monthlySummary.length ? p.monthlySummary : [{ income: 0, spend: 0, invested: 0 }];
  const avgIncome = sum(rows, (m) => m.income) / rows.length;
  const avgSpend = sum(rows, (m) => m.spend) / rows.length;
  const avgInvested = sum(rows, (m) => m.invested) / rows.length;
  const incomeKnown = p.dataQuality?.incomeAvailable !== false;
  const surplus = incomeKnown ? avgIncome - avgSpend - avgInvested : 0;
  const savingsRate = incomeKnown && avgIncome > 0 ? ((avgIncome - avgSpend) / avgIncome) * 100 : 0;
  // Coefficient of variation of monthly income — how irregular the inflow is.
  const mean = avgIncome || 1;
  const incomeVolatility = Math.sqrt(sum(rows, (m) => (Number(m.income || 0) - avgIncome) ** 2) / rows.length) / mean * 100;
  return { avgIncome, avgSpend, avgInvested, surplus, savingsRate, incomeKnown, incomeVolatility };
}

export const bookWealth = (p) => sum(p.holdings, (h) => h.value);

function equityExposure(p) {
  const total = bookWealth(p);
  return total > 0 ? (sum(p.holdings.filter((h) => EQUITY.includes(h.type)), (h) => h.value) / total) * 100 : 0;
}

export function bookHealthScore(p) {
  const cf = bookCashflow(p);
  const savings = p.customer.savingsBalance;
  const emergencyMonths = cf.avgSpend > 0 ? savings / cf.avgSpend : (savings > 0 ? 99 : 0);
  const eq = equityExposure(p);
  const parts = [
    { label: 'Savings Rate', score: Math.max(0, Math.min((cf.savingsRate / 30) * 25, 25)), max: 25 },
    { label: 'Emergency Cover', score: Math.min((emergencyMonths / POLICY.emergency.targetMonths) * 25, 25), max: 25 },
    { label: 'Diversification', score: eq > 15 && eq < 70 ? 20 : 12, max: 25 },
    {
      label: 'Goal Readiness',
      score: p.goals.length ? (p.goals.reduce((s, g) => s + Math.min(g.target > 0 ? g.saved / g.target : 0, 1), 0) / p.goals.length) * 25 : 0,
      max: 25,
    },
  ];
  const total = Math.round(parts.reduce((s, x) => s + x.score, 0));
  const grade = total >= 75 ? 'Excellent' : total >= 55 ? 'Good' : total >= 35 ? 'Fair' : 'Needs Work';
  return { total, grade, parts, emergencyMonths };
}

export function bookTaxGap(p) {
  const t = p.tax || {};
  if (t.dataAvailable === false || !t.regimeConfirmed || !POLICY.tax.section80CEligibleRegimes.includes(t.regime)) return { available: false, gap: 0 };
  const limit = Number(t.section80CLimit || POLICY.tax.section80CLimit);
  const gap = Math.max(limit - Number(t.section80CUsed || 0), 0);
  const monthsLeft = monthsRemainingInFinancialYear(POLICY.asOf);
  const rate = Number(t.marginalRate || POLICY.tax.fallbackMarginalRate);
  return { available: true, gap, monthlyToFill: monthsLeft > 0 ? gap / monthsLeft : gap, estSaving: gap * rate, monthsLeft };
}

export function bookProtectionGap(p) {
  const ins = p.insurance || {};
  if (ins.dataAvailable === false) return { available: false, termGap: 0, healthGap: 0, monthly: 0 };
  const termNeeded = p.customer.monthlyIncome * 12 * POLICY.insurance.termIncomeMultiple;
  const healthNeeded = healthCoverTarget(p.customer.city);
  const termGap = Math.max(termNeeded - Number(ins.termCover || 0), 0);
  const healthGap = Math.max(healthNeeded - Number(ins.healthCover || 0), 0);
  const rates = insurancePremiumRates(p.customer.age);
  const monthly = Math.round((termGap / 100000) * rates.termAnnual / 12) + Math.round((healthGap / 100000) * rates.healthAnnual / 12);
  return { available: true, termCover: Number(ins.termCover || 0), healthCover: Number(ins.healthCover || 0), termNeeded, healthNeeded, termGap, healthGap, monthly, dependents: ins.dependents };
}

export function bookDrift(p, riskProfile) {
  const total = bookWealth(p);
  const bucket = (types) => (total > 0 ? (sum(p.holdings.filter((h) => types.includes(h.type)), (h) => h.value) / total) * 100 : 0);
  const current = { Equity: bucket(EQUITY), 'Debt / FD': bucket(['Fixed Deposit']), Gold: bucket(['Gold']), Cash: bucket(['Savings Account']) };
  const target = TARGETS[riskProfile] || TARGETS.Balanced;
  const rows = Object.keys(target).map((name) => ({ name, current: current[name], target: target[name], gap: target[name] - current[name] }));
  const biggest = rows.slice().sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0];
  return { rows, biggest };
}

export function bookGoals(p, riskProfile) {
  const rate = returnScenario(riskProfile).base;
  return p.goals.map((g) => ({
    ...g,
    progress: g.target > 0 ? (g.saved / g.target) * 100 : 0,
    monthly: sipRequired(g.target, rate, g.horizonYears, g.saved),
  }));
}

function regularPlanDrag(p) {
  const f = p.fundFacts?.elss;
  if (!f || f.plan !== 'Regular') return null;
  return { fund: f.name, er: f.er, directEr: f.directEr, dragPct: +(f.er - f.directEr).toFixed(2) };
}

// Everything an RM needs about one customer, computed in one pass.
export function customerInsights(p, riskProfile = p.riskProfile || 'Balanced') {
  const cf = bookCashflow(p);
  const hs = bookHealthScore(p);
  const tg = bookTaxGap(p);
  const pg = bookProtectionGap(p);
  const dr = bookDrift(p, riskProfile);
  const goals = bookGoals(p, riskProfile);
  const aum = bookWealth(p);
  const drag = regularPlanDrag(p);
  const unusedSubs = (p.subscriptions || []).filter((s) => String(s.lastUsed || '').startsWith('unused'));
  const emi = sum(p.loans || [], (l) => l.emi);
  const emiRatio = cf.avgIncome > 0 ? (emi / cf.avgIncome) * 100 : 0;
  const goalNeed = sum(goals, (g) => g.monthly);
  const capacity = Math.max(cf.surplus + cf.avgInvested, 0);

  // ── Opportunities: suitability-first, each tied to the rule that found it ──
  const opportunities = [];
  // Term cover replaces income for dependents; it is not suitable for a
  // customer with no dependents or past working age.
  const termSuitable = (pg.dependents || 0) > 0 && p.customer.age < 60;
  if (pg.available && pg.termGap > 0 && termSuitable) opportunities.push({
    id: 'term', product: 'Term life cover', rule: `${POLICY.insurance.termIncomeMultiple}× annual income`, value: pg.termGap,
    detail: `Cover ${fmtL(pg.termCover)} vs ${fmtL(pg.termNeeded)} needed · ${pg.dependents ?? 0} dependents`, monthly: pg.monthly, priority: 2,
  });
  if (hs.emergencyMonths < POLICY.emergency.targetMonths && cf.avgSpend > 0) opportunities.push({
    id: 'emergency', product: 'Sweep-in FD (emergency reserve)', rule: `${POLICY.emergency.targetMonths} months of expenses`,
    value: Math.max(Math.round(cf.avgSpend * POLICY.emergency.targetMonths) - p.customer.savingsBalance, 0),
    detail: `${hs.emergencyMonths.toFixed(1)} of ${POLICY.emergency.targetMonths} months covered`, priority: 1,
  });
  if (tg.available && tg.gap > 0) opportunities.push({
    id: 'elss', product: 'ELSS SIP (80C)', rule: `Sec 80C · ${fmtL(POLICY.tax.section80CLimit)} limit`, value: tg.gap,
    detail: `${fmtR(tg.monthlyToFill)}/mo for ${tg.monthsLeft} months · saves ~${fmtR(tg.estSaving)} tax`, priority: 3,
  });
  if (cf.surplus > 5000) opportunities.push({
    id: 'sip', product: `Model-portfolio SIP (${riskProfile})`, rule: 'Idle surplus > ₹5,000/mo', value: Math.round(cf.surplus) * 12,
    detail: `${fmtR(cf.surplus)}/mo stays in savings after spends and SIPs`, priority: 4,
  });
  if (drag) opportunities.push({
    id: 'direct', product: 'Regular → Direct plan review', rule: 'Expense-ratio drag', value: 0,
    detail: `${drag.fund}: ${drag.er}% vs ${drag.directEr}% direct (${drag.dragPct}% / yr)`, priority: 5,
  });

  opportunities.sort((a, b) => a.priority - b.priority);

  // ── Risk & compliance flags ──
  const flags = [];
  if (hs.emergencyMonths < 1) flags.push({ level: 'high', code: 'LIQUIDITY', text: `Under 1 month of expenses in savings (${hs.emergencyMonths.toFixed(1)})` });
  if (emiRatio > 35) flags.push({ level: 'high', code: 'DEBT', text: `EMI is ${emiRatio.toFixed(0)}% of income (policy ceiling 35%)` });
  else if (emiRatio > 20) flags.push({ level: 'medium', code: 'DEBT', text: `EMI is ${emiRatio.toFixed(0)}% of income` });
  if (cf.incomeVolatility > 12) flags.push({ level: 'medium', code: 'INCOME', text: `Irregular income (±${cf.incomeVolatility.toFixed(0)}% month to month)` });
  if (pg.available && pg.termGap > 0 && (pg.dependents || 0) >= 2) flags.push({ level: 'medium', code: 'PROTECTION', text: `${pg.dependents} dependents, life cover ${fmtL(pg.termGap)} short` });
  if (Math.abs(dr.biggest.gap) > 20) flags.push({ level: 'medium', code: 'SUITABILITY', text: `${dr.biggest.name} ${Math.abs(dr.biggest.gap).toFixed(0)}% ${dr.biggest.gap > 0 ? 'below' : 'above'} ${riskProfile} target` });
  if (p.customer.kycRisk === 'Medium' || p.customer.kycRisk === 'High') flags.push({ level: p.customer.kycRisk === 'High' ? 'high' : 'low', code: 'KYC', text: `KYC risk ${p.customer.kycRisk} · periodic re-KYC review` });
  if (p.customer.age >= 60) flags.push({ level: 'low', code: 'SENIOR', text: 'Senior citizen · enhanced suitability checks apply' });
  if (goalNeed > capacity * 1.25 && goals.length) flags.push({ level: 'low', code: 'GOALS', text: `Goals need ${fmtR(goalNeed)}/mo vs ${fmtR(capacity)} capacity` });

  // Priority score for sorting the book — attention needed, not revenue.
  const priority = Math.round(
    flags.reduce((s, f) => s + ({ high: 30, medium: 14, low: 5 }[f.level]), 0)
    + Math.max(0, 60 - hs.total) * 0.6
    + Math.min(opportunities.length * 4, 16),
  );

  return {
    aum, cf, hs, tg, pg, dr, goals, drag, unusedSubs, emi, emiRatio, goalNeed, capacity,
    opportunities, flags, priority, riskProfile,
    pipeline: sum(opportunities, (o) => o.value),
  };
}

function fmtR(n) { return '₹' + Math.round(n).toLocaleString('en-IN'); }
function fmtL(n) {
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2).replace(/\.00$/, '') + '\u00a0Cr';
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1).replace(/\.0$/, '') + '\u00a0L';
  return fmtR(n);
}

// The order MITRA follows for every customer — cash buffer, then
// protection, then tax, then invest — turned into the three things an RM should say
// first. Each point is built from the same insight figures above.
export function talkingPoints(p, ins = customerInsights(p)) {
  const points = [];
  const reserveGap = Math.max(Math.round(ins.cf.avgSpend * POLICY.emergency.targetMonths) - p.customer.savingsBalance, 0);
  if (ins.hs.emergencyMonths < POLICY.emergency.targetMonths && reserveGap >= 10000) {
    points.push({ title: 'Liquidity first.', text: `${ins.hs.emergencyMonths.toFixed(1)} of ${POLICY.emergency.targetMonths} months covered. A sweep-in FD closes the ${fmtL(reserveGap)} reserve gap and keeps earning.` });
  }
  const termOpp = ins.opportunities.find((o) => o.id === 'term');
  if (termOpp) points.push({ title: 'Protection next.', text: `Life cover ${fmtL(ins.pg.termGap)} short with ${ins.pg.dependents} dependent${ins.pg.dependents === 1 ? '' : 's'}.` });
  if (ins.emiRatio > 35) points.push({ title: 'Debt load.', text: `EMI is ${ins.emiRatio.toFixed(0)}% of income, above the 35% ceiling. No new commitments until it eases.` });
  else if (p.loans?.length && (points.length || ins.hs.emergencyMonths < 3)) {
    const loan = p.loans[0];
    points.push({ title: 'Prepay only after that.', text: `The ${loan.rate}% ${loan.name.toLowerCase()} costs more than safe returns, but prepaying now would drain the buffer.` });
  }
  if (ins.tg.available && ins.tg.gap > 0) points.push({ title: 'Tax.', text: `${fmtL(ins.tg.gap)} of 80C unused, about ${fmtR(ins.tg.estSaving)} saving if filled by March.` });
  if (ins.cf.surplus > 5000) {
    const profile = ins.riskProfile.toLowerCase();
    const article = /^[aeiou]/.test(profile) ? 'An' : 'A';
    points.push({ title: 'Invest the surplus.', text: `${fmtR(ins.cf.surplus)}/mo idle. ${article} ${profile} model-portfolio SIP${points.length ? ' once the steps above are settled' : ''}.` });
  }
  if (ins.drag) points.push({ title: 'Fees.', text: `${ins.drag.fund} costs ${ins.drag.dragPct}% a year more than its Direct plan.` });
  return points.slice(0, 4);
}
