import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  assessLoan, buildLiabilities, fetchIdbiDirectSnapshot, mapExposure, mapLien, mapLoanRows, mapLoanTerms,
  resolveSandboxCustomer, statementWindow, listSandboxCustomers,
} from '../server/idbi.mjs';
import { buildCustomPersona, monthsToClear } from '../src/engine/personaBuilder.js';
import { validPersona } from '../server/validation.mjs';

// ── fixtures shaped like the real sandbox responses ───────────────────────
const enquiry = {
  acctId: 'A1', acctType: { schmCode: 'SB002', schmType: 'SAVINGS' }, acctCurr: 'INR', custId: 'C-1', personName: { name: 'TESTPERSON' },
  bankInfo: { bankId: 'IDBI001', branchId: '105', postAddr: { addr1: '1 Road', city: 'PUNE', postalCode: '411001', addrType: 'REGISTERED' } },
  bankAcctStatusCode: 'A',
  acctBal: [
    { balType: 'LEDGER', balAmt: { amountValue: '1000' } }, { balType: 'AVAIL', balAmt: { amountValue: '900' } },
    { balType: 'EFFAVL', balAmt: { amountValue: '850' } }, { balType: 'LIEN', balAmt: { amountValue: '100' } },
  ],
};
const statement = {
  result: {
    hasMoreData: 'N', accountBalances: { acid: 'A1' },
    transactionDetails: [{ txnId: 't1', txnSrlNo: '1', pstdDate: '2025-05-03', txnBalance: { amountValue: '1000' }, transactionSummary: { txnDate: '2025-05-03', txnType: 'C', txnAmt: { amountValue: '200' }, txnDesc: 'S1 TXN 1' } }],
  },
};
const lienReply = (over = {}) => ({ result: { acctId: 'A1', bankInfo: { lienDetails: { newLienAmt: { amountValue: '100' }, lienDate: { startDate: '2026-07-09', endDate: '2027-07-08' }, reasonCode: 'ACCOUNT_LIEN', isDeleted: 'N', lienId: 'L1', ...over } } } });
const exposureReply = (outstanding = '900000', over = {}) => ({ customerSummary: { custCifId: 'CIF-1', customerID: 'C-1', ...over }, exposureSummary: { totalLimit: { amount: '5000000' }, fundedLimit: { amount: outstanding }, totalOutstanding: { amount: outstanding } } });
const loanRow = (over = {}) => ({ customerId: 'C-1', accountId: 'A1', outstandingBal: '600000', dpd: '0', npaStatus: 'SA', totalOverdueAmt: '0', overdueDate: 'NULL', npaDate: 'NULL', ...over });
const loanList = (rows = [loanRow(), loanRow({ accountId: 'L2', outstandingBal: '100000' })]) => ({ overdueDetails: rows });
const detailsReply = (over = {}) => ({
  result: {
    loanAcctId: { acctId: 'A1' }, custId: { custId: 'C-1' }, netIntRate: { value: '8' }, acctOpenDt: '2018-04-18T00:00:00.000',
    amtAlreadyDisb: { amountValue: '1000000' },
    loanGenDetails: { loanAmt: { amountValue: '1200000' }, pmtPlan: { repmtRec: [{ noOfInstall: '240', flowAmt: { amountValue: '20000' } }] } },
    ...over,
  },
});
const CORE = {
  getCustomerAccountsByCustIdtest: { customerAccountInfo: [{ acctNumber: 'A1', acctBalance: { amountValue: '1000' }, acctCurrCode: 'INR' }] },
  performAccountEnquirytest: enquiry,
  getFullAccountStatementWithPaginationtest: statement,
};
const FULL = {
  ...CORE,
  accountLienEnquirytest: lienReply(),
  fetchCustomerLimitDetailstest: exposureReply(),
  getLoanOverdueDetailstest: loanList(),
  getLoanAccountDetailstest: detailsReply(),
};
const IDENTITY = { accountId: 'A1', cifId: 'CIF-1', branchId: '105', now: new Date('2026-09-21T10:00:00Z') };

