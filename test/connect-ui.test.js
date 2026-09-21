import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Rendered through Vite's SSR graph (one copy of engine/api.js — see data-coverage-flows.test.js).
function run(connectors, body, snapshot = null) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    const memory = new Map();
    globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) };
    globalThis.window = { location: { search: '' }, matchMedia: () => ({ matches: false, addEventListener(){}, removeEventListener(){} }), addEventListener(){}, removeEventListener(){}, dispatchEvent(){} };
    const vite = await (await import('vite')).createServer({ server: { middlewareMode: true }, appType: 'custom' });
    const load = (p) => vite.ssrLoadModule(p);
    try {
      let profile = null;
      if (process.env.SNAPSHOT) {
        const snapshot = JSON.parse(process.env.SNAPSHOT);
        const { buildCustomPersona } = await load('/src/engine/personaBuilder.js');
        profile = { persona: buildCustomPersona({ name: 'Tester', transactions: snapshot.transactions, holdings: snapshot.holdings, snapshots: [snapshot] }).persona, sources: ['sandbox:IDBI'] };
      }
      globalThis.fetch = async () => new Response(JSON.stringify({
        available: true, session: { id: 'u1', name: 'Tester' }, profile, chat: [], onboarded: true, riskProfile: 'Balanced',
        connectors: JSON.parse(process.env.CONNECTORS),
      }), { headers: { 'content-type': 'application/json' } });
      await (await load('/src/engine/api.js')).initializeApi();
      const mod = await load('/src/components/ConnectAccounts.jsx');
      const markupOf = (Component, props = {}) => renderToStaticMarkup(React.createElement(Component, props));
      ${body}
      console.log('ok');
    } finally { await vite.close(); }
  `], { cwd: process.cwd(), env: { ...process.env, CONNECTORS: JSON.stringify(connectors), ...(snapshot ? { SNAPSHOT: JSON.stringify(snapshot) } : { SNAPSHOT: '' }) }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

const TWO = { idbi: { enabled: true, mode: 'SANDBOX', customers: [{ id: 'priya', label: 'Priya Patil' }, { id: 'arjun', label: 'Arjun Mehta' }], defaultCustomer: 'priya' } };

test('the Connect screen offers each sandbox customer, defaulting to the server default', () => {
  assert.equal(run(TWO, `
    const html = markupOf(mod.default, { onBack() {} });
    assert.match(html, /role="radiogroup"[^>]*aria-label="Sandbox customer"/);
    assert.match(html, /role="radio"[^>]*aria-checked="true"[^>]*>Priya Patil</);
    assert.match(html, /role="radio"[^>]*aria-checked="false"[^>]*>Arjun Mehta</);
    assert.doesNotMatch(html, /role="radio"[^>]*disabled/);
    // the copy names what is actually fetched now
    assert.match(html, /accounts, balances, lien, statement, loans and credit exposure/);
  `), 'ok');
});

test('a single configured customer shows no chooser, and a disabled connector disables the choice', () => {
  const one = { idbi: { ...TWO.idbi, customers: [TWO.idbi.customers[0]] } };
  assert.equal(run(one, `assert.doesNotMatch(markupOf(mod.default, { onBack() {} }), /Sandbox customer/);`), 'ok');
  const off = { idbi: { ...TWO.idbi, enabled: false } };
  assert.equal(run(off, `
    const html = markupOf(mod.default, { onBack() {} });
    assert.match(html, /role="radio"[^>]*disabled/);
    assert.match(html, /connector is disabled on this server/);
  `), 'ok');
});

test('the loans block shows every itemised loan, the exposure gap and the warnings, and nothing when absent', () => {
  assert.equal(run(TWO, `
    const idbi = await load('/server/idbi.mjs');
    const rows = idbi.mapLoanRows({ overdueDetails: [
      { customerId: 'C-1', accountId: '660100100003', outstandingBal: '3754903', dpd: '0', npaStatus: 'SA', totalOverdueAmt: '0', overdueDate: 'NULL', npaDate: 'NULL' },
      { customerId: 'C-1', accountId: '094651100000064', outstandingBal: '674623.83', dpd: '0', npaStatus: 'SA', totalOverdueAmt: '0', overdueDate: 'NULL', npaDate: 'NULL' },
    ] }, 'C-1');
    rows[0].terms = { rate: 8.75, emi: 16800, tenureMonths: 240, disbursed: 1500000 };
    const liabilities = idbi.buildLiabilities({ loans: rows, exposure: { customerId: 'C-1', totalLimit: 11821212, fundedLimit: 7249562.75, totalOutstanding: 7249562.75 }, customerId: 'C-1' });
    const html = markupOf(mod.LiabilitiesSummary, { liabilities });
    assert.match(html, /Loans reported by IDBI · 2 accounts/);
    assert.match(html, /₹44,29,527 outstanding · all standard, none overdue/);
    assert.match(html, /…0003<\\/td><td>₹37,54,903<\\/td><td>0<\\/td><td>Standard<\\/td><td>8\\.75% · EMI ₹16,800/);
    assert.match(html, /…0064<\\/td><td>₹6,74,624<\\/td>.*No terms/);
    assert.match(html, /exposure summary: ₹72,49,563 outstanding of ₹1,18,21,212 sanctioned/);
    // the reconciliation failures are on screen, in the warning colour, before anything is saved
    assert.match(html, /exceeds the ₹15,00,000 disbursed/);
    assert.match(html, /EMI is below the ₹27,380 monthly interest/);
    assert.match(html, /cannot be attributed to a loan/);
    assert.equal(markupOf(mod.LiabilitiesSummary, { liabilities: null }), '');
    assert.equal(markupOf(mod.LiabilitiesSummary, {}), '');
  `), 'ok');
});

// ── the status banner every screen shows ──────────────────────────────────
const SNAPSHOT = {
  mode: 'IDBI_SANDBOX_DIRECT', providerId: 'idbi-bank', fetchedAt: '2026-09-21T10:00:00.000Z', dataAsOf: '2025-05-20',
  transactions: [{ date: '2025-05-01', description: 'S1 TXN 1', amount: 100, type: 'debit' }, { date: '2025-05-02', description: 'S1 TXN 2', amount: 300, type: 'credit' }],
  holdings: [{ type: 'Savings Account', label: 'IDBI Savings Account', value: 56780.25, liquid: true }],
  coverage: { statementComplete: true, portfolioComplete: false },
  account: { balance: 56780.25, availableBalance: 55780.25, effectiveAvailableBalance: 50780.25, lienBalance: 5000, lien: { amount: 5000, endDate: '2027-07-08' } },
  warnings: [],
};
const withLoans = (snapshot) => ({
  ...snapshot,
  liabilities: {
    status: 'reported', customerRef: 'C-1', totalOutstanding: 700000, allStandard: true, exposure: null, unitemisedOutstanding: null, reconciled: false, warnings: [],
    loans: [{ accountId: 'A1', maskedAccountNumber: '…0001', outstanding: 600000, dpd: 0, overdueAmount: 0, npaStatus: 'SA', terms: null, issues: [], modellable: false },
            { accountId: 'A2', maskedAccountNumber: '…0002', outstanding: 100000, dpd: 0, overdueAmount: 0, npaStatus: 'SA', terms: null, issues: [], modellable: false }],
  },
});

test('the banner reports connected loans and the lien, and never claims loan details are missing when they are not', () => {
  assert.equal(run(TWO, `
    const html = markupOf((await load('/src/components/DataStatus.jsx')).default, { onAsk() {}, onConnect() {} });
    assert.match(html, /Loans reported by IDBI: 2 accounts · ₹7,00,000 outstanding · all standard, none overdue/);
    assert.match(html, /₹5,000 of your balance is held under lien until 8 Jul 2027, so it is not spendable/);
    assert.match(html, />Ask MITRA</);
    assert.match(html, /Tax, insurance and investments outside IDBI are not connected/);
    assert.doesNotMatch(html, /loan details/);
  `, withLoans(SNAPSHOT)), 'ok');
});

test('with no loan data the banner still says loan details are missing, and offers no loan line', () => {
  assert.equal(run(TWO, `
    const html = markupOf((await load('/src/components/DataStatus.jsx')).default, { onAsk() {}, onConnect() {} });
    assert.doesNotMatch(html, /Loans reported by IDBI/);
    assert.match(html, /Tax, insurance and loan details are not connected/);
  `, SNAPSHOT), 'ok');
});

test('the banner explains why analytics are off on unlabelled sandbox rows and points to the full demo', () => {
  assert.equal(run(TWO, `
    const html = markupOf((await load('/src/components/DataStatus.jsx')).default, { onConnect() {} });
    assert.match(html, /<summary[^>]*>Why is some data unavailable\\?<\\/summary>/);
    assert.match(html, /carry no salary, merchant or category labels/);
    assert.match(html, /href="\\?demo=1"[^>]*>Preview the full demo customer \\(synthetic\\)/);
    // the loan line is optional: without an onAsk handler there is no dead button
    assert.doesNotMatch(html, />Ask MITRA</);
  `, SNAPSHOT), 'ok');
});
