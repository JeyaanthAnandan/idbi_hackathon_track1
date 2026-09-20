// IDBI sandbox adapter. All gateway calls stay server-side; the browser only
// receives the normalized shape consumed by buildCustomPersona().

const DEFAULT_BASE_URL = 'https://sandboxpocgatewayprod.idbi.bank.in';
const DEFAULTS = {
  cifId: process.env.IDBI_CIF_ID || '98655854',
  accountId: process.env.IDBI_ACCOUNT_ID || '660100100003',
  branchId: process.env.IDBI_BRANCH_ID || '105',
  fromDate: process.env.IDBI_FROM_DATE || '2025-05-01',
  toDate: process.env.IDBI_TO_DATE || '2025-05-31',
  mobile: process.env.IDBI_MOBILE || '9988776655',
  vua: process.env.IDBI_VUA || '9988776655@onemoney',
  productId: process.env.IDBI_PRODUCT_ID || 'TEST',
};

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function contractError(message) {
  return Object.assign(new Error(message), { status: 502 });
}

export function validateIdbiResponse(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw contractError('IDBI returned an invalid JSON response.');
  if (data.errors?.length || data.error || /fail|error|reject/i.test(String(data.status || '')) || (data.errorCode && String(data.errorCode) !== '0')) {
    throw contractError('IDBI returned an application error; no financial data was imported.');
  }
  return data;
}

function transaction(row) {
  const amount = asNumber(row.amount);
  const date = String(row.date || '').slice(0, 10);
  if (!['credit', 'debit'].includes(row.type) || amount === null || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw contractError('IDBI returned an invalid transaction date, amount or direction; import stopped.');
  }
  return { ...row, date, amount };
}

async function callIdbi(path, payload, options = {}) {
  const base = (process.env.IDBI_SANDBOX_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(Number(process.env.IDBI_TIMEOUT_MS || 15000)),
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!response.ok) {
    const error = new Error(`IDBI ${path} failed (${response.status})`);
    error.status = response.status;
    error.detail = 'The sandbox rejected this request.';
    throw error;
  }
  return { data: validateIdbiResponse(data), requestId: response.headers.get('x-atlas-request-id') || null };
}

export function mapDirectTransactions(statement) {
  if (!Array.isArray(statement?.result?.transactionDetails)) throw contractError('IDBI statement is missing transactionDetails.');
  return statement.result.transactionDetails.map((item) => transaction({
    date: String(item.transactionSummary?.txnDate || item.valueDate || '').slice(0, 10),
    description: item.transactionSummary?.txnDesc || item.txnId || 'IDBI transaction',
    amount: asNumber(item.transactionSummary?.txnAmt?.amountValue),
    type: ({ C: 'credit', D: 'debit' })[String(item.transactionSummary?.txnType || '').toUpperCase()],
    sourceId: item.txnId || null,
    balance: asNumber(item.txnBalance?.amountValue),
  }));
}

function mapFinProTransactions(account) {
  if (!Array.isArray(account?.Transactions?.Transaction)) throw contractError('FinPro statement is missing transactions.');
  return account.Transactions.Transaction.map((item) => transaction({
    date: item.valueDate || item.transactionTimestamp || item.transactionTimeStamp || item.transactionDateTime,
    description: item.narration || item.txnId || 'IDBI transaction',
    amount: asNumber(item.amount),
    type: ({ CREDIT: 'credit', DEBIT: 'debit' })[String(item.type || '').toUpperCase()],
    sourceId: item.txnId || null,
    accountRef: account.linkReferenceNumber,
    mode: item.mode || null,
    balance: asNumber(item.currentBalance ?? item.transactionalBalance ?? item.balance),
  }));
}

export function normalizeFinProStatement(statement, expectedRefs) {
  validateIdbiResponse(statement);
  if (!Array.isArray(statement.data) || !statement.data.length) throw contractError('FinPro returned no account statements.');
  const returned = statement.data.map(a => a.linkReferenceNumber);
  if (new Set(returned).size !== returned.length || returned.some(ref => !ref || !expectedRefs.includes(ref)) || expectedRefs.some(ref => !returned.includes(ref))) {
    throw contractError('IDBI consent and statement account references do not match. No data was imported; the sandbox fixtures need correction.');
  }
  const transactions = [], holdings = [], accounts = [], warnings = [];
  for (const item of statement.data) {
    const summary = item.Summary || {};
    const amount = asNumber(summary.currentBalance);
    if (summary.currency !== 'INR' || amount === null || amount < 0) throw contractError('FinPro returned an unsupported currency or balance.');
    const kind = String(summary.accountSubType || summary.accountType || item.fiType).toUpperCase();
    const type = /TERM|FIXED|FD/.test(kind) ? 'Fixed Deposit' : /CURRENT/.test(kind) ? 'Current Account' : /SAV|SBA|SALARY/.test(kind) ? 'Savings Account' : null;
    if (!type) throw contractError('FinPro returned an unsupported account type.');
    const rows = mapFinProTransactions(item);
    transactions.push(...rows);
    holdings.push({ type, label: `IDBI ${type} ${item.maskedAccountNumber || ''}`.trim(), value: amount, liquid: type !== 'Fixed Deposit', source: 'idbi:finpro', accountRef: item.linkReferenceNumber });
    accounts.push({ accountRef: item.linkReferenceNumber, type, balance: amount, balanceAsOf: summary.balanceDateTime || null, status: summary.status || null, currency: summary.currency, statementStart: item.Transactions.startDate, statementEnd: item.Transactions.endDate });
    const last = [...rows].sort((a,b) => a.date.localeCompare(b.date)).at(-1);
    if (last?.balance !== null && last?.balance !== undefined && Math.abs(last.balance - amount) > 0.01) warnings.push('Reported balance differs from the last supplied transaction balance; reconciliation is required.');
  }
  return { transactions, holdings, accounts, warnings };
}