// Routes not present in `routes` answer like the sandbox does for an unknown key.
function routeFetch(t, routes) {
  const log = [];
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const route = String(url).split('/Development/')[1];
    log.push({ route, body: init?.body ? JSON.parse(init.body) : null });
    return routes[route] === undefined
      ? new Response(JSON.stringify({ message: 'Data not found' }), { status: 400 })
      : new Response(JSON.stringify(routes[route]));
  });
  return log;
}

// ── mappers ───────────────────────────────────────────────────────────────
test('lien: an active lien maps, a released one is no lien, a foreign or malformed one is refused', () => {
  const lien = mapLien(lienReply(), 'A1');
  assert.deepEqual({ amount: lien.amount, endDate: lien.endDate, reason: lien.reason }, { amount: 100, endDate: '2027-07-08', reason: 'ACCOUNT_LIEN' });
  assert.equal(mapLien(lienReply({ isDeleted: 'Y' }), 'A1'), null);
  assert.equal(mapLien({ result: { acctId: 'A1', bankInfo: {} } }, 'A1'), null);
  assert.throws(() => mapLien(lienReply(), 'A2'), /different account/);
  assert.throws(() => mapLien(lienReply({ newLienAmt: { amountValue: '-5' } }), 'A1'), /invalid lien/);
});

test('loan rows: fields are validated and a row belonging to another customer stops the whole import', () => {
  const [row] = mapLoanRows(loanList([loanRow({ accountId: '660100100003' })]), 'C-1');
  assert.equal(row.maskedAccountNumber, '…0003');
  assert.equal(row.outstanding, 600000);
  assert.equal(row.overdueSince, null); // the API's literal "NULL" is not a date
  for (const bad of [{ outstandingBal: '' }, { outstandingBal: '-1' }, { dpd: 'x' }, { totalOverdueAmt: null }, { accountId: '' }]) {
    assert.throws(() => mapLoanRows(loanList([loanRow(bad)]), 'C-1'), /invalid loan record/);
  }
  assert.throws(() => mapLoanRows(loanList([loanRow(), loanRow({ customerId: 'someone-else' })]), 'C-1'), /another customer/);
  assert.throws(() => mapLoanRows({}, 'C-1'), /overdueDetails/);
});

test('exposure and contract terms are bound to the requested customer and account', () => {
  assert.equal(mapExposure(exposureReply(), 'CIF-1').totalOutstanding, 900000);
  assert.throws(() => mapExposure(exposureReply(), 'CIF-9'), /different customer/);
  const terms = mapLoanTerms(detailsReply(), 'A1', 'C-1');
  assert.deepEqual({ rate: terms.rate, emi: terms.emi, tenureMonths: terms.tenureMonths, disbursed: terms.disbursed, openedOn: terms.openedOn }, { rate: 8, emi: 20000, tenureMonths: 240, disbursed: 1000000, openedOn: '2018-04-18' });
  assert.throws(() => mapLoanTerms(detailsReply(), 'A2', 'C-1'), /different account/);
  assert.throws(() => mapLoanTerms(detailsReply(), 'A1', 'C-9'), /another customer/);
  assert.equal(mapLoanTerms(detailsReply({ netIntRate: { value: '' }, loanGenDetails: {} }), 'A1', 'C-1'), null);
});

