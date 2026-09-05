// ─────────────────────────────────────────────────────────────
// Two synthetic customers, same shape, very different financial lives.
// Proves MITRA's advice is computed from data, not hand-tuned for one demo
// user — switch personas and every score, nudge and projection changes.
// ─────────────────────────────────────────────────────────────
import { resetXP } from '../engine/xp.js';
import { resetApplied } from '../engine/portfolioState.js';
import { clearChatHistory } from '../engine/chatHistory.js';
import { resetOnboarded, resetRiskProfile, markOnboarded, setStoredRiskProfile } from '../engine/auth.js';
import { saveServerProfile } from '../engine/api.js';

const priya = {
  customer: {
    id: 'CUST-88214',
    name: 'Priya Sharma',
    age: 29,
    segment: 'Salaried Professional',
    city: 'Mumbai',
    relationshipSince: 2019,
    kycRisk: 'Low',
    monthlyIncome: 95000,
    savingsBalance: 264500,
    panLinked: true,
  },

  holdings: [
    { type: 'Savings Account', label: 'IDBI Savings A/c', value: 264500, growth: 3.0, liquid: true },
    { type: 'Fixed Deposit', label: 'IDBI FD (2027 maturity)', value: 200000, growth: 7.1, liquid: false },
    { type: 'Mutual Fund', label: 'Nifty 50 Index Fund (SIP)', value: 86400, cost: 58000, growth: 12.4, liquid: true },
    { type: 'Mutual Fund', label: 'ELSS Tax Saver Fund', value: 45000, cost: 26000, growth: 14.2, liquid: false },
    { type: 'Gold', label: 'Sovereign Gold Bond', value: 31000, cost: 25000, growth: 9.8, liquid: false },
  ],

  fundFacts: {
    elss: { name: 'ELSS Tax Saver Fund', plan: 'Regular', er: 1.82, directEr: 0.72, monthlySip: 3000 },
    index: { name: 'Nifty 50 Index Fund', plan: 'Direct', er: 0.2, directEr: 0.2, monthlySip: 5000 },
    overlapPct: 62,
  },

  loans: [{ name: 'Education Loan', balance: 180000, rate: 10.5, emi: 8352, monthsLeft: 24 }],

  monthlySummary: [
    { month: 'Jan', income: 95000, spend: 61200, invested: 8000 },
    { month: 'Feb', income: 95000, spend: 57800, invested: 8000 },
    { month: 'Mar', income: 95000, spend: 66400, invested: 8000 },
    { month: 'Apr', income: 103500, spend: 59100, invested: 8000 }, // annual bonus month
    { month: 'May', income: 95000, spend: 63900, invested: 8000 },
    { month: 'Jun', income: 95000, spend: 71350, invested: 8000 },
  ],

  spendByCategory: [
    { category: 'Rent & Utilities', amount: 28500, avg3m: 28300, essential: true },
    { category: 'Groceries', amount: 9200, avg3m: 8900, essential: true },
    { category: 'Dining & Food Delivery', amount: 11800, avg3m: 8100, essential: false },
    { category: 'Shopping', amount: 9650, avg3m: 6400, essential: false },
    { category: 'Transport & Fuel', amount: 5400, avg3m: 5200, essential: true },
    { category: 'Subscriptions', amount: 2350, avg3m: 2350, essential: false },
    { category: 'Health & Fitness', amount: 1800, avg3m: 1900, essential: true },
    { category: 'Entertainment', amount: 2650, avg3m: 2100, essential: false },
  ],

  subscriptions: [
    { name: 'OTT Bundle (3 platforms)', amount: 1097, lastUsed: 'active' },
    { name: 'Music Streaming', amount: 199, lastUsed: 'active' },
    { name: 'Cloud Storage', amount: 219, lastUsed: 'unused 4 months' },
    { name: 'News App Premium', amount: 349, lastUsed: 'unused 3 months' },
    { name: 'Fitness App Pro', amount: 486, lastUsed: 'unused 2 months' },
  ],

  goals: [
    { id: 'emergency', name: 'Emergency Fund', icon: 'shield', target: 400000, saved: 264500, horizonYears: 1, priority: 'High' },
    { id: 'home', name: 'Home Down Payment', icon: 'bank', target: 2500000, saved: 331000, horizonYears: 6, priority: 'High' },
    { id: 'travel', name: 'Europe Trip', icon: 'plane', target: 350000, saved: 86400, horizonYears: 2, priority: 'Medium' },
    { id: 'retire', name: 'Retirement @ 55', icon: 'sunset', target: 30000000, saved: 76000, horizonYears: 26, priority: 'Medium' },
  ],

  tax: { section80CUsed: 69000, section80CLimit: 150000, regime: 'Old', regimeConfirmed: true, marginalRate: 0.312, dataAvailable: true },

  insurance: { termCover: 2000000, healthCover: 500000, dependents: 2, portable: false, dataAvailable: true },

  peers: {
    cohort: 'Salaried · 25–32 · Metro · ₹80K–1.2L/mo',
    percentile: 78,
    metrics: [
      { label: 'Savings rate', you: 34, median: 18, max: 50, unit: '%' },
      { label: 'SIP share of income', you: 8.4, median: 4.5, max: 20, unit: '%' },
      { label: 'Emergency cover', you: 4.2, median: 1.8, max: 6, unit: ' months' },
      { label: 'Tax limit utilised', you: 46, median: 61, max: 100, unit: '%' },
    ],
  },

  roundupStats: { upiTxnsPerMonth: 86, avgRoundup: 17.2 },
};

