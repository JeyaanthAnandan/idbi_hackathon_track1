// ─────────────────────────────────────────────────────────────
// Turns an uploaded bank/broker CSV export into the same shapes the rest of
// the app already speaks (transactions → monthlySummary + spendByCategory;
// a holdings export → holdings[]). Real parsing, not simulated — this is
// what actually reads the file the customer uploads.
// ─────────────────────────────────────────────────────────────
import { parseCSV } from './csvParser.js';

const CATEGORY_RULES = [
  { category: 'Rent & Utilities', essential: true, keywords: ['rent', 'electricity', 'water bill', 'gas bill', 'broadband', 'wifi', 'utility', 'maintenance'] },
  { category: 'Groceries', essential: true, keywords: ['bigbasket', 'blinkit', 'zepto', 'grocery', 'grofers', 'dmart', 'reliance fresh', 'more supermarket'] },
  { category: 'Dining & Food Delivery', essential: false, keywords: ['swiggy', 'zomato', 'restaurant', 'cafe', 'dining', 'food'] },
  { category: 'Shopping', essential: false, keywords: ['amazon', 'flipkart', 'myntra', 'ajio', 'shopping', 'mall', 'nykaa'] },
  { category: 'Transport & Fuel', essential: true, keywords: ['uber', 'ola', 'rapido', 'petrol', 'fuel', 'metro', 'irctc', 'fastag'] },
  { category: 'Subscriptions', essential: false, keywords: ['netflix', 'spotify', 'hotstar', 'prime video', 'youtube premium', 'subscription'] },
  { category: 'Health & Fitness', essential: true, keywords: ['pharmacy', 'hospital', 'clinic', 'gym', 'fitness', 'apollo', 'practo'] },
  { category: 'Entertainment', essential: false, keywords: ['bookmyshow', 'pvr', 'inox', 'movie'] },
  { category: 'Investments', essential: false, keywords: ['sip', 'mutual fund', 'zerodha', 'groww', 'upstox', 'kite', 'nse', 'bse'] },
  { category: 'EMI / Loan', essential: true, keywords: ['emi', 'loan'] },
];

function categorize(description) {
  const d = (description || '').toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((k) => d.includes(k))) return rule;
  }
  return { category: 'Other', essential: false };
}

function parseDate(s) {
  if (!s) return null;
  let d = new Date(s);
  if (!isNaN(d)) return d;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let [, dd, mm, yyyy] = m;
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    d = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`);
    if (!isNaN(d)) return d;
  }
  return null;
}

// Expected columns (case-insensitive, order-independent): date, description
// (or narration/particulars), amount, type (credit|debit) — type is inferred
// from a signed amount when the column is missing.
export function parseBankStatementCSV(text) {
  const rows = parseCSV(text);
  return rows
    .map((r) => {
      const rawAmount = r.amount ?? r.amt ?? r['debit/credit'] ?? '0';
      const numeric = parseFloat(String(rawAmount).replace(/[,₹\s]/g, '')) || 0;
      const explicitType = (r.type || r['dr/cr'] || '').toLowerCase();
      const type = explicitType.startsWith('cr') || explicitType === 'credit'
        ? 'credit'
        : explicitType.startsWith('dr') || explicitType === 'debit'
          ? 'debit'
          : numeric < 0 ? 'debit' : 'credit';
      return {
        date: r.date || r['transaction date'] || r['txn date'] || '',
        description: r.description || r.narration || r.particulars || r.details || '',
        amount: Math.abs(numeric),
        type,
      };
    })
    .filter((t) => t.amount > 0 && parseDate(t.date));
}

// Expected columns: name/scheme/symbol, type, value/current value, cost,
// growth/return %.
export function parseHoldingsCSV(text) {
  const rows = parseCSV(text);
  return rows
    .map((r) => ({
      type: r.type || 'Mutual Fund',
      label: r.name || r.scheme || r.fund || r.symbol || 'Holding',
      value: parseFloat(String(r.value ?? r['current value'] ?? r.value_inr ?? '0').replace(/[,₹\s]/g, '')) || 0,
      cost: parseFloat(String(r.cost ?? r['invested value'] ?? '0').replace(/[,₹\s]/g, '')) || undefined,
      growth: parseFloat(String(r.growth ?? r['return%'] ?? r.cagr ?? '0').replace(/[%\s]/g, '')) || 0,
      liquid: (r.liquid ?? 'true').toLowerCase() !== 'false',
    }))
    .filter((h) => h.value > 0);
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function buildMonthlySummary(transactions) {
  const byMonth = new Map();
  transactions.forEach((t) => {
    const d = parseDate(t.date);
    if (!d) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth.has(key)) byMonth.set(key, { income: 0, spend: 0, invested: 0 });
    const bucket = byMonth.get(key);
    if (t.type === 'credit') bucket.income += t.amount;
    else {
      bucket.spend += t.amount;
      if (categorize(t.description).category === 'Investments') bucket.invested += t.amount;
    }
  });
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({
      month: MONTH_NAMES[parseInt(key.split('-')[1], 10) - 1],
      income: Math.round(v.income),
      spend: Math.round(v.spend),
      invested: Math.round(v.invested),
    }));
}

export function buildSpendByCategory(transactions) {
  const monthsSeen = new Set();
  const byCat = new Map();
  transactions.forEach((t) => {
    if (t.type !== 'debit') return;
    const rule = categorize(t.description);
    if (rule.category === 'Investments') return;
    const d = parseDate(t.date);
    if (d) monthsSeen.add(`${d.getFullYear()}-${d.getMonth()}`);
    if (!byCat.has(rule.category)) byCat.set(rule.category, { total: 0, essential: rule.essential });
    byCat.get(rule.category).total += t.amount;
  });
  const numMonths = Math.max(monthsSeen.size, 1);
  return Array.from(byCat.entries())
    .map(([category, v]) => ({
      category,
      amount: Math.round(v.total / numMonths),
      avg3m: Math.round(v.total / numMonths),
      essential: v.essential,
    }))
    .sort((a, b) => b.amount - a.amount);
}

// Flags merchants that recur with near-identical amounts across 2+ distinct
// months — a decent proxy for subscriptions from a raw bank feed.
export function detectSubscriptions(transactions) {
  const groups = new Map();
  transactions.forEach((t) => {
    if (t.type !== 'debit') return;
    const d = parseDate(t.date);
    if (!d) return;
    const key = t.description.toLowerCase().trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ amount: t.amount, month: `${d.getFullYear()}-${d.getMonth()}` });
  });
  const subs = [];
  groups.forEach((entries, key) => {
    const months = new Set(entries.map((e) => e.month));
    if (months.size < 2) return;
    const avg = entries.reduce((s, e) => s + e.amount, 0) / entries.length;
    const consistent = entries.every((e) => Math.abs(e.amount - avg) / avg < 0.1);
    if (!consistent) return;
    subs.push({ name: key.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40), amount: Math.round(avg), lastUsed: 'active' });
  });
  return subs.slice(0, 8);
}

export function totalIncome(transactions) {
  const credits = transactions.filter((t) => t.type === 'credit');
  if (!credits.length) return 0;
  return Math.round(credits.reduce((s, t) => s + t.amount, 0) / new Set(credits.map((t) => {
    const d = parseDate(t.date);
    return d ? `${d.getFullYear()}-${d.getMonth()}` : Math.random();
  })).size);
}
