// ─────────────────────────────────────────────────────────────
// The relationship manager's book — synthetic, like every customer in
// this prototype. Priya and Arjun are the same personas the customer app
// runs on; the other six are generated in the same shape so the RM
// console has a realistic spread of segments, ages and risk profiles to
// triage. Nothing here is real customer data.
// ─────────────────────────────────────────────────────────────
import { PERSONAS } from './personas.js';

export const RM_PROFILE = {
  name: 'Kavita Menon',
  employeeId: 'IDBI-RM-40217',
  role: 'Relationship Manager · Wealth',
  branch: 'Mumbai – Nariman Point (0012)',
  supervisor: 'Rajesh Kulkarni (Branch Head)',
  arnCode: 'ARN-148920',
  certifications: ['NISM-V-A Mutual Fund Distributor', 'IRDAI Composite Agent'],
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

// Deterministic wobble so the generated book is the same on every load.
const wobble = (seed, i) => Math.sin(seed * 12.9898 + i * 78.233) * 0.5;

function makeCustomer({
  id, name, age, segment, city, since, kycRisk = 'Low', income, spend, invested, volatility = 0.02,
  savings, fd = 0, mf = [], stocks = 0, gold = 0, loans = [], regularElss = null,
  goals, tax, insurance, riskProfile, subs = [],
}) {
  const seed = Number(id.replace(/\D/g, '')) % 97;
  const monthlySummary = MONTHS.map((month, i) => ({
    month,
    income: Math.round(income * (1 + wobble(seed, i) * volatility * 4) / 100) * 100,
    spend: Math.round(spend * (1 + wobble(seed + 3, i) * 0.12) / 100) * 100,
    invested,
  }));
  const holdings = [
    { type: 'Savings Account', label: 'IDBI Savings A/c', value: savings, growth: 3.0, liquid: true },
    ...(fd ? [{ type: 'Fixed Deposit', label: 'IDBI Term Deposit', value: fd, growth: 7.0, liquid: false }] : []),
    ...mf.map(([label, value, cost]) => ({ type: 'Mutual Fund', label, value, cost, growth: 11.5, liquid: true })),
    ...(stocks ? [{ type: 'Stocks', label: 'Direct equity (demat)', value: stocks, cost: Math.round(stocks * 0.8), growth: 13, liquid: true }] : []),
    ...(gold ? [{ type: 'Gold', label: 'Sovereign Gold Bond', value: gold, cost: Math.round(gold * 0.8), growth: 9.5, liquid: false }] : []),
  ];
  return {
    riskProfile,
    customer: { id, name, age, segment, city, relationshipSince: since, kycRisk, monthlyIncome: income, savingsBalance: savings, panLinked: true },
    holdings,
    fundFacts: regularElss ? { elss: { name: regularElss.name, plan: 'Regular', er: regularElss.er, directEr: regularElss.directEr, monthlySip: regularElss.sip }, index: { name: 'Nifty 50 Index Fund', plan: 'Direct', er: 0.2, directEr: 0.2 }, overlapPct: 40 } : null,
    loans,
    monthlySummary,
    spendByCategory: [],
    subscriptions: subs,
    goals,
    tax,
    insurance,
  };
}

const SYNTHETIC = [
  makeCustomer({
    id: 'CUST-61402', name: 'Lakshmi Iyer', age: 63, segment: 'Retired · Pensioner', city: 'Chennai', since: 1998, riskProfile: 'Conservative',
    income: 48000, spend: 31000, invested: 0, savings: 410000, fd: 2850000, mf: [['Balanced Advantage Fund', 220000, 180000]], gold: 140000,
    goals: [
      { id: 'emergency', name: 'Medical Reserve', icon: 'shield', target: 600000, saved: 410000, horizonYears: 1, priority: 'High' },
      { id: 'home', name: 'Grandchild Education Gift', icon: 'bank', target: 1000000, saved: 220000, horizonYears: 6, priority: 'Medium' },
    ],
    tax: { section80CUsed: 150000, section80CLimit: 150000, regime: 'Old', regimeConfirmed: true, marginalRate: 0.208, dataAvailable: true },
    insurance: { termCover: 0, healthCover: 500000, dependents: 0, dataAvailable: true },
  }),
  makeCustomer({
    id: 'CUST-90318', name: 'Rohan Deshpande', age: 34, segment: 'Salaried · IT Professional', city: 'Bengaluru', since: 2017, riskProfile: 'Aggressive',
    income: 215000, spend: 98000, invested: 30000, savings: 690000, fd: 300000,
    mf: [['Flexi Cap Fund', 1240000, 860000], ['Nifty Next 50 Index Fund', 520000, 410000]], stocks: 880000,
    goals: [
      { id: 'emergency', name: 'Emergency Fund', icon: 'shield', target: 600000, saved: 690000, horizonYears: 1, priority: 'High' },
      { id: 'home', name: 'Home Purchase', icon: 'bank', target: 4500000, saved: 1100000, horizonYears: 4, priority: 'High' },
      { id: 'retire', name: 'Retirement @ 50', icon: 'sunset', target: 60000000, saved: 2640000, horizonYears: 16, priority: 'Medium' },
    ],
    tax: { section80CUsed: 150000, section80CLimit: 150000, regime: 'Old', regimeConfirmed: true, marginalRate: 0.312, dataAvailable: true },
    insurance: { termCover: 10000000, healthCover: 500000, dependents: 2, dataAvailable: true },
    subs: [{ name: 'Premium trading terminal', amount: 1499, lastUsed: 'unused 2 months' }],
  }),
  makeCustomer({
    id: 'CUST-55871', name: 'Dr. Fatima Shaikh', age: 38, segment: 'Self-Employed · Medical Practitioner', city: 'Hyderabad', since: 2012, riskProfile: 'Balanced',
    income: 260000, spend: 140000, invested: 50000, volatility: 0.05, savings: 950000, fd: 1200000,
    mf: [['Large & Mid Cap Fund', 1650000, 1200000], ['Short Duration Debt Fund', 600000, 540000]], gold: 300000,
    regularElss: { name: 'ELSS Tax Saver Fund (Regular)', er: 1.74, directEr: 0.68, sip: 12500 },
    goals: [
      { id: 'emergency', name: 'Practice Reserve', icon: 'shield', target: 900000, saved: 950000, horizonYears: 1, priority: 'High' },
      { id: 'home', name: 'Clinic Expansion', icon: 'bank', target: 3500000, saved: 1200000, horizonYears: 3, priority: 'High' },
      { id: 'travel', name: "Children's Education", icon: 'globe', target: 8000000, saved: 900000, horizonYears: 12, priority: 'High' },
    ],
    tax: { section80CUsed: 150000, section80CLimit: 150000, regime: 'Old', regimeConfirmed: true, marginalRate: 0.312, dataAvailable: true },
    insurance: { termCover: 30000000, healthCover: 2500000, dependents: 3, dataAvailable: true },
  }),
  makeCustomer({
    id: 'CUST-38044', name: 'Gurpreet Singh', age: 52, segment: 'Self-Employed · Transport Business', city: 'Ludhiana', since: 2009, kycRisk: 'Medium', riskProfile: 'Balanced',
    income: 140000, spend: 72000, invested: 0, volatility: 0.12, savings: 120000, fd: 400000, gold: 450000,
    loans: [{ name: 'Commercial Vehicle Loan', balance: 2400000, rate: 11.25, emi: 41500, monthsLeft: 66 }, { name: 'Gold Loan', balance: 300000, rate: 9.5, emi: 9800, monthsLeft: 36 }],
    goals: [
      { id: 'emergency', name: 'Emergency Fund', icon: 'shield', target: 450000, saved: 120000, horizonYears: 1, priority: 'High' },
      { id: 'travel', name: "Son's Wedding", icon: 'globe', target: 2500000, saved: 450000, horizonYears: 3, priority: 'High' },
      { id: 'retire', name: 'Retirement @ 62', icon: 'sunset', target: 20000000, saved: 400000, horizonYears: 10, priority: 'Medium' },
    ],
    tax: { section80CUsed: 50000, section80CLimit: 150000, regime: 'Old', regimeConfirmed: true, marginalRate: 0.312, dataAvailable: true },
    insurance: { termCover: 2500000, healthCover: 500000, dependents: 4, dataAvailable: true },
  }),
  makeCustomer({
    id: 'CUST-97215', name: 'Ananya Das', age: 26, segment: 'Salaried · First Job', city: 'Kolkata', since: 2025, riskProfile: 'Aggressive',
    income: 52000, spend: 33000, invested: 2000, savings: 95000, mf: [['Nifty 50 Index Fund', 26000, 22000]],
    goals: [
      { id: 'emergency', name: 'Emergency Fund', icon: 'shield', target: 200000, saved: 95000, horizonYears: 1, priority: 'High' },
      { id: 'travel', name: 'Higher Studies (MBA)', icon: 'globe', target: 2000000, saved: 26000, horizonYears: 4, priority: 'High' },
    ],
    tax: { section80CUsed: 0, section80CLimit: 150000, regime: 'New', regimeConfirmed: true, marginalRate: 0.05, dataAvailable: true },
    insurance: { termCover: 0, healthCover: 300000, dependents: 1, dataAvailable: true },
    subs: [{ name: 'Language learning app', amount: 299, lastUsed: 'unused 3 months' }],
  }),
  makeCustomer({
    id: 'CUST-24690', name: 'Vikram Rao', age: 41, segment: 'Salaried · Central Govt', city: 'Lucknow', since: 2006, riskProfile: 'Conservative',
    income: 118000, spend: 64000, invested: 12500, savings: 380000, fd: 2100000, mf: [['Corporate Bond Fund', 150000, 130000]],
    goals: [
      { id: 'emergency', name: 'Emergency Fund', icon: 'shield', target: 400000, saved: 380000, horizonYears: 1, priority: 'High' },
      { id: 'travel', name: "Daughter's Engineering", icon: 'globe', target: 2500000, saved: 900000, horizonYears: 5, priority: 'High' },
      { id: 'retire', name: 'Retirement @ 60', icon: 'sunset', target: 25000000, saved: 1350000, horizonYears: 19, priority: 'Medium' },
    ],
    tax: { section80CUsed: 150000, section80CLimit: 150000, regime: 'Old', regimeConfirmed: true, marginalRate: 0.208, dataAvailable: true },
    insurance: { termCover: 5000000, healthCover: 500000, dependents: 3, dataAvailable: true },
  }),
];

// RM-side relationship context that the bank's CRM would hold.
const RELATIONSHIP = {
  'CUST-88214': { language: 'English', phone: '+91 98•••• 4417', lastContact: '2026-07-18', mitraSessions30d: 14, lastMitraTopic: 'Idle surplus → SIP', nextReview: '2026-10-15' },
  'CUST-77031': { language: 'Marathi', phone: '+91 97•••• 0832', lastContact: '2026-03-02', mitraSessions30d: 6, lastMitraTopic: 'Loan prepay vs invest', nextReview: '2026-10-05' },
  'CUST-61402': { language: 'Tamil', phone: '+91 94•••• 2210', lastContact: '2026-08-29', mitraSessions30d: 9, lastMitraTopic: 'FD maturity reinvestment', nextReview: '2026-10-08' },
  'CUST-90318': { language: 'English', phone: '+91 99•••• 7781', lastContact: '2026-09-22', mitraSessions30d: 21, lastMitraTopic: 'Home purchase timeline', nextReview: '2026-12-01' },
  'CUST-55871': { language: 'Hindi', phone: '+91 90•••• 6154', lastContact: '2026-06-11', mitraSessions30d: 4, lastMitraTopic: 'Portfolio X-Ray', nextReview: '2026-10-20' },
  'CUST-38044': { language: 'Punjabi', phone: '+91 98•••• 3306', lastContact: '2026-01-14', mitraSessions30d: 2, lastMitraTopic: 'Fraud Shield · "guaranteed 24%" offer', nextReview: '2026-10-03' },
  'CUST-97215': { language: 'Bengali', phone: '+91 83•••• 5590', lastContact: null, mitraSessions30d: 17, lastMitraTopic: 'MBA goal planning', nextReview: '2026-11-10' },
  'CUST-24690': { language: 'Hindi', phone: '+91 94•••• 1187', lastContact: '2026-05-20', mitraSessions30d: 3, lastMitraTopic: 'Is my FD beating inflation?', nextReview: '2026-11-28' },
};

// What each customer recently did with MITRA — the conversation summary a
// customer agreed to share with their RM. Synthetic, like the rest.
const MITRA_LOG = {
  'CUST-88214': [
    { when: 'Today', lang: 'English', tool: 'Idle surplus', q: 'What should I do with the money sitting in savings?', a: 'Modelled a ₹25,125/mo SIP in the Balanced portfolio. Simulation only; nothing was invested.' },
    { when: 'Last week', lang: 'English', tool: 'Protection gap', q: 'Am I protected?', a: 'Life cover is short of the 15× income rule. Indicative premium shown in the Advice Passport.' },
  ],
  'CUST-77031': [
    { when: '42 min ago', lang: 'Marathi', tool: 'Live call', q: 'Should I prepay my business loan or buy insurance first?', a: 'Compared prepayment with investing, then raised HND-1401 at his request.' },
    { when: 'Tuesday', lang: 'Marathi', tool: 'Prepay vs invest', q: 'Is it better to close the loan early?', a: 'Showed the 15.5% loan against a conservative return band. Flagged the 0.6-month reserve first.' },
  ],
  'CUST-61402': [
    { when: 'Today, 07:02', lang: 'Tamil', tool: 'FD maturity', q: 'Should I renew my FD or move to Senior Citizen Savings Scheme?', a: 'Compared rates and lock-ins in Tamil. Suggested discussing with the RM before maturity on 14 Oct.' },
  ],
  'CUST-90318': [
    { when: 'Today, 08:30', lang: 'English', tool: 'SIP', q: 'Start ₹60,000 a month into my aggressive plan.', a: 'Above ₹25,000/mo, so sent to the RM for sign-off as ADV-1401. Kept out of the plan until approved.' },
  ],
  'CUST-55871': [
    { when: 'June', lang: 'Hindi', tool: 'Portfolio X-Ray', q: 'Am I paying too much in fund fees?', a: 'Found the ELSS on a Regular plan at 1.74% vs 0.68% Direct.' },
  ],
  'CUST-38044': [
    { when: 'Last week', lang: 'Punjabi', tool: 'Fraud Shield', q: 'A scheme says guaranteed 24% a year. Is it safe?', a: 'Guaranteed high returns fail the SEBI/RBI 5-point check. No regulated product promises 24%.', verdict: 'Avoid', tip: 'He is being targeted by high-return pitches. Mention it gently at the review and point him to Fraud Shield for the next one.' },
    { when: 'August', lang: 'Punjabi', tool: 'Goals', q: "Can I afford my son's wedding in 3 years?", a: 'Showed goals need ₹1.55 L/mo against ₹69K capacity, and proposed priority-ordered funding.' },
  ],
  'CUST-97215': [
    { when: 'Yesterday', lang: 'Bengali', tool: 'Goals', q: 'I want to do an MBA in four years.', a: 'Created the goal by voice. Needs ₹30,625/mo against ₹19,200 capacity.' },
  ],
  'CUST-24690': [
    { when: 'May', lang: 'Hindi', tool: 'Market Pulse', q: 'Is my FD beating inflation?', a: 'After tax, the FD return is close to inflation. Suggested reviewing allocation with the RM.' },
  ],
};

const withRisk = (persona, riskProfile) => ({ ...persona, riskProfile });

export const BOOK = [
  withRisk(PERSONAS.priya, 'Balanced'),
  withRisk(PERSONAS.arjun, 'Conservative'),
  ...SYNTHETIC,
].map((p) => ({ ...p, relationship: RELATIONSHIP[p.customer.id] || { language: 'English', mitraSessions30d: 0 }, mitraLog: MITRA_LOG[p.customer.id] || [] }));

export const findInBook = (customerId) => BOOK.find((p) => p.customer.id === customerId) || null;

// How a customer reaches their RM. Prototype contact route: the consented
// handoff inside MITRA, or the branch — no personal numbers are shown.
const RM_AVAILABILITY = 'Monday to Saturday, 10:00 am to 6:00 pm';
const longDate = (iso) => (iso ? new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : null);

// The customer → RM mapping, as the customer app sees it. Every customer in
// this branch's wealth book is assigned to RM_PROFILE; a customer who joined
// through MITRA and isn't in the book yet is served by the same branch RM
// desk until they are assigned. Relationship dates come from the CRM context
// above when the customer is in the book.
export function relationshipManagerFor(customerId) {
  const entry = findInBook(customerId);
  const rel = entry?.relationship || {};
  return {
    name: RM_PROFILE.name,
    role: RM_PROFILE.role,
    branch: RM_PROFILE.branch,
    certifications: RM_PROFILE.certifications,
    availability: RM_AVAILABILITY,
    reach: 'Ask MITRA to "talk to a human" to send your RM a consented briefing, or visit the branch',
    assigned: Boolean(entry),
    lastContact: longDate(rel.lastContact),
    nextReview: longDate(rel.nextReview),
  };
}