const arjun = {
  customer: {
    id: 'CUST-77031',
    name: 'Arjun Mehta',
    age: 45,
    segment: 'Self-Employed · Retail Business',
    city: 'Pune',
    relationshipSince: 2015,
    kycRisk: 'Medium',
    monthlyIncome: 68000, // avg of an irregular self-employed income
    savingsBalance: 42000,
    panLinked: true,
  },

  holdings: [
    { type: 'Savings Account', label: 'IDBI Savings A/c', value: 42000, growth: 3.0, liquid: true },
    { type: 'Fixed Deposit', label: 'IDBI FD (2028 maturity)', value: 180000, growth: 6.8, liquid: false },
    { type: 'Mutual Fund', label: 'Nifty 50 Index Fund (SIP)', value: 21000, cost: 17000, growth: 11.6, liquid: true },
    { type: 'Mutual Fund', label: 'ELSS Tax Saver Fund (Regular)', value: 28000, cost: 24000, growth: 9.5, liquid: false },
    { type: 'Gold', label: 'Gold Jewellery (SGB-equivalent)', value: 15000, cost: 13000, growth: 8.5, liquid: false },
  ],

  fundFacts: {
    elss: { name: 'ELSS Tax Saver Fund (Regular)', plan: 'Regular', er: 2.1, directEr: 0.85, monthlySip: 2000 },
    index: { name: 'Nifty 50 Index Fund', plan: 'Direct', er: 0.2, directEr: 0.2, monthlySip: 1500 },
    overlapPct: 48,
  },

  loans: [{ name: 'Business & Personal Loan', balance: 420000, rate: 15.5, emi: 11200, monthsLeft: 44 }],

  // Self-employed income swings month to month; SIP discipline is thin.
  monthlySummary: [
    { month: 'Jan', income: 72000, spend: 68500, invested: 0 },
    { month: 'Feb', income: 58000, spend: 61200, invested: 0 },
    { month: 'Mar', income: 81000, spend: 74800, invested: 3500 },
    { month: 'Apr', income: 54000, spend: 57600, invested: 0 },
    { month: 'May', income: 76000, spend: 69300, invested: 0 },
    { month: 'Jun', income: 67000, spend: 65800, invested: 3500 },
  ],

  spendByCategory: [
    { category: 'Rent & Utilities', amount: 18500, avg3m: 18200, essential: true },
    { category: 'Shop Supplies & Inventory', amount: 22000, avg3m: 21400, essential: true },
    { category: 'Groceries', amount: 7200, avg3m: 7000, essential: true },
    { category: 'Dining & Food Delivery', amount: 4200, avg3m: 3100, essential: false },
    { category: 'Transport & Fuel', amount: 6800, avg3m: 6200, essential: true },
    { category: 'Subscriptions', amount: 1248, avg3m: 1248, essential: false },
    { category: 'Health & Fitness', amount: 1200, avg3m: 1400, essential: true },
    { category: 'Family & Social Obligations', amount: 4800, avg3m: 3200, essential: false },
  ],

  subscriptions: [
    { name: 'OTT Bundle', amount: 249, lastUsed: 'active' },
    { name: 'Billing / POS Software Add-on', amount: 999, lastUsed: 'unused 3 months' },
    { name: 'News App Premium', amount: 199, lastUsed: 'unused 5 months' },
  ],

  // Same 4 goal ids as every persona (goalCollision() prioritises by id) —
  // only the story behind each one changes.
  goals: [
    { id: 'emergency', name: 'Emergency Fund', icon: 'shield', target: 350000, saved: 42000, horizonYears: 1, priority: 'High' },
    { id: 'home', name: 'Shop Expansion', icon: 'bank', target: 800000, saved: 65000, horizonYears: 3, priority: 'High' },
    { id: 'travel', name: "Daughter's Education", icon: 'globe', target: 1200000, saved: 90000, horizonYears: 5, priority: 'High' },
    { id: 'retire', name: 'Retirement @ 60', icon: 'sunset', target: 15000000, saved: 195000, horizonYears: 15, priority: 'Medium' },
  ],

  tax: { section80CUsed: 24000, section80CLimit: 150000, regime: 'Old', regimeConfirmed: true, marginalRate: 0.312, dataAvailable: true },

  insurance: { termCover: 500000, healthCover: 200000, dependents: 3, portable: false, dataAvailable: true },

  peers: {
    cohort: 'Self-employed · 40–50 · Tier-2 city · ₹50K–90K/mo',
    percentile: 34,
    metrics: [
      { label: 'Savings rate', you: 11, median: 15, max: 40, unit: '%' },
      { label: 'SIP share of income', you: 1.5, median: 3.2, max: 15, unit: '%' },
      { label: 'Emergency cover', you: 0.7, median: 1.5, max: 6, unit: ' months' },
      { label: 'Tax limit utilised', you: 16, median: 38, max: 100, unit: '%' },
    ],
  },

  roundupStats: { upiTxnsPerMonth: 34, avgRoundup: 22.4 },
};

