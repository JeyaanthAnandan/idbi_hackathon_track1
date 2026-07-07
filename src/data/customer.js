// ─────────────────────────────────────────────────────────────
// Synthetic customer data — simulates what the bank already has:
// KYC profile, savings account transactions, deposits, investments.
// This is the "360° customer view" that powers personalization.
// ─────────────────────────────────────────────────────────────

export const customer = {
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
};

// Holdings across the bank relationship
export const holdings = [
  { type: 'Savings Account', label: 'IDBI Savings A/c', value: 264500, growth: 3.0, liquid: true },
  { type: 'Fixed Deposit', label: 'IDBI FD (2027 maturity)', value: 200000, growth: 7.1, liquid: false },
  { type: 'Mutual Fund', label: 'Nifty 50 Index Fund (SIP)', value: 86400, cost: 58000, growth: 12.4, liquid: true },
  { type: 'Mutual Fund', label: 'ELSS Tax Saver Fund', value: 45000, cost: 26000, growth: 14.2, liquid: false },
  { type: 'Gold', label: 'Sovereign Gold Bond', value: 31000, cost: 25000, growth: 9.8, liquid: false },
];

// Fund fact sheet (from AMC feeds) — powers the Portfolio X-Ray
export const fundFacts = {
  elss: { name: 'ELSS Tax Saver Fund', plan: 'Regular', er: 1.82, directEr: 0.72, monthlySip: 3000 },
  index: { name: 'Nifty 50 Index Fund', plan: 'Direct', er: 0.2, directEr: 0.2, monthlySip: 5000 },
  overlapPct: 62, // ELSS top holdings overlap with Nifty 50
};

// Outstanding credit (from loan book)
export const loans = [
  { name: 'Education Loan', balance: 180000, rate: 10.5, emi: 8352, monthsLeft: 24 },
];

export const totalWealth = () => holdings.reduce((s, h) => s + h.value, 0);

// 6 months of categorized account activity (monthly aggregates + notable items)
export const monthlySummary = [
  { month: 'Jan', income: 95000, spend: 61200, invested: 8000 },
  { month: 'Feb', income: 95000, spend: 57800, invested: 8000 },
  { month: 'Mar', income: 95000, spend: 66400, invested: 8000 },
  { month: 'Apr', income: 103500, spend: 59100, invested: 8000 }, // annual bonus month
  { month: 'May', income: 95000, spend: 63900, invested: 8000 },
  { month: 'Jun', income: 95000, spend: 71350, invested: 8000 },
];

// Current-month spend by category (June) with 3-month average for anomaly detection
export const spendByCategory = [
  { category: 'Rent & Utilities', amount: 28500, avg3m: 28300, essential: true },
  { category: 'Groceries', amount: 9200, avg3m: 8900, essential: true },
  { category: 'Dining & Food Delivery', amount: 11800, avg3m: 8100, essential: false },
  { category: 'Shopping', amount: 9650, avg3m: 6400, essential: false },
  { category: 'Transport & Fuel', amount: 5400, avg3m: 5200, essential: true },
  { category: 'Subscriptions', amount: 2350, avg3m: 2350, essential: false },
  { category: 'Health & Fitness', amount: 1800, avg3m: 1900, essential: true },
  { category: 'Entertainment', amount: 2650, avg3m: 2100, essential: false },
];

// Recurring debits detected from transaction patterns
export const subscriptions = [
  { name: 'OTT Bundle (3 platforms)', amount: 1097, lastUsed: 'active' },
  { name: 'Music Streaming', amount: 199, lastUsed: 'active' },
  { name: 'Cloud Storage', amount: 219, lastUsed: 'unused 4 months' },
  { name: 'News App Premium', amount: 349, lastUsed: 'unused 3 months' },
  { name: 'Fitness App Pro', amount: 486, lastUsed: 'unused 2 months' },
];

