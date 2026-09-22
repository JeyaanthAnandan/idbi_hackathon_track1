// Regression cover for the three onboarding outcomes a customer can actually
// reach — no data at all (risk quiz only), one verified bank statement period
// (IDBI sandbox), and a complete synthetic profile — plus the screens that
// used to assume the third case was the only one.
//
// Each scenario runs in its own process: data/customer.js binds the active
// persona at module load, so personas cannot be swapped inside one runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// A trimmed capture of the live IDBI direct snapshot: one statement period,
// unlabelled narrations, and a statement running balance on a different scale
// from the reported account balance. Every trait here is the provider's, not
// an invention of the test.
const IDBI_SNAPSHOT = {
  mode: 'IDBI_SANDBOX_DIRECT',
  providerId: 'idbi-bank',
  dataAsOf: '2025-05-06',
  transactions: [
    { date: '2025-05-01', description: 'S1 TXN 1', amount: 2448.28, type: 'debit', sourceId: 'S11001', balance: 397551.72 },
    { date: '2025-05-02', description: 'S1 TXN 2', amount: 12787.79, type: 'debit', sourceId: 'S11002', balance: 384763.93 },
    { date: '2025-05-03', description: 'S1 TXN 3', amount: 11574.73, type: 'credit', sourceId: 'S11003', balance: 396338.66 },
    { date: '2025-05-04', description: 'S1 TXN 4', amount: 4198.50, type: 'debit', sourceId: 'S11004', balance: 392140.16 },
    { date: '2025-05-05', description: 'S1 TXN 5', amount: 7683.81, type: 'debit', sourceId: 'S11005', balance: 384456.35 },
    { date: '2025-05-06', description: 'S1 TXN 6', amount: 7017.62, type: 'credit', sourceId: 'S11006', balance: 391473.97 },
  ],
  holdings: [{ type: 'Savings Account', label: 'IDBI Savings Account', value: 56780.25, liquid: true, source: 'idbi:account-enquiry' }],
  warnings: [
    'Bank-only snapshot: investments, tax, insurance and complete liabilities are not connected.',
    'Statement balances and account-enquiry balances require reconciliation before financial recommendations.',
  ],
  coverage: { statementComplete: true, portfolioComplete: false, accountCount: 1, discoveredAccountCount: 1 },
  account: {
    accountId: '660100100003', cifId: '98655854', branchId: '105', currency: 'INR',
    balance: 56780.25, availableBalance: 55780.25, effectiveAvailableBalance: 50780.25, lienBalance: 5000, status: 'A',
  },
  provenance: { source: 'idbi-sandbox', apis: ['394:getCustomerAccountsByCustId', '365:performAccountEnquiry'] },
};