export function selectActiveConsent(response, input) {
  validateIdbiResponse(response);
  if (!Array.isArray(response.data)) throw contractError('IDBI consent response is missing the consent list.');
  const item = response.data?.find(entry => entry.status === 'ACTIVE'
    && (!input.consentHandle || entry.consent_handle === input.consentHandle)
    && entry.accountID === input.accountId && entry.productID === input.productId && entry.vua === input.vua);
  if (!item?.consentID || !item.accounts?.length) throw Object.assign(new Error('No matching active consent is available. Complete approval and check again.'), { status: 409 });
  const expiry = item.consentExpiry || item.consentExpiryDate;
  if (expiry && (!Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= Date.now())) throw Object.assign(new Error('The IDBI consent has expired.'), { status: 409 });
  return item;
}

function mapAccountHolding(account, enquiry) {
  const amount = asNumber(account?.acctBalance?.amountValue)
    ?? asNumber(enquiry?.acctBal?.find((item) => item.balType === 'LEDGER')?.balAmt?.amountValue);
  if (amount === null || amount < 0) throw contractError('IDBI returned an invalid account balance.');
  return [{
    type: 'Savings Account',
    label: 'IDBI Savings Account',
    value: amount,
    liquid: true,
    source: 'idbi:account-enquiry',
  }];
}

export async function fetchIdbiDirectSnapshot(config = {}) {
  const input = { ...DEFAULTS, ...config };
  const discovered = await callIdbi('/Development/getCustomerAccountsByCustIdtest', {
    input: { acctType: 'SBA', branchId: input.branchId, cifId: input.cifId },
    txn: 'E',
  });
  const account = discovered.data?.customerAccountInfo?.find((item) => item.acctNumber === input.accountId);
  if (!account?.acctNumber) throw new Error('IDBI did not return a sandbox account for the supplied CIF.');

  const accountId = account.acctNumber;
  const enquiry = await callIdbi('/Development/performAccountEnquirytest', { acctId: accountId });
  if (enquiry.data.acctId && enquiry.data.acctId !== accountId) throw contractError('IDBI returned a different account in the enquiry.');
  if ([account.acctCurrCode, enquiry.data.acctCurr].some(c => c && c !== 'INR')) throw contractError('IDBI returned an unsupported account currency.');
  const statementPayload = {
    input: {
      acid: accountId,
      branchId: input.branchId,
      fromDate: `${input.fromDate}T00:00:00.000`,
      toDate: `${input.toDate}T23:59:59.999`,
      sortIn: 'D',
      paginationDetails: {
        lastBalance: { amountValue: '0.00', currencyCode: 'INR' },
        lastPstdDate: `${input.fromDate}T00:00:00.000`,
        lastTxnDate: `${input.fromDate}T00:00:00.000`,
        lastTxnId: '',
        lastTxnSrlNo: '0',
      },
    },
  };
  let statement;
  const transactions = [], requestIds = [], cursors = new Set();
  for (let page = 0; page < 50; page++) {
    statement = await callIdbi('/Development/getFullAccountStatementWithPaginationtest', statementPayload);
    if (statement.data.result?.accountBalances?.acid && statement.data.result.accountBalances.acid !== accountId) throw contractError('IDBI statement account does not match the requested account.');
    requestIds.push(statement.requestId);
    transactions.push(...mapDirectTransactions(statement.data));
    if (statement.data.result.hasMoreData === 'N') break;
    if (statement.data.result.hasMoreData !== 'Y') throw contractError('IDBI pagination status is missing or invalid.');
    const last = statement.data.result.transactionDetails.at(-1);
    if (!last?.txnId || !last.pstdDate || !last.txnSrlNo || !last.txnBalance) throw contractError('IDBI pagination cursor is incomplete.');
    const cursor = { lastBalance: last.txnBalance, lastPstdDate: last.pstdDate, lastTxnDate: last.transactionSummary.txnDate, lastTxnId: last.txnId, lastTxnSrlNo: last.txnSrlNo };
    if (cursors.has(JSON.stringify(cursor)) || page === 49) throw contractError('IDBI pagination did not complete; no partial history was imported.');
    cursors.add(JSON.stringify(cursor));
    statementPayload.input.paginationDetails = cursor;
  }

  const holdings = mapAccountHolding(account, enquiry.data);
  const balances = Object.fromEntries((enquiry.data.acctBal || []).map(b => [b.balType, asNumber(b.balAmt?.amountValue)]));
  const lastTransaction = [...transactions].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const needsReconciliation = lastTransaction?.balance !== null && lastTransaction?.balance !== undefined && Math.abs(lastTransaction.balance - holdings[0].value) > 0.01;
  const latest = transactions.map((item) => item.date).sort().at(-1) || input.toDate;
  return {
    transactions,
    holdings,
    mode: 'IDBI_SANDBOX_DIRECT',
    providerId: 'idbi-bank',
    dataAsOf: latest,
    warnings: ['Bank-only snapshot: investments, tax, insurance and complete liabilities are not connected.', ...(needsReconciliation ? ['Statement balances and account-enquiry balances require reconciliation before financial recommendations.'] : [])],
    coverage: { statementComplete: true, portfolioComplete: false, accountCount: 1, discoveredAccountCount: discovered.data.customerAccountInfo.length },
    account: {
      accountId,
      cifId: input.cifId,
      branchId: input.branchId,
      currency: account.acctCurrCode || 'INR',
      balance: asNumber(account.acctBalance?.amountValue),
      availableBalance: balances.AVAIL ?? null,
      effectiveAvailableBalance: balances.EFFAVL ?? null,
      lienBalance: balances.LIEN ?? null,
      status: enquiry.data?.bankAcctStatusCode || null,
      customerId: enquiry.data?.custId || null,
      customerName: enquiry.data?.personName?.name || null,
    },
    provenance: {
      source: 'idbi-sandbox',
      apis: ['394:getCustomerAccountsByCustId', '365:performAccountEnquiry', '393:getFullAccountStatementWithPagination'],
      requestIds: [discovered.requestId, enquiry.requestId, ...requestIds].filter(Boolean),
    },
  };
}

