// ─────────────────────────────────────────────────────────────
// Synthetic data returned by the SIMULATED "connect account" flow.
// There is no real Zerodha/Upstox/Groww/INDmoney/Account-Aggregator
// integration here — no backend exists to hold API secrets and none of
// these apps' real credentials are available in this prototype. This
// module stands in for what a real connector would hand back, in the same
// shape parseHoldingsCSV()/parseBankStatementCSV() produce, so the rest of
// the pipeline (personaBuilder, riskDerivation) can't tell the difference.
// ─────────────────────────────────────────────────────────────
const rand = (min, max) => Math.round(min + Math.random() * (max - min));
const pick = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);

const BROKER_FUNDS = [
  { label: 'Nifty 50 Index Fund', type: 'Mutual Fund' },
  { label: 'Parag Parikh Flexi Cap Fund', type: 'Mutual Fund' },
  { label: 'HDFC Mid-Cap Opportunities Fund', type: 'Mutual Fund' },
  { label: 'ELSS Tax Saver Fund', type: 'Mutual Fund' },
  { label: 'Reliance Industries Ltd', type: 'Stocks' },
  { label: 'HDFC Bank Ltd', type: 'Stocks' },
  { label: 'Infosys Ltd', type: 'Stocks' },
  { label: 'Tata Motors Ltd', type: 'Stocks' },
];

function genHoldings(count) {
  return pick(BROKER_FUNDS, count).map((f) => {
    const value = rand(15000, 180000);
    return { ...f, value, cost: Math.round(value * (0.7 + Math.random() * 0.25)), growth: rand(6, 22), liquid: true };
  });
}

export const PROVIDERS = {
  zerodha: { id: 'zerodha', label: 'Zerodha', kind: 'broker', blurb: 'Stocks & mutual funds via Kite', consentField: 'Client ID' },
  upstox: { id: 'upstox', label: 'Upstox', kind: 'broker', blurb: 'Stocks & mutual funds', consentField: 'Client ID' },
  groww: { id: 'groww', label: 'Groww', kind: 'broker', blurb: 'Mutual funds, stocks & gold', consentField: 'Mobile number' },
  indmoney: { id: 'indmoney', label: 'INDmoney', kind: 'aggregator', blurb: 'Net worth tracker — MFs, US stocks, FDs', consentField: 'Mobile number' },
  bank: { id: 'bank', label: 'Bank Account', kind: 'bank', blurb: 'Via Account Aggregator (RBI-licensed)', consentField: 'Bank & account' },
};

export function generateProviderData(providerId) {
  if (providerId === 'bank') return { transactions: genBankTransactions() };
  if (providerId === 'indmoney') return { holdings: genHoldings(rand(3, 4)) };
  return { holdings: genHoldings(rand(2, 3)) };
}

const MERCHANTS = {
  'Rent & Utilities': ['Rent - Landlord NEFT', 'BESCOM Electricity Bill', 'ACT Broadband'],
  'Groceries': ['BigBasket', 'Zepto', 'DMart'],
  'Dining & Food Delivery': ['Swiggy', 'Zomato'],
  'Shopping': ['Amazon', 'Myntra'],
  'Transport & Fuel': ['Uber', 'Indian Oil Petrol Pump', 'Namma Metro'],
  'Subscriptions': ['Netflix', 'Spotify'],
};

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function genBankTransactions() {
  const txns = [];
  const today = new Date();
  const baseIncome = rand(45000, 110000);
  for (let m = 2; m >= 0; m--) {
    const salaryDate = new Date(today.getFullYear(), today.getMonth() - m, 1);
    txns.push({ date: fmtDate(salaryDate), description: 'Salary Credit', amount: baseIncome + rand(-1000, 1000), type: 'credit' });
    Object.entries(MERCHANTS).forEach(([, names]) => {
      names.forEach((name) => {
        if (Math.random() < 0.7) {
          const d = new Date(today.getFullYear(), today.getMonth() - m, rand(2, 27));
          txns.push({ date: fmtDate(d), description: name, amount: rand(150, 6000), type: 'debit' });
        }
      });
    });
  }
  return txns;
}