const CUSTOM_PERSONA_KEY = 'mitra_custom_persona';

function loadCustomPersona() {
  try {
    const raw = localStorage.getItem(CUSTOM_PERSONA_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const customPersona = loadCustomPersona();

export const PERSONAS = { priya, arjun, ...(customPersona ? { custom: customPersona } : {}) };

export const PERSONA_LIST = [
  { id: 'priya', label: 'Priya Sharma', blurb: '29 · salaried, Mumbai · disciplined saver, under-invested' },
  { id: 'arjun', label: 'Arjun Mehta', blurb: '45 · self-employed, Pune · irregular income, thin protection' },
  ...(customPersona
    ? [{ id: 'custom', label: customPersona.customer.name, blurb: 'Built from your connected accounts / uploaded statements' }]
    : []),
];

export const PERSONA_KEY = 'mitra_persona';

export function getActivePersonaId() {
  try {
    const id = localStorage.getItem(PERSONA_KEY);
    return PERSONAS[id] ? id : 'priya';
  } catch {
    return 'priya';
  }
}

// Switching customers means every derived number (XP, applied advice, chat)
// belongs to the old persona — clear it all and reload so the whole app,
// including onboarding, starts fresh for the new one.
export function switchPersona(id) {
  if (!PERSONAS[id]) return;
  localStorage.setItem(PERSONA_KEY, id);
  resetXP();
  resetApplied();
  clearChatHistory();
  resetOnboarded();
  resetRiskProfile();
  window.location.reload();
}

// Stores a persona built from an uploaded statement / connected account
// (see engine/personaBuilder.js), makes it the active persona, and marks
// onboarding + risk profile as already known — the customer just proved it
// with real data, so there's no quiz to repeat.
export async function saveCustomPersonaAndActivate(persona, riskProfile, sources = []) {
  await saveServerProfile({ persona, riskProfile, sources });
  localStorage.setItem(CUSTOM_PERSONA_KEY, JSON.stringify(persona));
  localStorage.setItem(PERSONA_KEY, 'custom');
  resetXP();
  resetApplied();
  clearChatHistory();
  markOnboarded();
  setStoredRiskProfile(riskProfile);
}
