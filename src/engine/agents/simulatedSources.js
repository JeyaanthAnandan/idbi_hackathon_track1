// ─────────────────────────────────────────────────────────────
// Stand-in providers for the onboarding demo. IDBI's sandbox only covers
// the bank's own accounts and loans; mutual funds (CAMS / KFintech CAS),
// demat, insurance and CKYC are not reachable from it. Each source here
// returns the shape the real provider would, tagged SIMULATED, so the
// agents and the trace are the production ones and only the data is not.
//
// The two customers match the IDBI sandbox test identities (priya / arjun)
// and the demo personas, so a run lines up with the rest of the prototype.
// ─────────────────────────────────────────────────────────────
import { TIERS, sleep } from './runtime.js';

const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];

function monthRows(month, rows) {
  return rows.map(([day, description, amount, type = 'debit']) => ({ date: `${month}-${String(day).padStart(2, '0')}`, description, amount, type }));
}

const PROFILES = {
  priya: {
    cif: '98655854', accountId: '660100100003', branchId: '105',
    kyc: { name: 'Priya Sharma', age: 29, city: 'Mumbai', segment: 'Salaried Professional', relationshipSince: 2019, kycRisk: 'Low', panLinked: true, ckycStatus: 'Verified' },
    savings: 264500,
    fd: { label: 'IDBI FD (2027 maturity)', value: 200000, growth: 7.1 },
    transactions: () => months.flatMap((m, i) => monthRows(m, [
      [1, 'Salary Credit - ACME TECH PAYROLL', i === 0 ? 103500 : 95000, 'credit'],
      [3, 'Rent - Landlord NEFT', 28000], [5, 'Electricity bill BEST', 1450], [5, 'Education Loan EMI', 8352],
      [7, 'BigBasket order', 4700], [21, 'BigBasket order', 4300],
      [9, 'Swiggy', i === 5 ? 6200 : 2400], [16, 'Zomato', i === 5 ? 5600 : 2100], [24, 'Swiggy', 1700],
      [12, 'Amazon shopping', i === 5 ? 9650 : 5200], [14, 'Uber trips', 2600], [26, 'Petrol HPCL', 2700],
      [10, 'SIP Mutual Fund - Nifty 50 Index', 5000], [10, 'SIP Mutual Fund - ELSS', 3000],
      [15, 'Netflix', 649], [15, 'Spotify', 199], [18, 'Cult fitness subscription', 486], [28, 'Apollo Pharmacy', 900],
    ])),
    loans: [{ maskedAccountNumber: '••••7781', productName: 'Education Loan', outstanding: 180000, rate: 10.5, emi: 8352 }],
    cas: [
      { type: 'Mutual Fund', label: 'Nifty 50 Index Fund (SIP)', value: 86400, cost: 58000, growth: 12.4, liquid: true, rta: 'CAMS', plan: 'Direct' },
      { type: 'Mutual Fund', label: 'ELSS Tax Saver Fund', value: 45000, cost: 26000, growth: 14.2, liquid: false, rta: 'KFintech', plan: 'Regular' },
    ],
    demat: [{ type: 'Gold', label: 'Sovereign Gold Bond', value: 31000, cost: 25000, growth: 9.8, liquid: false, depository: 'NSDL' }],
    fundFacts: {
      elss: { name: 'ELSS Tax Saver Fund', plan: 'Regular', er: 1.82, directEr: 0.72, monthlySip: 3000 },
      index: { name: 'Nifty 50 Index Fund', plan: 'Direct', er: 0.2, directEr: 0.2, monthlySip: 5000 },
      overlapPct: 62,
    },
    policies: [
      { insurer: 'LIC', type: 'Term life', cover: 2000000, premium: 9800, renewal: '2027-03-14' },
      { insurer: 'Star Health', type: 'Health (individual)', cover: 500000, premium: 11200, renewal: '2026-12-02' },
    ],
    // What the customer says when MITRA asks — scripted for the demo.
    declared: { 'household.dependents': 2, 'tax.regime': 'Old', 'tax.section80CUsed': 69000, 'cashflow.monthlyIncome': 95000, 'insurance.termCover': 2000000, 'risk.profile': 'Balanced' },
  },
  arjun: {
    cif: '77123456', accountId: '660100100004', branchId: '106',
    kyc: { name: 'Arjun Mehta', age: 45, city: 'Pune', segment: 'Self-Employed · Retail Business', relationshipSince: 2015, kycRisk: 'Medium', panLinked: true, ckycStatus: 'Verified · re-KYC due Mar 2027' },
    savings: 42000,
    fd: { label: 'IDBI FD (2028 maturity)', value: 180000, growth: 6.8 },
    transactions: () => months.flatMap((m, i) => monthRows(m, [
      [2, 'Business receipt - UPI collections', [72000, 58000, 81000, 54000, 76000, 67000][i], 'credit'],
      [4, 'Shop rent NEFT', 18500], [6, 'Business Loan EMI', 11200], [8, 'Wholesale supplier - inventory', [15400, 14800, 16400, 13600, 15900, 16000][i]],
      [11, 'Dmart grocery', 7100], [13, 'Petrol IOCL', 6500], [17, 'Zomato', i === 5 ? 4200 : 3000],
      [19, 'Family function', [3200, 2600, 5100, 2400, 3900, 4800][i]], [22, 'Apollo Pharmacy', 1300],
      [15, 'Hotstar subscription', 249], [15, 'POS software subscription', 999],
      ...(i === 2 || i === 5 ? [[10, 'SIP Mutual Fund - Nifty 50 Index', 3500]] : []),
    ])),
    loans: [{ maskedAccountNumber: '••••4410', productName: 'Business & Personal Loan', outstanding: 420000, rate: 15.5, emi: 11200 }],
    cas: [
      { type: 'Mutual Fund', label: 'Nifty 50 Index Fund (SIP)', value: 21000, cost: 17000, growth: 11.6, liquid: true, rta: 'CAMS', plan: 'Direct' },
      { type: 'Mutual Fund', label: 'ELSS Tax Saver Fund (Regular)', value: 28000, cost: 24000, growth: 9.5, liquid: false, rta: 'KFintech', plan: 'Regular' },
    ],
    demat: [],
    fundFacts: {
      elss: { name: 'ELSS Tax Saver Fund (Regular)', plan: 'Regular', er: 2.1, directEr: 0.85, monthlySip: 2000 },
      index: { name: 'Nifty 50 Index Fund', plan: 'Direct', er: 0.2, directEr: 0.2, monthlySip: 1500 },
      overlapPct: 48,
    },
    policies: [
      { insurer: 'HDFC Life', type: 'Term life', cover: 500000, premium: 4100, renewal: '2027-01-20' },
      { insurer: 'New India Assurance', type: 'Health (family floater)', cover: 200000, premium: 9600, renewal: '2026-11-08' },
    ],
    declared: { 'household.dependents': 3, 'tax.regime': 'Old', 'tax.section80CUsed': 24000, 'cashflow.monthlyIncome': 68000, 'insurance.termCover': 500000, 'risk.profile': 'Conservative' },
  },
};