// `mode` is 'nodata' (quiz only), 'idbi' (one snapshot), or a demo persona id.
//
// Everything — engine modules and components alike — is pulled through Vite's
// SSR module graph via `load()`. A plain `await import()` would instantiate a
// second, separate copy of engine/api.js, so the bootstrap profile set on one
// copy would be invisible to the components rendered from the other, and every
// screen would silently fall back to the default demo persona.
function run(mode, body) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import fs from 'node:fs/promises';
    const memory = new Map();
    globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k,v) => memory.set(k,String(v)), removeItem: k => memory.delete(k) };
    globalThis.window = { location: { search: '' }, matchMedia: () => ({ matches: false, addEventListener(){}, removeEventListener(){} }), addEventListener(){}, removeEventListener(){}, dispatchEvent(){} };
    const mode = process.env.FLOW_MODE;
    const snapshot = JSON.parse(process.env.FLOW_SNAPSHOT);

    const vite = await (await import('vite')).createServer({ server: { middlewareMode: true }, appType: 'custom' });
    const load = (p) => vite.ssrLoadModule(p);
    const render = async (path, props) => renderToStaticMarkup(React.createElement((await load(path)).default, props));
    try {
      if (['priya','arjun'].includes(mode)) {
        localStorage.setItem('mitra_persona', mode);
      } else {
        const { buildCustomPersona } = await load('/src/engine/personaBuilder.js');
        const built = buildCustomPersona(mode === 'idbi'
          ? { name: 'Sandbox Customer', age: 34, holdings: snapshot.holdings, transactions: snapshot.transactions, sources: ['IDBI Bank'], snapshots: [snapshot] }
          : { name: 'Quiz Only Customer', age: 34 });
        globalThis.fetch = async () => new Response(JSON.stringify({
          available: true, session: { id: 'u1', name: 'Quiz Only Customer' },
          // The quiz path saves onboarding + risk but never a profile.
          profile: mode === 'idbi' ? { persona: built.persona, sources: ['IDBI Bank'] } : null,
          chat: [], onboarded: true, riskProfile: 'Balanced',
        }), { headers: { 'content-type': 'application/json' } });
        await (await load('/src/engine/api.js')).initializeApi();
      }
      ${body}
    } finally { await vite.close(); }
  `], {
    cwd: process.cwd(),
    env: { ...process.env, FLOW_MODE: mode, FLOW_SNAPSHOT: JSON.stringify(IDBI_SNAPSHOT) },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('quiz-only onboarding explains the missing data instead of quoting the policy gate', () => {
  run('nodata', `
    const { respond } = await load('/src/engine/advisor.js');
    for (const prompt of ['hello', 'analyse my spending', 'invest my surplus', 'financial health score', 'round-up', 'rebalance my portfolio']) {
      const r = respond(prompt, 'Balanced');
      assert.ok(r?.text, prompt);
      // The old wording leaked the policy identifier and an observed-month
      // count into a session that had never supplied a statement.
      assert.doesNotMatch(r.text, /wealth-policy@/, prompt);
      assert.doesNotMatch(r.text, /0 observed transaction month/, prompt);
      // Nothing is connected, so no figure may be asserted as a finding.
      assert.doesNotMatch(r.text, /₹0\\b/, prompt);
      assert.match(r.text, /no (?:connected )?account|not connected|no balances/i, prompt);
      assert.ok(r.chips?.length, prompt);
    }
    // Concept answers and self-supplied what-ifs still work with no data.
    assert.match(respond('calculate 5000 for 10 years', 'Balanced').text, /₹5,000\\/month for 10 years/);
  `);
});

test('quiz-only onboarding routes to data capture rather than straight into chat', () => {
  run('nodata', `
    let connected = 0, skipped = 0;
    const markup = await render('/src/components/Onboarding.jsx', {
      onDone: () => { skipped += 1; }, onConnect: () => { connected += 1; }, onUpload: () => {},
    });
    assert.match(markup, /Question 01 \\/ 04/);
    const { riskQuestions } = await load('/src/data/customer.js');
    assert.equal(riskQuestions.length, 4);
    // The closing screen must offer data capture, not only "meet MITRA".
    const source = await fs.readFile('src/components/Onboarding.jsx', 'utf8');
    assert.match(source, /Connect IDBI sandbox data/);
    assert.match(source, /Upload a CSV statement/);
    assert.doesNotMatch(source, /Meet MITRA, my advisor/);
    // And the stated risk profile must survive the handover to the data step.
    const choice = await fs.readFile('src/components/OnboardingChoice.jsx', 'utf8');
    assert.match(choice, /riskProfileOverride=\\{statedRisk\\}/);
  `);
});

test('one IDBI statement period answers balance composition without claiming a trend', () => {
  run('idbi', `
    const { respond } = await load('/src/engine/advisor.js');
    const balances = respond('What is usable right now?', 'Balanced');
    // Every figure below is reported by the account-enquiry API.
    assert.match(balances.text, /₹56,780/);   // reported
    assert.match(balances.text, /₹55,780/);   // available
    assert.match(balances.text, /₹50,780/);   // effective available, the usable one
    assert.match(balances.text, /₹5,000/);    // lien
    assert.match(balances.text, /under lien/i);
    assert.match(balances.text, /not a figure I derived/i);
    assert.ok(balances.why?.length, 'balance answer carries its provenance');
    // Same intent from a customer's own phrasing.
    assert.match(respond('how much can i spend', 'Balanced').text, /₹50,780/);

    // The greeting must advertise only what one period supports.
    const hello = respond('hello', 'Balanced');
    assert.match(hello.text, /will not score your finances|not .*propose an amount/i);
    assert.ok(hello.chips.includes('What is usable right now?'));
  `);
});

test('the IDBI spending answer discloses its own uncategorised and unreconciled data', () => {
  run('idbi', `
    const { respond } = await load('/src/engine/advisor.js');
    const spending = respond('analyse my spending', 'Balanced');
    // Running balances (≈₹390K) and the reported balance (₹56,780) are on
    // different scales; narrating both without saying so is the contradiction.
    assert.match(spending.text, /not reconciled|different scales/i);
    // Every narration is 'S1 TXN n', so there is no category breakdown to give.
    assert.match(spending.text, /uncategorised|unlabelled/i);
    assert.match(spending.text, /cannot estimate salary/i);
  `);
});

test('unsupported IDBI requests name the missing input and offer what does work', () => {
  run('idbi', `
    const { respond } = await load('/src/engine/advisor.js');
    for (const prompt of ['financial health score', 'invest my surplus', 'rebalance my portfolio']) {
      const r = respond(prompt, 'Balanced');
      assert.match(r.text, /identifiable income credit/i, prompt);
      assert.match(r.text, /4 months of history \\(I have 1\\)/, prompt);
      assert.match(r.text, /investments outside this bank/i, prompt);
      assert.doesNotMatch(r.text, /, and .*, and /, prompt); // readable list, not repeated "and"
      // Chips must lead somewhere answerable rather than back into a refusal.
      assert.ok(r.chips.includes('What is usable right now?'), prompt);
      assert.ok(!r.chips.includes('Invest my surplus'), prompt);
    }
    // A bank-only portfolio answer must not chip at surplus/goals either.
    const portfolio = respond('show my portfolio', 'Balanced');
    assert.ok(!portfolio.chips.includes('Invest my surplus'));
    assert.ok(portfolio.chips.includes('What is usable right now?'));
  `);
});

test('Time Machine projects a stated contribution instead of refusing bank-only data', () => {
  run('idbi', `
    const markup = await render('/src/components/Simulator.jsx', { onAsk() {} });
    assert.doesNotMatch(markup, /More data needed for a personal projection/);
    assert.match(markup, /Projected wealth at 60/);
    assert.match(markup, /type="range"/);                  // the lever still works
    // A freedom age needs a real expense baseline, which this data lacks.
    assert.doesNotMatch(markup, /Age of financial freedom/);
    assert.doesNotMatch(markup, /25× expenses/);
    // Apostrophes arrive HTML-escaped from renderToStaticMarkup, so match around it.
    assert.match(markup, /show an age of financial freedom/i);
    assert.match(markup, /needs a real monthly expense baseline/i);

    const { projectWealth } = await load('/src/engine/analytics.js');
    const stated = projectWealth({ extraMonthly: 10000, annualRatePct: 11, expenseBaselineKnown: false });
    assert.equal(stated.fireAge, null);
    assert.equal(stated.freedomAvailable, false);
    assert.ok(stated.series.every(p => p.freedomTarget === null));
    // The projection itself must still compound the connected balance.
    assert.ok(stated.wealthAt60 > 56780);
    assert.doesNotMatch(JSON.stringify(stated), /NaN|Infinity/);
  `);
});

test('a complete profile keeps the freedom age and drops only past life events', () => {
  run('priya', `
    const markup = await render('/src/components/Simulator.jsx', { onAsk() {} });
    assert.match(markup, /Age of financial freedom/);
    assert.match(markup, /25× expenses/);
    assert.doesNotMatch(markup, /Projected wealth at 60/);
    // Priya is 29, so every milestone is still ahead of her.
    for (const label of ['Wedding 31', 'Child 33', 'Home 35', 'Parents 45']) assert.ok(markup.includes(label), label);
  `);
  run('arjun', `
    const markup = await render('/src/components/Simulator.jsx', { onAsk() {} });
    // Arjun is 45: projectWealth never applies an event at or before the start
    // age, so those toggles would render dead. They must not render at all.
    for (const label of ['Wedding 31', 'Child 33', 'Home 35', 'Parents 45']) {
      assert.ok(!markup.includes(label), label + ' must not render for a 45-year-old');
    }
  `);
});

test('dashboard copy is derived from the active customer, never a demo persona', () => {
  run('idbi', `
    const { healthScore } = await load('/src/engine/analytics.js');
    const { goals } = await load('/src/data/customer.js');
    const goalNote = healthScore().parts.find(p => p.label === 'Goal Readiness').note;
    assert.equal(goals.length, 0);
    assert.doesNotMatch(goalNote, /your 4 goals/);
    assert.match(goalNote, /No goals recorded yet/);

    const home = await render('/src/components/BankHome.jsx', { onOpenMitra() {}, onAsk() {}, riskProfile: 'Balanced' });
    // Don't announce a finding above a line that asks for data.
    assert.doesNotMatch(home, /MITRA found something/);
    assert.match(home, /MITRA needs one more thing/);
    // The Ledger only exists in the desktop shell; the phone nav has no route.
    assert.doesNotMatch(home, /Open the Ledger/);

    const wealth = await render('/src/components/WealthDashboard.jsx', { onAsk() {}, riskProfile: 'Balanced' });
    for (const leak of ['₹8,000', '₹2,00,000', '₹10,000/mo']) {
      assert.ok(!wealth.includes(leak), 'Money Rules must not hardcode ' + leak);
    }
  `);

  run('priya', `
    const { healthScore } = await load('/src/engine/analytics.js');
    assert.match(healthScore().parts.find(p => p.label === 'Goal Readiness').note, /your 4 goals/);
    // With real income the banner is allowed to claim a finding again.
    const home = await render('/src/components/BankHome.jsx', { onOpenMitra() {}, onAsk() {}, riskProfile: 'Balanced' });
    assert.match(home, /MITRA found something/);
  `);
});

test('the Account Aggregator consent control stays disabled', () => {
  run('idbi', `
    const source = await fs.readFile('src/components/ConnectAccounts.jsx', 'utf8');
    assert.match(source, /Account Aggregator consent · unavailable/);
    assert.match(source, /ghost-btn[\\s\\S]{0,160}disabled/);
    assert.doesNotMatch(source, /Try Account Aggregator consent/);
    assert.doesNotMatch(source, /fixture defect/);
  `);
});
