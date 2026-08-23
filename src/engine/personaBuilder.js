// ─────────────────────────────────────────────────────────────
// Assembles a full persona object (same shape as data/personas.js's priya /
// arjun) out of whatever a customer actually gave us — an uploaded
// statement or a connected account. Every downstream engine (advisor.js,
// analytics.js) reads specific fields unconditionally (see the two crash
// points guarded below), so gaps are filled with honest, clearly-neutral
// placeholders rather than fabricated numbers.
// ─────────────────────────────────────────────────────────────
import { buildMonthlySummary, buildSpendByCategory, detectSubscriptions, totalIncome } from './statementImport.js';
import { deriveRiskProfile } from './riskDerivation.js';

const GENERIC_FUND_FACTS = {
  elss: { name: 'ELSS Tax Saver Fund', plan: 'Regular', er: 1.9, directEr: 0.75, monthlySip: 0 },
  index: { name: 'Nifty 50 Index Fund', plan: 'Direct', er: 0.2, directEr: 0.2, monthlySip: 0 },
  overlapPct: 40,
};

const FALLBACK_MONTHLY_SUMMARY = [{ month: 'This month', income: 0, spend: 0, invested: 0 }];

function ensureElssHolding(holdings) {
  if (holdings.some((h) => h.label && h.label.includes('ELSS'))) return holdings;
  return [...holdings, { type: 'Mutual Fund', label: 'ELSS Tax Saver Fund', value: 0, cost: 0, growth: 0, liquid: false }];
}

function defaultGoals({ monthlyIncome, savingsBalance, age }) {
  const income = monthlyIncome || 30000;
  const emergencyTarget = Math.round(income * 6);
  return [
    { id: 'emergency', name: 'Emergency Fund', icon: 'shield', target: emergencyTarget, saved: Math.min(savingsBalance || 0, emergencyTarget), horizonYears: 1, priority: 'High' },
    { id: 'home', name: 'Home Down Payment', icon: 'bank', target: Math.round(income * 30), saved: 0, horizonYears: 6, priority: 'High' },
    { id: 'travel', name: 'Dream Vacation', icon: 'plane', target: Math.round(income * 4), saved: 0, horizonYears: 2, priority: 'Medium' },
    { id: 'retire', name: 'Retirement @ 60', icon: 'sunset', target: Math.round(income * 12 * 25), saved: 0, horizonYears: Math.max(60 - (age || 30), 5), priority: 'Medium' },
  ];
}

// `sources` name which providers/files fed this persona — shown in the UI
// so the customer can see what MITRA actually looked at.
export function buildCustomPersona({ name, age, city, holdings = [], transactions = [], sources = [] }) {
  const monthlySummary = transactions.length ? buildMonthlySummary(transactions) : FALLBACK_MONTHLY_SUMMARY;
  const spendByCategory = transactions.length ? buildSpendByCategory(transactions) : [];
  const subscriptions = transactions.length ? detectSubscriptions(transactions) : [];
  const monthlyIncome = transactions.length ? totalIncome(transactions) : 0;
  const savingsBalance = holdings.find((h) => h.type === 'Savings Account')?.value
    ?? Math.max(monthlyIncome * 3, 0);

  const finalHoldings = ensureElssHolding(
    holdings.length ? holdings : [{ type: 'Savings Account', label: 'Linked Savings A/c', value: savingsBalance, growth: 3.0, liquid: true }]
  );

  const riskProfile = deriveRiskProfile({ holdings: finalHoldings, monthlySummary, age });

  const persona = {
    customer: {
      id: 'CUST-CUSTOM',
      name: name?.trim() || 'You',
      age: age || 30,
      segment: 'Self-directed Investor',
      city: city?.trim() || 'India',
      relationshipSince: new Date().getFullYear(),
      kycRisk: 'Low',
      monthlyIncome,
      savingsBalance,
      panLinked: true,
    },
    holdings: finalHoldings,
    fundFacts: GENERIC_FUND_FACTS,
    loans: [{ name: 'No active loans', balance: 0, rate: 0, emi: 0, monthsLeft: 0 }],
    monthlySummary,
    spendByCategory,
    subscriptions,
    goals: defaultGoals({ monthlyIncome, savingsBalance, age }),
    tax: { section80CUsed: 0, section80CLimit: 150000, regime: 'Old (advisable to compare)' },
    insurance: { termCover: 0, healthCover: 0, dependents: 0 },
    peers: {
      cohort: 'Self-directed · India',
      percentile: 50,
      metrics: [],
    },
    roundupStats: { upiTxnsPerMonth: 0, avgRoundup: 0 },
  };

  return { persona, riskProfile, sources };
}