// ── the sanity check that decides whether a loan may drive repayment maths ──
test('a loan is only modellable when its own figures can describe one being repaid', () => {
  const base = { accountId: 'A1', maskedAccountNumber: '…0001', outstanding: 600000, dpd: 0, overdueAmount: 0, npaStatus: 'SA' };
  const terms = { rate: 8, emi: 20000, tenureMonths: 240, disbursed: 1000000 };
  assert.equal(assessLoan({ ...base, terms }).modellable, true);
  assert.deepEqual(assessLoan({ ...base, terms: null }).issues.map((i) => i.code), ['NO_TERMS']);
  // the two ways both real sandbox customers fail: more owed than was ever lent, and an EMI below a month's interest
  const overOwed = assessLoan({ ...base, outstanding: 3754903, terms: { rate: 8.75, emi: 16800, tenureMonths: 240, disbursed: 1500000 } });
  assert.equal(overOwed.modellable, false);
  assert.deepEqual(overOwed.issues.map((i) => i.code), ['OUTSTANDING_EXCEEDS_DISBURSED', 'EMI_BELOW_INTEREST']);
  assert.match(overOwed.issues[1].message, /₹16,800 EMI is below the ₹27,380 monthly interest/);
  assert.equal(assessLoan({ ...base, outstanding: 0, terms }).modellable, false); // a closed loan has nothing to model
});

test('liabilities: totals, standard-status flag, exposure gap and warnings that stay on the loans', () => {
  const rows = mapLoanRows(loanList(), 'C-1');
  rows[0].terms = mapLoanTerms(detailsReply(), 'A1', 'C-1');
  const built = buildLiabilities({ loans: rows, exposure: mapExposure(exposureReply(), 'CIF-1'), customerId: 'C-1' });
  assert.equal(built.totalOutstanding, 700000);
  assert.equal(built.allStandard, true);
  assert.equal(built.unitemisedOutstanding, 200000);
  assert.equal(built.reconciled, false);
  assert.ok(built.warnings.some((w) => /₹9,00,000 outstanding across all facilities.*₹7,00,000 is itemised.*₹2,00,000/.test(w)));
  assert.ok(built.warnings.some((w) => /1 of 2 loans has no contract terms/.test(w)));
  // one overdue loan flips the flag
  const late = buildLiabilities({ loans: mapLoanRows(loanList([loanRow({ dpd: '45', totalOverdueAmt: '12000', npaStatus: 'SM' })]), 'C-1'), exposure: null, customerId: 'C-1' });
  assert.equal(late.allStandard, false);
});

test('customer registry: known ids resolve, unknown ones are refused, and the window covers both customers', () => {
  assert.deepEqual(listSandboxCustomers().map((c) => c.id), ['priya', 'arjun']);
  assert.equal(resolveSandboxCustomer('arjun').accountId, '660100100004');
  assert.equal(resolveSandboxCustomer().accountId, resolveSandboxCustomer('priya').accountId);
  for (const bad of ['nobody', '__proto__', 'constructor', 7, null]) assert.throws(() => resolveSandboxCustomer(bad), /Unknown sandbox customer/);
  const { fromDate, toDate } = statementWindow(new Date('2026-09-21T10:00:00Z'));
  assert.deepEqual({ fromDate, toDate }, { fromDate: '2024-09-21', toDate: '2026-09-21' });
  assert.ok(fromDate < '2025-05-01' && toDate > '2025-06-20'); // Priya's May and Arjun's June rows both fall inside
  assert.deepEqual(statementWindow(new Date('2026-09-21'), { fromDate: '2025-01-01', toDate: '2025-02-01' }), { fromDate: '2025-01-01', toDate: '2025-02-01' });
});