export const ONBOARDING_CUSTOMERS = [
  { id: 'priya', label: 'Priya · salaried, Mumbai', cifHint: '••••5854' },
  { id: 'arjun', label: 'Arjun · self-employed, Pune', cifHint: '••••3456' },
];

export function simulatedProfile(customer) {
  const p = PROFILES[customer];
  if (!p) throw Object.assign(new Error('Unknown onboarding customer.'), { status: 422 });
  return p;
}

// Deterministic "network" latency so the trace reads like a real run.
function latency(seed) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 220 + (h % 520);
}

async function simulatedCall(ctx, parent, signal, { tool, api, args, summary }) {
  const ms = latency(tool + JSON.stringify(args || {}));
  const finish = ctx.begin(parent, { tool, api, args });
  await sleep(ms, signal);
  finish({ ms, tier: TIERS.SIMULATED, summary });
}

const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

// Every source the agents can call. The server swaps in live versions of
// `coreBanking` and `accountAggregator` when the IDBI sandbox is enabled;
// the rest stay simulated everywhere because IDBI exposes no such API.
export function simulatedTools(customer, { signal } = {}) {
  const p = simulatedProfile(customer);
  return {
    mode: 'simulated',
    who: { cif: p.cif, accountId: p.accountId, branchId: p.branchId },

    async kycLookup(ctx) {
      await sleep(latency('ckyc' + customer), signal);
      return {
        data: { ...p.kyc, cif: p.cif },
        tier: TIERS.SIMULATED,
        summary: `CKYC ${p.kyc.ckycStatus} · PAN linked · risk ${p.kyc.kycRisk}`,
      };
    },

    async coreBanking(ctx, callId) {
      const transactions = p.transactions();
      await simulatedCall(ctx, callId, signal, { tool: 'idbi.getCustomerAccountsByCustId', api: '394', args: { input: { acctType: 'SBA', branchId: p.branchId, cifId: p.cif } }, summary: '2 accounts · SBA + TDA' });
      await simulatedCall(ctx, callId, signal, { tool: 'idbi.performAccountEnquiry', api: '365', args: { acctId: p.accountId }, summary: `Active · INR · balance ${inr(p.savings)}` });
      const pages = Math.ceil(transactions.length / 60);
      for (let i = 0; i < pages; i++) {
        const rows = Math.min(60, transactions.length - i * 60);
        await simulatedCall(ctx, callId, signal, { tool: 'idbi.getFullAccountStatementWithPagination', api: '393', args: { input: { acid: p.accountId, fromDate: '2026-04-01', toDate: '2026-09-30', page: i + 1 } }, summary: `${rows} rows · hasMoreData=${i === pages - 1 ? 'N' : 'Y'}` });
      }
      await simulatedCall(ctx, callId, signal, { tool: 'idbi.accountLienEnquiry', api: '362', args: { input: { acctId: p.accountId, moduleType: 'DEPOSIT' } }, summary: 'No lien marked' });
      await simulatedCall(ctx, callId, signal, { tool: 'idbi.getLoanOverdueDetails', api: '402', args: { customerId: p.cif }, summary: `${p.loans.length} loan · no overdue` });
      const loans = p.loans.map((l) => ({ ...l, modellable: true, terms: { rate: l.rate, emi: l.emi }, npaStatus: 'SA', dpd: 0, overdueAmount: 0 }));
      return {
        tier: TIERS.SIMULATED,
        summary: `${transactions.length} transactions · 6 months · ${loans.length} loan`,
        data: {
          mode: 'SIMULATED_CORE_BANKING',
          transactions,
          holdings: [
            { type: 'Savings Account', label: 'IDBI Savings A/c', value: p.savings, growth: 3.0, liquid: true },
            { type: 'Fixed Deposit', label: p.fd.label, value: p.fd.value, growth: p.fd.growth, liquid: false },
          ],
          account: { accountId: p.accountId, cifId: p.cif, customerName: p.kyc.name, balance: p.savings, availableBalance: p.savings, currency: 'INR' },
          liabilities: { status: 'reported', loans, totalOutstanding: loans.reduce((s, l) => s + l.outstanding, 0), warnings: [] },
          dataAsOf: transactions.map((t) => t.date).sort().at(-1),
          warnings: [],
        },
      };
    },

    async accountAggregator(ctx, callId) {
      await simulatedCall(ctx, callId, signal, { tool: 'finpro.requestConsent', api: '590', args: { partyIdentifierType: 'MOBILE', productID: 'MITRA-WEALTH', fiTypes: ['DEPOSIT', 'MUTUAL_FUNDS', 'INSURANCE_POLICIES'] }, summary: 'consent_handle issued · PENDING' });
      await simulatedCall(ctx, callId, signal, { tool: 'finpro.getWebRedirectionURL', api: '592', args: { redirectUrl: 'https://mitra.idbi/consent/callback' }, summary: 'Redirect URL issued · customer approves in AA app' });
      await simulatedCall(ctx, callId, signal, { tool: 'finpro.getConsentList', api: '591', args: { partyIdentifierType: 'MOBILE' }, summary: 'Consent ACTIVE · 3 FI types · expires in 12 months' });
      return {
        tier: TIERS.SIMULATED,
        summary: 'Consent ACTIVE for deposits, mutual funds, insurance',
        data: { status: 'ACTIVE', consentId: `cns-${customer}-demo`, fiTypes: ['DEPOSIT', 'MUTUAL_FUNDS', 'INSURANCE_POLICIES'], expiresInMonths: 12, accounts: 1 },
      };
    },

    async casStatement(ctx, callId) {
      const byRta = (rta) => p.cas.filter((h) => h.rta === rta);
      await simulatedCall(ctx, callId, signal, { tool: 'cams.fetchCAS', args: { pan: 'ABCDE1234F', period: 'FY-to-date' }, summary: `${byRta('CAMS').length} folio · ${inr(byRta('CAMS').reduce((s, h) => s + h.value, 0))}` });
      await simulatedCall(ctx, callId, signal, { tool: 'kfintech.fetchCAS', args: { pan: 'ABCDE1234F', period: 'FY-to-date' }, summary: `${byRta('KFintech').length} folio · ${inr(byRta('KFintech').reduce((s, h) => s + h.value, 0))}` });
      await simulatedCall(ctx, callId, signal, { tool: 'nsdl.dematHoldings', args: { pan: 'ABCDE1234F' }, summary: p.demat.length ? `${p.demat.length} holding · ${inr(p.demat.reduce((s, h) => s + h.value, 0))}` : 'No demat holdings' });
      const holdings = [...p.cas, ...p.demat].map(({ rta: _r, depository: _d, plan: _p, ...h }) => h);
      return {
        tier: TIERS.SIMULATED,
        summary: `${holdings.length} holdings · ${inr(holdings.reduce((s, h) => s + h.value, 0))}`,
        data: { holdings, fundFacts: p.fundFacts, regularPlans: p.cas.filter((h) => h.plan === 'Regular').map((h) => h.label) },
      };
    },

    async insurancePolicies(ctx) {
      await sleep(latency('bima' + customer), signal);
      const term = p.policies.filter((x) => /term/i.test(x.type)).reduce((s, x) => s + x.cover, 0);
      const health = p.policies.filter((x) => /health/i.test(x.type)).reduce((s, x) => s + x.cover, 0);
      return {
        tier: TIERS.SIMULATED,
        summary: `${p.policies.length} policies · term ${inr(term)} · health ${inr(health)}`,
        data: { policies: p.policies, termCover: term, healthCover: health },
      };
    },

    async askCustomer(ctx, callId, questions) {
      const answers = {};
      for (const q of questions) {
        await sleep(latency('ask' + q.field), signal);
        if (p.declared[q.field] !== undefined) answers[q.field] = p.declared[q.field];
      }
      return {
        tier: TIERS.DECLARED,
        summary: `${Object.keys(answers).length} of ${questions.length} answered in MITRA chat (scripted for this demo)`,
        data: answers,
      };
    },

    narrate: null, // the flow falls back to the engine's own talking points
  };
}