export async function requestIdbiConsent(config = {}) {
  const input = { ...DEFAULTS, ...config };
  const transactionID = input.transactionID || `mitra-${Date.now()}`;
  const consent = await callIdbi('/Development/requestConsentFromFinProtest', {
    partyIdentifierType: 'MOBILE',
    partyIdentifierValue: input.mobile,
    productID: input.productId,
    accountID: input.accountId,
    vua: input.vua,
    transactionID,
  });
  const consentHandle = consent.data?.data?.consent_handle;
  if (!consentHandle) throw new Error('IDBI consent response did not include consent_handle.');
  const redirect = await callIdbi('/Development/getWebRedirectionEncryptedURLtest', {
    consentHandle,
    // The sandbox validates this against its registered callback. Production
    // must use the callback URL registered for the approved application.
    redirectUrl: input.redirectUrl || process.env.IDBI_CONSENT_REDIRECT_URL || 'https://myapp.com/consent/callback',
  });
  return {
    mode: 'IDBI_SANDBOX_CONSENT',
    consentId: consent.data?.data?.consentId || null,
    consentHandle,
    status: consent.data?.data?.status || null,
    redirectUrl: redirect.data?.data?.[0]?.webRedirectionUrl || null,
    requestIds: [consent.requestId, redirect.requestId].filter(Boolean),
    provenance: { apis: ['590:requestConsentFromFinPro', '592:getWebRedirectionEncryptedURL'] },
  };
}

export async function fetchIdbiConsentSnapshot(config = {}) {
  const input = { ...DEFAULTS, ...config };
  const consent = await callIdbi('/Development/getConsentListFromFinProtest', {
    partyIdentifierType: 'MOBILE',
    partyIdentifierValue: input.mobile,
    productID: input.productId,
    accountID: input.accountId,
    vua: input.vua,
  });
  const item = selectActiveConsent(consent.data, input);
  const consentId = item?.consentID;
  const linkRefNumbers = item.accounts.map(account => account.linkReferenceNumber);
  if (linkRefNumbers.some(ref => !ref)) throw contractError('IDBI returned an incomplete consent account reference.');
  const statement = await callIdbi('/Development/getAccountStatementFromFinProtest', {
    consentId,
    linkRefNumber: linkRefNumbers,
  });
  const normalized = normalizeFinProStatement(statement.data, linkRefNumbers);
  return {
    ...normalized,
    mode: 'IDBI_SANDBOX_CONSENT',
    providerId: 'idbi-bank-consent',
    dataAsOf: normalized.transactions.map((item) => item.date).sort().at(-1) || null,
    coverage: { statementComplete: true, portfolioComplete: false, accountCount: normalized.accounts.length },
    consent: { consentId, linkRefNumbers, status: item.status, fip: item.accounts?.[0]?.fipName || null },
    provenance: { source: 'idbi-finpro-sandbox', apis: ['591:getConsentListFromFinPro', '739:getAccountStatementFromFinPro'], requestIds: [consent.requestId, statement.requestId].filter(Boolean) },
  };
}

export function idbiEnabled() {
  return String(process.env.IDBI_LIVE_SANDBOX || '').toLowerCase() === 'true';
}