// ── the full adapter ──────────────────────────────────────────────────────
test('snapshot chains lien, exposure, loans and terms from the enquiry — not from sample bodies', async (t) => {
  const log = routeFetch(t, FULL);
  const snap = await fetchIdbiDirectSnapshot(IDENTITY);
  assert.equal(snap.account.lien.endDate, '2027-07-08');
  assert.equal(snap.liabilities.loans.length, 2);
  assert.equal(snap.liabilities.loans[0].modellable, true);
  assert.equal(snap.liabilities.loans[1].terms, null);
  assert.equal(snap.liabilities.exposure.totalOutstanding, 900000);
  assert.equal(snap.coverage.liabilities.status, 'reported');
  assert.equal(snap.coverage.portfolioComplete, false);
  assert.equal(snap.dataAsOf, '2025-05-03'); // latest transaction, not the window's end date
  for (const api of ['362:accountLienEnquiry', '402:getLoanOverdueDetails', '442:fetchCustomerLimitDetails', '391:getLoanAccountDetails']) assert.ok(snap.provenance.apis.includes(api), api);
  // loan warnings live with the loans; the snapshot's own warnings stay about balances
  assert.ok(!snap.warnings.some((w) => /Loan …|exposure summary/.test(w)));
  assert.ok(snap.liabilities.warnings.length > 0);

  const by = (route) => log.find((entry) => entry.route === route).body;
  // rebuilt from the enquiry's own scheme and registered address
  assert.equal(by('accountLienEnquirytest').input.acctType.schmCode, 'SB002');
  assert.equal(by('accountLienEnquirytest').input.bankInfo.postAddr.postalCode, '411001');
  // the loan-side customer id is taken from the enquiry, and loans are looked up by the CIF
  assert.equal(by('getLoanAccountDetailstest').input.custId.custId, 'C-1');
  assert.equal(by('getLoanAccountDetailstest').input.loanAcctId.bankInfo.postAddr.addrType, 'Office');
  assert.equal(by('getLoanOverdueDetailstest').customerId, 'CIF-1');
  assert.equal(by('fetchCustomerLimitDetailstest').custCifId, 'CIF-1');
  // and the statement window is two years to today rather than a pinned month
  assert.equal(by('getFullAccountStatementWithPaginationtest').input.fromDate, '2024-09-21T00:00:00.000');
  assert.equal(by('getFullAccountStatementWithPaginationtest').input.toDate, '2026-09-21T23:59:59.999');
});

test('a failing enrichment degrades to a stated gap and never costs the statement import', async (t) => {
  // no loan list at all
  routeFetch(t, { ...FULL, getLoanOverdueDetailstest: undefined });
  const noLoans = await fetchIdbiDirectSnapshot(IDENTITY);
  assert.equal(noLoans.transactions.length, 1);
  assert.equal(noLoans.liabilities, null);
  assert.equal(noLoans.coverage.liabilities.status, 'unavailable');
  assert.ok(noLoans.warnings.some((w) => /liabilities are not reflected/.test(w)));
  assert.equal(noLoans.account.lien.amount, 100); // the other enrichment is unaffected
});

test('loans matched to the wrong customer are refused outright, not partially imported', async (t) => {
  routeFetch(t, { ...FULL, getLoanOverdueDetailstest: loanList([loanRow(), loanRow({ customerId: 'C-999' })]) });
  const snap = await fetchIdbiDirectSnapshot(IDENTITY);
  assert.equal(snap.liabilities, null);
  assert.equal(snap.transactions.length, 1);
});

test('lien, exposure and terms failures each leave the rest intact and say what is missing', async (t) => {
  routeFetch(t, { ...FULL, accountLienEnquirytest: undefined });
  const noLien = await fetchIdbiDirectSnapshot(IDENTITY);
  assert.equal(noLien.account.lien, null);
  assert.equal(noLien.account.lienBalance, 100); // the balance-level figure survives
  assert.ok(noLien.warnings.some((w) => /Lien start\/end dates could not be retrieved/.test(w)));
  assert.equal(noLien.liabilities.loans.length, 2);

  routeFetch(t, { ...FULL, fetchCustomerLimitDetailstest: undefined });
  const noExposure = await fetchIdbiDirectSnapshot(IDENTITY);
  assert.equal(noExposure.liabilities.exposure, null);
  assert.equal(noExposure.liabilities.unitemisedOutstanding, null);
  assert.ok(noExposure.liabilities.warnings.some((w) => /exposure summary could not be retrieved/.test(w)));

  routeFetch(t, { ...FULL, getLoanAccountDetailstest: undefined });
  const noTerms = await fetchIdbiDirectSnapshot(IDENTITY);
  assert.equal(noTerms.liabilities.loans[0].terms, null);
  assert.equal(noTerms.liabilities.loans[0].modellable, false);
  assert.ok(noTerms.liabilities.warnings.some((w) => /Contract terms for loan …A1 could not be retrieved/.test(w)));
});

