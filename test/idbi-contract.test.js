import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fetchIdbiDirectSnapshot, fetchIdbiConsentSnapshot, normalizeFinProStatement, selectActiveConsent, mapDirectTransactions, validateIdbiResponse } from '../server/idbi.mjs';
import { buildCustomPersona } from '../src/engine/personaBuilder.js';

const identity = { accountId: 'account-1', productId: 'TEST', vua: 'fixture@aa', consentHandle: 'handle-1' };
const consent = (status = 'ACTIVE') => ({ status: 'SUCCESS', data: [{ consentID: 'consent-1', status, accountID: 'account-1', productID: 'TEST', vua: 'fixture@aa', consent_handle: 'handle-1', accounts: [{ linkReferenceNumber: 'ref-1' }] }] });
const account = (ref = 'ref-1', kind = 'SAVINGS') => ({ linkReferenceNumber: ref, Summary: { currentBalance: '1000.00', currency: 'INR', accountSubType: kind, balanceDateTime: '2025-05-31' }, Transactions: { startDate: '2025-05-01', endDate: '2025-05-31', Transaction: [{ txnId: 'txn-1', valueDate: '2025-05-03', type: 'CREDIT', amount: '200', transactionalBalance: '1000', narration: 'Unlabelled transfer' }] } });

test('consent must be active, unexpired and bound to the requested handle and identity', () => {
  assert.equal(selectActiveConsent(consent(), identity).consentID, 'consent-1');
  for (const status of ['PENDING', 'REVOKED', 'EXPIRED', 'PAUSED']) assert.throws(() => selectActiveConsent(consent(status), identity), /active consent/);
  for (const key of ['accountId', 'productId', 'vua', 'consentHandle']) assert.throws(() => selectActiveConsent(consent(), { ...identity, [key]: 'other' }), /active consent/);
  const expired = consent(); expired.data[0].consentExpiry = '2020-01-01';
  assert.throws(() => selectActiveConsent(expired, identity), /expired/);
});

test('HTTP-success application errors never become empty successful imports', () => {
  for (const payload of [null, 'HTML', { status: 'FAILED' }, { errors: [{ message: 'Denied' }] }, { errorCode: '401' }]) assert.throws(() => validateIdbiResponse(payload));
  assert.doesNotThrow(() => validateIdbiResponse({ status: 'success', errors: [], errorCode: null }));
});

test('every consented account is matched; missing, foreign and duplicate accounts fail closed', () => {
  for (const data of [[account('other')], [], [account(), account()]]) assert.throws(() => normalizeFinProStatement({ data }, ['ref-1']));
  assert.throws(() => normalizeFinProStatement({ data: [account()] }, ['ref-1', 'ref-2']), /references/);
});

test('all account types and alternate running-balance fields survive normalization without invented yield/cost', () => {
  const rows = ['SAVINGS', 'CURRENT', 'TERM_DEPOSIT', 'SALARY'].map((kind, index) => account(`ref-${index}`, kind));
  const normalized = normalizeFinProStatement({ data: rows }, rows.map(a => a.linkReferenceNumber));
  assert.equal(normalized.transactions.length, 4);
  assert.deepEqual(normalized.holdings.map(h => h.type), ['Savings Account', 'Current Account', 'Fixed Deposit', 'Savings Account']);
  assert.equal(normalized.transactions[0].balance, 1000);
  assert.equal(normalized.holdings[2].liquid, false);
  assert.equal(normalized.holdings[0].growth, undefined);
  assert.equal(normalized.holdings[0].cost, undefined);
  const { persona } = buildCustomPersona({ name: 'Test', ...normalized, snapshots: [{ ...normalized, mode: 'IDBI_SANDBOX_CONSENT', consent: { consentId: 'test' }, coverage: { portfolioComplete: false } }] });
  assert.equal(persona.customer.savingsBalance, 2000);
  assert.equal(persona.customer.monthlyIncome, 0);
  assert.equal(persona.dataQuality.incomeAvailable, false);
  assert.equal(persona.goals.length, 0);
  assert.equal(persona.dataQuality.connections[0].consent.consentId, 'test');
  assert.equal(persona.dataQuality.observedCashMovement.totalCredits, 800);
});

test('malformed dates, amounts and transaction directions are rejected rather than changed to debits', () => {
  for (const changes of [{ type: 'UNKNOWN' }, { amount: 'Infinity' }, { amount: '' }, { valueDate: '2025-02-30' }]) {
    const a = account(); Object.assign(a.Transactions.Transaction[0], changes);
    assert.throws(() => normalizeFinProStatement({ data: [a] }, ['ref-1']), /invalid transaction/);
  }
  assert.throws(() => mapDirectTransactions({ result: {} }), /transactionDetails/);
});

test('missing and non-INR balances are rejected; a genuine zero balance is preserved', () => {
  for (const changes of [{ currency: 'USD' }, { currentBalance: null }, { currentBalance: '-20' }]) {
    const a = account(); Object.assign(a.Summary, changes);
    assert.throws(() => normalizeFinProStatement({ data: [a] }, ['ref-1']), /currency or balance/);
  }
  const a = account(); a.Summary.currentBalance = '0';
  assert.equal(normalizeFinProStatement({ data: [a] }, ['ref-1']).holdings[0].value, 0);
});

