// ─────────────────────────────────────────────────────────────
// Active customer data — thin loader over data/personas.js.
// Re-exports the same names every other file already imports, so the
// entire analytics/advisor/UI layer stays persona-agnostic: switching the
// active persona (Settings → "Switch demo customer") changes every number
// in the app without touching another file.
// ─────────────────────────────────────────────────────────────
import { PERSONAS, PERSONA_LIST, getActivePersonaId, switchPersona } from './personas.js';
import { getBootstrap } from '../engine/api.js';
import { returnScenario } from './policy.js';

const persona = getBootstrap().profile?.persona || PERSONAS[getActivePersonaId()];

export const customer = persona.customer;
export const holdings = persona.holdings;
export const fundFacts = persona.fundFacts;
export const loans = persona.loans;
export const monthlySummary = persona.monthlySummary;
export const spendByCategory = persona.spendByCategory;
export const subscriptions = persona.subscriptions;
export const goals = persona.goals;
export const tax = persona.tax;
export const insurance = persona.insurance;
export const peers = persona.peers;
export const roundupStats = persona.roundupStats;
export const dataQuality = persona.dataQuality || {
  transactionMonths: monthlySummary.length,
  hasHoldings: holdings.length > 0,
  hasTax: tax?.dataAvailable !== false,
  hasInsurance: insurance?.dataAvailable !== false,
  confidence: 0.92,
  sources: ['synthetic:customer-360'],
};

export { PERSONA_LIST, getActivePersonaId, switchPersona };

export const totalWealth = () => holdings.reduce((s, h) => s + h.value, 0);

// Model portfolios by risk profile — mapped to IDBI-distributed products.
// Generic across personas: same products, applied to whichever risk profile
// the onboarding quiz assigns.
export const modelPortfolios = {
  Conservative: {
    expectedReturn: returnScenario('Conservative').base,
    mix: [
      { name: 'IDBI Fixed Deposits / Debt Funds', pct: 50, color: 'var(--teal)' },
      { name: 'Large-cap Index Funds', pct: 20, color: 'var(--teal-2)' },
      { name: 'Gold (SGB)', pct: 15, color: 'var(--amber)' },
      { name: 'Liquid / Savings', pct: 15, color: 'var(--slate)' },
    ],
  },
  Balanced: {
    expectedReturn: returnScenario('Balanced').base,
    mix: [
      { name: 'Equity Index & Flexi-cap Funds', pct: 45, color: 'var(--teal)' },
      { name: 'Debt Funds / FDs', pct: 30, color: 'var(--teal-2)' },
      { name: 'Gold (SGB)', pct: 10, color: 'var(--amber)' },
      { name: 'ELSS (Tax Saver)', pct: 10, color: 'var(--green)' },
      { name: 'Liquid Buffer', pct: 5, color: 'var(--slate)' },
    ],
  },
  Aggressive: {
    expectedReturn: returnScenario('Aggressive').base,
    mix: [
      { name: 'Equity Flexi & Mid-cap Funds', pct: 60, color: 'var(--teal)' },
      { name: 'Large-cap Index Funds', pct: 20, color: 'var(--teal-2)' },
      { name: 'ELSS (Tax Saver)', pct: 10, color: 'var(--green)' },
      { name: 'Gold (SGB)', pct: 5, color: 'var(--amber)' },
      { name: 'Liquid Buffer', pct: 5, color: 'var(--slate)' },
    ],
  },
};

// Synthetic market feed (in production: live NSE/AMC feeds) — generic, not
// persona-specific.
export const market = {
  index: 'NIFTY 50',
  weekChangePct: 0.82,
  monthChangePct: 2.4,
  series: [100, 100.4, 99.8, 100.9, 101.2, 100.6, 101.8, 102.1, 101.5, 102.6,
           102.2, 103.0, 102.4, 103.3, 103.9, 103.1, 104.0, 104.6, 103.8, 104.9],
  headline: 'RBI held rates steady; IT & banking led the week.',
};

export const riskQuestions = [
  {
    q: 'If your ₹1 lakh investment dropped to ₹85,000 in a month, you would…',
    options: [
      { label: 'Sell everything immediately', score: 1 },
      { label: 'Wait and watch', score: 2 },
      { label: 'Invest more at lower prices', score: 3 },
    ],
  },
  {
    q: 'How long can you stay invested without needing this money?',
    options: [
      { label: 'Under 2 years', score: 1 },
      { label: '2–5 years', score: 2 },
      { label: '5+ years', score: 3 },
    ],
  },
  {
    q: 'Your experience with market-linked investments?',
    options: [
      { label: 'Only FDs so far', score: 1 },
      { label: 'Some mutual funds / SIPs', score: 2 },
      { label: 'Stocks, MFs — comfortable with ups & downs', score: 3 },
    ],
  },
  {
    q: 'What matters more to you?',
    options: [
      { label: 'Protecting what I have', score: 1 },
      { label: 'Steady growth with some safety', score: 2 },
      { label: 'Maximum long-term growth', score: 3 },
    ],
  },
];

export function riskProfileFromScore(score) {
  if (score <= 6) return 'Conservative';
  if (score <= 9) return 'Balanced';
  return 'Aggressive';
}