test('an exposure summary naming a different customer id than the loans is ignored', async (t) => {
  routeFetch(t, { ...FULL, fetchCustomerLimitDetailstest: exposureReply('900000', { customerID: 'C-999' }) });
  const snap = await fetchIdbiDirectSnapshot(IDENTITY);
  assert.equal(snap.liabilities.exposure, null);
  assert.ok(snap.liabilities.warnings.some((w) => /ignored.*different customer id/.test(w)));
});

test('a lien API that disagrees with the account enquiry is flagged as unreconciled', async (t) => {
  routeFetch(t, { ...FULL, accountLienEnquirytest: lienReply({ newLienAmt: { amountValue: '250' } }) });
  const snap = await fetchIdbiDirectSnapshot(IDENTITY);
  assert.ok(snap.warnings.some((w) => /lien API reports ₹250 but the account enquiry reports ₹100/.test(w)));
});

test('the core statement stays fail-closed', async (t) => {
  routeFetch(t, { ...FULL, getFullAccountStatementWithPaginationtest: undefined });
  await assert.rejects(fetchIdbiDirectSnapshot(IDENTITY), /failed \(400\)/);
});

test('a named sandbox customer switches identity; an unknown one never reaches the gateway', async (t) => {
  const log = routeFetch(t, { ...FULL, getCustomerAccountsByCustIdtest: { customerAccountInfo: [{ acctNumber: '660100100004', acctBalance: { amountValue: '1000' }, acctCurrCode: 'INR' }] }, performAccountEnquirytest: { ...enquiry, acctId: '660100100004' }, getFullAccountStatementWithPaginationtest: { result: { ...statement.result, accountBalances: { acid: '660100100004' } } } });
  await fetchIdbiDirectSnapshot({ customer: 'arjun', now: IDENTITY.now });
  assert.deepEqual(log[0].body.input, { acctType: 'SBA', branchId: '106', cifId: '77123456' });
  const before = log.length;
  await assert.rejects(fetchIdbiDirectSnapshot({ customer: 'nobody' }), /Unknown sandbox customer/);
  assert.equal(log.length, before);
});

// ── persona ──────────────────────────────────────────────────────────────
test('monthsToClear solves the amortisation and refuses a loan that never falls', () => {
  assert.equal(monthsToClear(600000, 8, 20000), 34);
  assert.equal(monthsToClear(120000, 0, 10000), 12);
  assert.equal(monthsToClear(3754903, 8.75, 16800), null); // EMI < interest
  assert.equal(monthsToClear(0, 8, 20000), null);
});

