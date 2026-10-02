// ─────────────────────────────────────────────────────────────
// Customer fact sheet — everything the deterministic engine knows about the
// active customer, rendered as short labelled lines with every figure
// already computed and formatted.
//
// The AI composer (engine/composer.js) writes MITRA's reply from this sheet
// and nothing else. Because the sheet carries the finished numbers, the
// model never has to do arithmetic, and the composer can reject any reply
// that quotes a figure the sheet does not contain.
// ─────────────────────────────────────────────────────────────
import {
  customer, holdings, loans, liabilities, goals, dataQuality, subscriptions, modelPortfolios, totalWealth,
} from '../data/customer.js';
import {
  fmt, fmtCompact, cashflow, healthScore, emergencyFundTarget, allocation, equityExposure, spendingAnomalies,
  subscriptionWaste, unusedSubscriptions, taxGap, protectionGap, drift, allGoalPlans, goalCollision, xray,
} from './analytics.js';
import { POLICY, returnScenario } from '../data/policy.js';

const pct = (n) => `${Math.round(n)}%`;
const safe = (fn) => { try { return fn(); } catch { return null; } };

export function buildFactSheet(riskProfile = 'Balanced') {
  const lines = [];
  const add = (label, value) => { if (value !== null && value !== undefined && value !== '') lines.push(`${label}: ${value}`); };
  const scenario = returnScenario(riskProfile);

  add('Customer', `${customer.name}, age ${customer.age}, ${customer.segment || 'segment unknown'}, ${customer.city || 'city unknown'}`);
  add('Risk profile', `${riskProfile} (policy return scenarios ${scenario.bear}% bear / ${scenario.base}% base / ${scenario.bull}% bull a year, not guaranteed)`);
  add('Data', `${dataQuality.transactionMonths || 0} months of transactions; data as of ${dataQuality.dataAsOf || 'demo fixture'}; sources ${(dataQuality.sources || []).join(', ') || 'demo'}`);

  const cf = safe(cashflow);
  if (cf?.incomeKnown) {
    add('Average monthly income', fmt(cf.avgIncome));
    add('Average monthly spend', fmt(cf.avgSpend));
    add('Already invested each month (SIPs)', fmt(cf.avgInvested));
    add('Average monthly surplus left idle', fmt(cf.surplus));
    add('Savings rate', pct(cf.savingsRate));
  } else add('Income', 'not confirmed from the connected data, so surplus is unknown');

  const hs = safe(healthScore);
  if (hs) add('Financial health score', `${hs.total}/100 (${hs.grade}); ${hs.parts.map((p) => `${p.label} ${Math.round(p.score)}/${p.max} — ${p.note}`).join('; ')}`);

  add('Savings balance', fmt(customer.savingsBalance || 0));
  const target = safe(emergencyFundTarget);
  if (hs && target) add('Emergency fund', `covers ${hs.emergencyMonths.toFixed(1)} months of spend; policy target ${POLICY.emergency.targetMonths} months = ${fmt(target)}; gap ${fmt(Math.max(target - (customer.savingsBalance || 0), 0))}`);

  const wealth = totalWealth();
  add('Total holdings', `${fmt(wealth)} (${fmtCompact(wealth)})`);
  holdings.forEach((h) => add(' - Holding', `${h.label} (${h.type}) ${fmt(h.value)}${h.growth ? `, ${h.growth}% return` : ''}${h.liquid === false ? ', not liquid' : ''}`));
  const alloc = safe(allocation);
  if (alloc?.length) add('Allocation', alloc.map((a) => `${a.type} ${pct(a.pct)}`).join(', '));
  add('Growth-asset (equity) share', pct(safe(equityExposure) || 0));
  const dr = safe(() => drift(riskProfile));
  if (dr && modelPortfolios[riskProfile]) {
    add(`Target mix for ${riskProfile}`, dr.target.map((t) => `${t.name} ${pct(t.pct)}`).join(', '));
    add('Largest allocation gap', `${dr.biggestGap.name} ${dr.biggestGap.gap > 0 ? 'under' : 'over'} target by ${pct(Math.abs(dr.biggestGap.gap))}`);
  }

  const anomalies = safe(spendingAnomalies) || [];
  anomalies.slice(0, 3).forEach((a) => add(' - Spending spike', `${a.category} ${fmt(a.amount)} this month vs ${fmt(a.avg3m)} 3-month average (+${pct(a.deltaPct)})`));
  const waste = safe(subscriptionWaste) || 0;
  if (waste > 0) add('Unused subscriptions', `${(safe(unusedSubscriptions) || []).map((s) => s.name).join(', ')} — ${fmt(waste)}/month`);
  else if (subscriptions?.length) add('Subscriptions', 'none flagged as unused');

  const tg = safe(taxGap);
  if (tg?.available) {
    if (tg.eligibleRegime) add('Section 80C', `${tg.regime} regime; used ${fmt(tg.section80CUsed)} of ${fmt(tg.section80CLimit)}; headroom ${fmt(tg.gap)}${tg.estSaving ? `; estimated tax saving ${fmt(tg.estSaving)}` : ''}; ${tg.monthsLeft} months left in the financial year (${fmt(tg.monthlyToFill)}/month to fill)`);
    else add('Section 80C', `files under the ${tg.regime || 'unknown'} regime, where 80C deductions do not apply`);
  }

  const pg = safe(protectionGap);
  if (pg?.available) {
    add('Life (term) cover', `${fmtCompact(pg.termCover)}; need ${fmtCompact(pg.termNeeded)} (${POLICY.insurance.termIncomeMultiple}× annual income); gap ${fmtCompact(pg.termGap)}`);
    add('Health cover', `${fmtCompact(pg.healthCover)}; city target ${fmtCompact(pg.healthNeeded)}; gap ${fmtCompact(pg.healthGap)}`);
    if (pg.totalMonthly) add('Estimated premium to close both gaps', `${fmt(pg.totalMonthly)}/month (indicative)`);
    if (Number.isFinite(pg.dependents)) add('Dependents', pg.dependents);
  }

  (loans || []).forEach((l) => add(' - Loan', `${l.name} ${fmt(l.balance)} at ${l.rate}%, EMI ${fmt(l.emi)}, ${l.monthsLeft} months left`));
  if (liabilities?.overdue) add('Overdue with the bank', fmt(liabilities.overdue));

  const plans = safe(() => allGoalPlans(scenario.base)) || [];
  plans.forEach((g) => add(' - Goal', `${g.name}: target ${fmt(g.target)} in ${g.horizonYears} years, saved ${fmt(g.saved)} (${pct(g.progress)}), needs ${fmt(g.monthly)}/month at ${g.expectedReturn}%`));
  const gc = safe(() => goalCollision(scenario.base));
  if (gc && plans.length > 1) add('All goals together', `need ${fmt(gc.needTotal)}/month vs capacity ${fmt(gc.capacity)}/month${gc.deficit > 0 ? `; shortfall ${fmt(gc.deficit)}/month` : '; affordable'}`);

  const xr = safe(xray);
  if (xr?.available && !xr.switched) add('Fund costs', `${xr.fund} is a ${xr.plan} plan at ${xr.er}% vs ${xr.directEr}% for Direct; over ${xr.years} years the difference is about ${fmtCompact(xr.feeLoss)}; ${xr.overlapPct}% overlap with ${xr.overlapWith}`);

  add('Policy constants', `savings account ~${POLICY.returns.savings}%, fixed deposit ~${POLICY.returns.fixedDeposit}%, LTCG exemption ${fmt(POLICY.tax.ltcgEquityExemption)}`);
  // Long-standing Indian rules the advisor may quote in general explanations.
  add('General rules (old tax regime unless stated)', 'Section 80C limit ₹1,50,000; NPS extra deduction under 80CCD(1B) up to ₹50,000; NPS normal exit at age 60; PPF lock-in 15 years; ELSS lock-in 3 years; Section 80D health premium deduction up to ₹25,000 (₹50,000 for senior citizens)');
  return lines.join('\n');
}

// Every number a reply may quote: the sheet, the customer's own message,
// recent turns, and any deterministic engine answer shown alongside.
export function numbersIn(text) {
  return (String(text || '').match(/\d[\d,]*(?:\.\d+)?/g) || [])
    .map((raw) => Number(raw.replace(/,/g, '')))
    .filter(Number.isFinite);
}