// Customer goals (from onboarding conversation / inferred)
export const goals = [
  {
    id: 'emergency',
    name: 'Emergency Fund',
    icon: 'shield',
    target: 400000, // ~6 months of expenses
    saved: 264500,
    horizonYears: 1,
    priority: 'High',
  },
  {
    id: 'home',
    name: 'Home Down Payment',
    icon: 'bank',
    target: 2500000,
    saved: 331000, // FD + part MF earmarked
    horizonYears: 6,
    priority: 'High',
  },
  {
    id: 'travel',
    name: 'Europe Trip',
    icon: 'plane',
    target: 350000,
    saved: 86400,
    horizonYears: 2,
    priority: 'Medium',
  },
  {
    id: 'retire',
    name: 'Retirement @ 55',
    icon: 'sunset',
    target: 30000000,
    saved: 76000,
    horizonYears: 26,
    priority: 'Medium',
  },
];

// Tax picture (FY so far)
export const tax = {
  section80CUsed: 69000, // ELSS SIP + EPF
  section80CLimit: 150000,
  regime: 'Old (advisable to compare)',
};

// Model portfolios by risk profile — mapped to IDBI-distributed products
export const modelPortfolios = {
  Conservative: {
    expectedReturn: 8,
    mix: [
      { name: 'IDBI Fixed Deposits / Debt Funds', pct: 50, color: 'var(--teal)' },
      { name: 'Large-cap Index Funds', pct: 20, color: 'var(--teal-2)' },
      { name: 'Gold (SGB)', pct: 15, color: 'var(--amber)' },
      { name: 'Liquid / Savings', pct: 15, color: 'var(--slate)' },
    ],
  },
  Balanced: {
    expectedReturn: 11,
    mix: [
      { name: 'Equity Index & Flexi-cap Funds', pct: 45, color: 'var(--teal)' },
      { name: 'Debt Funds / FDs', pct: 30, color: 'var(--teal-2)' },
      { name: 'Gold (SGB)', pct: 10, color: 'var(--amber)' },
      { name: 'ELSS (Tax Saver)', pct: 10, color: 'var(--green)' },
      { name: 'Liquid Buffer', pct: 5, color: 'var(--slate)' },
    ],
  },
  Aggressive: {
    expectedReturn: 13.5,
    mix: [
      { name: 'Equity Flexi & Mid-cap Funds', pct: 60, color: 'var(--teal)' },
      { name: 'Large-cap Index Funds', pct: 20, color: 'var(--teal-2)' },
      { name: 'ELSS (Tax Saver)', pct: 10, color: 'var(--green)' },
      { name: 'Gold (SGB)', pct: 5, color: 'var(--amber)' },
      { name: 'Liquid Buffer', pct: 5, color: 'var(--slate)' },
    ],
  },
};

// Insurance held (from bancassurance records + salary-slip parsing)
export const insurance = {
  termCover: 2000000, // employer group cover only
  healthCover: 500000, // employer group health
  dependents: 2,
};

// Synthetic market feed (in production: live NSE/AMC feeds)
export const market = {
  index: 'NIFTY 50',
  weekChangePct: 0.82,
  monthChangePct: 2.4,
  series: [100, 100.4, 99.8, 100.9, 101.2, 100.6, 101.8, 102.1, 101.5, 102.6,
           102.2, 103.0, 102.4, 103.3, 103.9, 103.1, 104.0, 104.6, 103.8, 104.9],
  headline: 'RBI held rates steady; IT & banking led the week.',
};

// Segment averages for "people like you" (age 25–32, metro, ₹80K–1.2L income)
export const peers = {
  cohort: 'Salaried · 25–32 · Metro · ₹80K–1.2L/mo',
  percentile: 78,
  metrics: [
    { label: 'Savings rate', you: 34, median: 18, max: 50, unit: '%' },
    { label: 'SIP share of income', you: 8.4, median: 4.5, max: 20, unit: '%' },
    { label: 'Emergency cover', you: 4.2, median: 1.8, max: 6, unit: ' months' },
    { label: 'Tax limit utilised', you: 46, median: 61, max: 100, unit: '%' },
  ],
};

// Round-up micro-investing: detected from UPI transaction patterns
export const roundupStats = {
  upiTxnsPerMonth: 86,
  avgRoundup: 17.2, // to nearest ₹50
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