test('persona keeps every reported loan for display but models only the consistent ones, and never nets them off', async (t) => {
  routeFetch(t, FULL);
  const snap = await fetchIdbiDirectSnapshot(IDENTITY);
  snap.fetchedAt = '2026-09-21T10:00:00.000Z';
  const { persona } = buildCustomPersona({ name: 'Test', transactions: snap.transactions, holdings: snap.holdings, snapshots: [snap] });
  assert.equal(persona.liabilities.loans.length, 2);
  assert.equal(persona.liabilities.totalOutstanding, 700000);
  assert.equal(persona.liabilities.fetchedAt, '2026-09-21T10:00:00.000Z');
  assert.equal(persona.loans.length, 1); // only …A1 passes the check
  assert.deepEqual({ balance: persona.loans[0].balance, rate: persona.loans[0].rate, emi: persona.loans[0].emi, monthsLeft: persona.loans[0].monthsLeft }, { balance: 600000, rate: 8, emi: 20000, monthsLeft: 34 });
  assert.equal(persona.customer.savingsBalance, 1000); // liabilities are not netted against holdings
  assert.equal(persona.dataQuality.hasLiabilities, true);
  assert.equal(persona.dataQuality.connections[0].accounts[0].lien.endDate, '2027-07-08');
  assert.equal(validPersona(persona), true);

  // a customer whose loans do not reconcile gets no modelled loan at all
  routeFetch(t, { ...FULL, getLoanOverdueDetailstest: loanList([loanRow({ outstandingBal: '3754903' })]) });
  const bad = await fetchIdbiDirectSnapshot(IDENTITY);
  const built = buildCustomPersona({ name: 'Test', transactions: bad.transactions, holdings: bad.holdings, snapshots: [bad] }).persona;
  assert.equal(built.loans.length, 0);
  assert.equal(built.liabilities.loans.length, 1);
  assert.equal(validPersona(built), true);

  // a loan that fails ONLY the disbursed check (EMI is still above the interest, so it would amortise)
  // must be kept out on that ground alone — the amortisation guard must not be what saves it
  routeFetch(t, { ...FULL, getLoanOverdueDetailstest: loanList([loanRow({ outstandingBal: '1100000' })]), fetchCustomerLimitDetailstest: exposureReply('1100000') });
  const overDisbursed = await fetchIdbiDirectSnapshot(IDENTITY);
  assert.deepEqual(overDisbursed.liabilities.loans[0].issues.map((i) => i.code), ['OUTSTANDING_EXCEEDS_DISBURSED']);
  assert.notEqual(monthsToClear(1100000, 8, 20000), null);
  const held = buildCustomPersona({ name: 'Test', transactions: overDisbursed.transactions, holdings: overDisbursed.holdings, snapshots: [overDisbursed] }).persona;
  assert.equal(held.loans.length, 0);

  // and one with no liabilities snapshot is unchanged from before
  const plain = buildCustomPersona({ name: 'Test' }).persona;
  assert.equal(plain.liabilities, null);
  assert.deepEqual(plain.loans, []);
  assert.equal(validPersona({ ...plain, customer: { ...plain.customer, age: 30 } }), true);
});

test('the profile validator rejects a malformed liabilities block', async (t) => {
  routeFetch(t, FULL);
  const snap = await fetchIdbiDirectSnapshot(IDENTITY);
  const { persona } = buildCustomPersona({ name: 'Test', transactions: snap.transactions, holdings: snap.holdings, snapshots: [snap] });
  assert.equal(validPersona(persona), true);
  assert.equal(validPersona({ ...persona, liabilities: { ...persona.liabilities, loans: [{ outstanding: -1, dpd: 0, overdueAmount: 0 }] } }), false);
  assert.equal(validPersona({ ...persona, liabilities: 'nope' }), false);
});