test('a salary word on a debit or refund does not make income available', () => {
  for (const row of [{ type: 'debit', description: 'Salary payment' }, { type: 'credit', description: 'Salary reversal' }, { type: 'credit', description: 'Transfer' }]) {
    const { persona } = buildCustomPersona({ transactions: [{ date: '2025-05-01', amount: 5000, ...row }] });
    assert.equal(persona.customer.monthlyIncome, 0);
    assert.equal(persona.dataQuality.incomeAvailable, false);
  }
});

test('direct adapter follows pagination and preserves available and lien balances', async t => {
  const page = (more, id) => ({ result: { hasMoreData: more, transactionDetails: [{ txnId: id, txnSrlNo: '1', pstdDate: '2025-05-03', txnBalance: { amountValue: '1000', currencyCode: 'INR' }, transactionSummary: { txnDate: '2025-05-03', txnType: 'C', txnAmt: { amountValue: '200' } } }] } });
  const replies = [{ customerAccountInfo: [{ acctNumber: 'account-1', acctBalance: { amountValue: '1000' } }] }, { acctBal: [{ balType: 'AVAIL', balAmt: { amountValue: '900' } }, { balType: 'LIEN', balAmt: { amountValue: '100' } }] }, page('Y', 'txn-1'), page('N', 'txn-2')];
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (_, init) => { requests.push(JSON.parse(init.body)); return new Response(JSON.stringify(replies.shift())); });
  const result = await fetchIdbiDirectSnapshot({ accountId: 'account-1' });
  assert.equal(result.transactions.length, 2);
  assert.equal(requests[3].input.paginationDetails.lastTxnId, 'txn-1');
  assert.equal(result.account.availableBalance, 900);
  assert.equal(result.account.lienBalance, 100);
});

test('non-active consent does not make a downstream statement request', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(JSON.stringify(consent('REVOKED'))); });
  await assert.rejects(fetchIdbiConsentSnapshot(identity), /active consent/);
  assert.equal(calls, 1);
});

test('the observed foreign-link fixture is rejected at the full adapter boundary', async t => {
  const responses = [consent(), { status: 'success', data: [account('foreign-link')] }];
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(responses.shift())));
  await assert.rejects(fetchIdbiConsentSnapshot(identity), /references do not match/);
});

test('a repeated pagination cursor never publishes partial history', async t => {
  const statement = { result: { hasMoreData: 'Y', transactionDetails: [{ txnId: 'same', txnSrlNo: '1', pstdDate: '2025-05-03', txnBalance: { amountValue: '1000' }, transactionSummary: { txnDate: '2025-05-03', txnType: 'C', txnAmt: { amountValue: '200' } } }] } };
  const responses = [{ customerAccountInfo: [{ acctNumber: 'account-1', acctBalance: { amountValue: '1000' } }] }, { acctBal: [] }, statement, statement];
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(responses.shift())));
  await assert.rejects(fetchIdbiDirectSnapshot({ accountId: 'account-1' }), /pagination did not complete/);
});

test('avatar gives dated cash-movement facts and suppresses unsupported investment and health claims', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const memory = new Map(); globalThis.localStorage = { getItem:k=>memory.get(k)??null, setItem:(k,v)=>memory.set(k,v), removeItem:k=>memory.delete(k) };
    const { buildCustomPersona } = await import('./src/engine/personaBuilder.js');
    const { persona } = buildCustomPersona({ name:'Test', transactions:[{date:'2025-05-01',amount:300,type:'credit',description:'Transfer'},{date:'2025-05-02',amount:200,type:'debit',description:'Other'}], holdings:[{type:'Savings Account',label:'Bank',value:1000}], snapshots:[{mode:'IDBI_SANDBOX_DIRECT',coverage:{portfolioComplete:false},account:{availableBalance:900,lienBalance:100}}] });
    globalThis.fetch = async () => new Response(JSON.stringify({ available:true,session:{id:'test',name:'Test'},profile:{persona},onboarded:true }), {headers:{'content-type':'application/json'}});
    const api = await import('./src/engine/api.js'); await api.initializeApi();
    const { respond } = await import('./src/engine/advisor.js');
    const spending = respond('analyse my spending');
    assert.match(spending.text,/300/); assert.match(spending.text,/200/); assert.match(spending.text,/2025-05-02/); assert.match(spending.text,/net inflow/);
    assert.match(respond('show my portfolio').text,/partial portfolio/);
    assert.match(respond('What data do I need?').text,/lien amount/);
    for(const prompt of ['invest my surplus','financial health score','rebalance my portfolio','money personality']) {const result=respond(prompt);assert.equal(result.cta,undefined);assert.equal(result.widget.type,'data-quality-unavailable');}
    const { healthScore,topNudges } = await import('./src/engine/analytics.js'); assert.equal(healthScore().available,false); assert.ok(!topNudges().some(n=>['drift','surplus','emergency'].includes(n.id)));
    console.log('ok');
  `], { encoding: 'utf8' });
  assert.equal(output.trim(), 'ok');
});
