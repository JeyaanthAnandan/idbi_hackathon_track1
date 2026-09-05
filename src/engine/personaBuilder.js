// ─────────────────────────────────────────────────────────────
// Assembles a full persona object (same shape as data/personas.js's priya /
// arjun) out of whatever a customer actually gave us — an uploaded
// statement or a connected account. Every downstream engine (advisor.js,
// analytics.js) reads specific fields unconditionally (see the two crash
// points guarded below), so gaps are filled with honest, clearly-neutral
// placeholders rather than fabricated numbers.
// ─────────────────────────────────────────────────────────────
import { buildMonthlySummary, buildSpendByCategory, detectSubscriptions, latestTransactionDate, totalIncome } from './statementImport.js';
import { deriveRiskProfile } from './riskDerivation.js';
import { POLICY } from '../data/policy.js';

const FALLBACK_MONTHLY_SUMMARY = [{ month: 'This month', income: 0, spend: 0, invested: 0 }];

function defaultGoals({ monthlyIncome, savingsBalance, age }) {
  const income = monthlyIncome || 30000;
  const emergencyTarget = Math.round(income * 6);
  return [
    { id: 'emergency', name: 'Emergency Fund', icon: 'shield', target: emergencyTarget, saved: Math.min(savingsBalance || 0, emergencyTarget), horizonYears: 1, priority: 'High', estimated: true },
    { id: 'home', name: 'Home Down Payment', icon: 'bank', target: Math.round(income * 30), saved: 0, horizonYears: 6, priority: 'High', estimated: true },
    { id: 'travel', name: 'Dream Vacation', icon: 'plane', target: Math.round(income * 4), saved: 0, horizonYears: 2, priority: 'Medium', estimated: true },
    { id: 'retire', name: 'Retirement @ 60', icon: 'sunset', target: Math.round(income * 12 * 25), saved: 0, horizonYears: Math.max(60 - (age || 30), 5), priority: 'Medium', estimated: true },
  ];
}

// `sources` name which providers/files fed this persona — shown in the UI
// so the customer can see what MITRA actually looked at.
export function buildCustomPersona({ name, age, city, holdings = [], transactions = [], sources = [] }) {
  const monthlySummary = transactions.length ? buildMonthlySummary(transactions) : FALLBACK_MONTHLY_SUMMARY;
  const spendByCategory = transactions.length ? buildSpendByCategory(transactions) : [];
  const subscriptions = transactions.length ? detectSubscriptions(transactions) : [];
  const monthlyIncome = transactions.length ? totalIncome(transactions) : 0;
  const savingsBalance = holdings.find((h) => h.type === 'Savings Account')?.value ?? 0;
  const finalHoldings = holdings;

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
    fundFacts: null,
    loans: [],
    monthlySummary,
    spendByCategory,
    subscriptions,
    goals: defaultGoals({ monthlyIncome, savingsBalance, age }),
    tax: { section80CUsed: 0, section80CLimit: POLICY.tax.section80CLimit, regime: 'Unknown', regimeConfirmed: false, dataAvailable: false },
    insurance: { termCover: 0, healthCover: 0, dependents: 0, dataAvailable: false },
    peers: {
      cohort: 'Self-directed · India',
      percentile: null,
      metrics: [],
    },
    roundupStats: { upiTxnsPerMonth: 0, avgRoundup: 0 },
    dataQuality: {
      transactionMonths: transactions.length ? monthlySummary.length : 0,
      hasHoldings: holdings.length > 0,
      hasTax: false,
      hasInsurance: false,
      confidence: Math.min(0.45 + (transactions.length ? monthlySummary.length : 0) * 0.08 + (holdings.length ? 0.15 : 0), 0.9),
      sources,
      dataAsOf: latestTransactionDate(transactions),
    },
  };

  return { persona, riskProfile, sources };
}