// ── what MITRA says ──────────────────────────────────────────────────────
function askAdvisor(snapshot, script) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const memory = new Map(); globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) };
    const snapshot = JSON.parse(process.env.SNAPSHOT);
    const { buildCustomPersona } = await import('./src/engine/personaBuilder.js');
    const { persona } = buildCustomPersona({ name: 'Test', transactions: snapshot.transactions, holdings: snapshot.holdings, snapshots: [snapshot] });
    globalThis.fetch = async () => new Response(JSON.stringify({ available: true, session: { id: 'test', name: 'Test' }, profile: { persona }, onboarded: true }), { headers: { 'content-type': 'application/json' } });
    const api = await import('./src/engine/api.js'); await api.initializeApi();
    const { respond, detectIntent } = await import('./src/engine/advisor.js');
    ${script}
    console.log('ok');
  `], { encoding: 'utf8', env: { ...process.env, SNAPSHOT: JSON.stringify(snapshot) } }).trim();
}

test('MITRA reports the bank-listed loans, owns the gaps, and will not model repayment from them', async (t) => {
  routeFetch(t, FULL);
  const snap = await fetchIdbiDirectSnapshot(IDENTITY);
  snap.fetchedAt = '2026-09-21T10:00:00.000Z';
  const out = askAdvisor(snap, `
    const owe = respond('What do I owe?');
    assert.match(owe.text, /2 loan accounts with ₹7,00,000 outstanding/);
    assert.match(owe.text, /classed standard, with nothing overdue and 0 days past due/);
    assert.match(owe.text, /₹2,00,000 is not itemised/);
    assert.match(owe.text, /will not model repayment or prepayment/);
    assert.match(owe.text, /sandbox figures fetched 21 Sept? 2026/);
    assert.ok(owe.why.some((w) => /402/.test(w)) && owe.why.some((w) => /not netted/.test(w)));
    assert.ok(owe.chips.includes('Should I prepay or invest?'));
    for (const q of ['what do i owe', 'do I have any loans', 'am I overdue on anything', 'what is my loan balance', 'my debt']) assert.equal(detectIntent(q), 'liabilities', q);
    for (const q of ['should I prepay or invest', 'prepay my loan or invest', 'close my loan']) assert.equal(detectIntent(q), 'prepay', q);
    assert.equal(detectIntent('what is usable right now'), 'balances');
    // lien end date reaches the usable-balance answer
    assert.match(respond('What is usable right now?').text, /₹100 is held under lien and cannot be withdrawn until 8 Jul 2027/);
    // the coverage answer now points at the loan records instead of saying loans are missing
    const coverage = respond('What data do I need?').text;
    assert.match(coverage, /loan records are connected \\(2 loan accounts/);
    assert.doesNotMatch(coverage, /full loan details/);
    // the greeting offers it
    assert.ok(respond('hi').chips.includes('What do I owe?'));
  `);
  assert.equal(out, 'ok');
});

test('prepay-vs-invest runs on a consistent loan and explains itself when none reconcile', async (t) => {
  // consistent: balance below disbursed, EMI above interest, no unexplained exposure
  routeFetch(t, { ...FULL, getLoanOverdueDetailstest: loanList([loanRow()]), fetchCustomerLimitDetailstest: exposureReply('600000') });
  const good = await fetchIdbiDirectSnapshot(IDENTITY);
  assert.equal(good.liabilities.reconciled, true);
  assert.equal(askAdvisor(good, `
    const owe = respond('What do I owe?');
    assert.match(owe.text, /1 loan account with ₹6,00,000 outstanding/);
    assert.doesNotMatch(owe.text, /will not model/);
    const prepay = respond('should I prepay or invest');
    assert.match(prepay.text, /₹6,00,000 outstanding at 8%/);
    assert.ok(prepay.cta, 'a consistent loan supports a prepayment scenario');
  `), 'ok');

  // inconsistent: the answer says why instead of pretending, and offers no action
  routeFetch(t, { ...FULL, getLoanOverdueDetailstest: loanList([loanRow({ outstandingBal: '3754903' })]) });
  const bad = await fetchIdbiDirectSnapshot(IDENTITY);
  assert.equal(askAdvisor(bad, `
    const prepay = respond('should I prepay or invest');
    assert.match(prepay.text, /their own figures do not add up/);
    assert.equal(prepay.cta, undefined);
    assert.match(prepay.text, /₹37,54,903 outstanding/);
  `), 'ok');
});

test('with no loan data connected MITRA says so instead of reporting zero debt', async (t) => {
  routeFetch(t, { ...FULL, getLoanOverdueDetailstest: undefined });
  const snap = await fetchIdbiDirectSnapshot(IDENTITY);
  assert.equal(askAdvisor(snap, `
    const owe = respond('What do I owe?');
    assert.match(owe.text, /No loan or credit data is connected/);
    assert.doesNotMatch(owe.text, /₹0/);
    assert.ok(!respond('hi').chips.includes('What do I owe?'));
  `), 'ok');
});
