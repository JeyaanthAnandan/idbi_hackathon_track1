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
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (!response.ok) {
    const error = new Error(`IDBI ${path} failed (${response.status})`);
    error.status = response.status;
    error.detail = data?.errorMsg || data?.message || data?.detail || raw.slice(0, 300);
    throw error;
  }
  return { data, requestId: response.headers.get('x-atlas-request-id') || null };
}

function mapDirectTransactions(statement) {
  return (statement?.result?.transactionDetails || []).map((item) => ({
    date: String(item.transactionSummary?.txnDate || item.valueDate || '').slice(0, 10),
    description: item.transactionSummary?.txnDesc || item.txnId || 'IDBI transaction',
    amount: asNumber(item.transactionSummary?.txnAmt?.amountValue),
    type: String(item.transactionSummary?.txnType || '').toUpperCase() === 'C' ? 'credit' : 'debit',
    sourceId: item.txnId || null,
    balance: asNumber(item.txnBalance?.amountValue),
  })).filter((item) => item.date && item.amount > 0);
}

function mapFinProTransactions(statement) {
  const items = statement?.data?.[0]?.Transactions?.Transaction || [];
  return items.map((item) => ({
    date: String(item.valueDate || item.transactionTimestamp || '').slice(0, 10),
    description: item.narration || item.txnId || 'IDBI transaction',
    amount: asNumber(item.amount),
    type: String(item.type || '').toUpperCase() === 'CREDIT' ? 'credit' : 'debit',
    sourceId: item.txnId || null,
    balance: asNumber(item.currentBalance),
  })).filter((item) => item.date && item.amount > 0);
}

function mapAccountHolding(account, enquiry) {
  const amount = asNumber(account?.acctBalance?.amountValue)
    || asNumber(enquiry?.acctBal?.find((item) => item.balType === 'LEDGER')?.balAmt?.amountValue);
  return amount > 0 ? [{
    type: 'Savings Account',
    label: 'IDBI Savings Account',
    value: amount,
    cost: amount,
    growth: 3,
    liquid: true,
    source: 'idbi:account-enquiry',
  }] : [];
}

export async function fetchIdbiDirectSnapshot(config = {}) {
  const input = { ...DEFAULTS, ...config };
  const discovered = await callIdbi('/Development/getCustomerAccountsByCustIdtest', {
    input: { acctType: 'SBA', branchId: input.branchId, cifId: input.cifId },
    txn: 'E',
  });
  const account = discovered.data?.customerAccountInfo?.find((item) => item.acctNumber === input.accountId)
    || discovered.data?.customerAccountInfo?.[0];
  if (!account?.acctNumber) throw new Error('IDBI did not return a sandbox account for the supplied CIF.');

  const accountId = account.acctNumber;
  const enquiry = await callIdbi('/Development/performAccountEnquirytest', { acctId: accountId });
  const statement = await callIdbi('/Development/getFullAccountStatementWithPaginationtest', {
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
  });

  const transactions = mapDirectTransactions(statement.data);
  const holdings = mapAccountHolding(account, enquiry.data);
  const latest = transactions.map((item) => item.date).sort().at(-1) || input.toDate;
  return {
    transactions,
    holdings,
    mode: 'IDBI_SANDBOX_DIRECT',
    providerId: 'idbi-bank',
    dataAsOf: latest,
    account: {
      accountId,
      cifId: input.cifId,
      branchId: input.branchId,
      currency: account.acctCurrCode || 'INR',
      balance: asNumber(account.acctBalance?.amountValue),
      status: enquiry.data?.bankAcctStatusCode || null,
      customerId: enquiry.data?.custId || null,
      customerName: enquiry.data?.personName?.name || null,
    },
    provenance: {
      source: 'idbi-sandbox',
      apis: ['394:getCustomerAccountsByCustId', '365:performAccountEnquiry', '393:getFullAccountStatementWithPagination'],
      requestIds: [discovered.requestId, enquiry.requestId, statement.requestId].filter(Boolean),
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
  const item = consent.data?.data?.find((entry) => entry.status === 'ACTIVE') || consent.data?.data?.[0];
  const consentId = item?.consentID;
  const linkRefNumber = item?.accounts?.[0]?.linkReferenceNumber;
  if (!consentId || !linkRefNumber) throw new Error('IDBI returned no active consent link reference.');
  const statement = await callIdbi('/Development/getAccountStatementFromFinProtest', {
    consentId,
    linkRefNumber: [linkRefNumber],
  });
  const transactions = mapFinProTransactions(statement.data);
  const summary = statement.data?.data?.[0]?.Summary || {};
  const amount = asNumber(summary.currentBalance);
  return {
    transactions,
    holdings: amount > 0 ? [{ type: 'Savings Account', label: 'IDBI Savings Account', value: amount, cost: amount, growth: 3, liquid: true, source: 'idbi:finpro' }] : [],
    mode: 'IDBI_SANDBOX_CONSENT',
    providerId: 'idbi-bank-consent',
    dataAsOf: transactions.map((item) => item.date).sort().at(-1) || null,
    consent: { consentId, linkRefNumber, status: item.status, fip: item.accounts?.[0]?.fipName || null },
    provenance: { source: 'idbi-finpro-sandbox', apis: ['591:getConsentListFromFinPro', '739:getAccountStatementFromFinPro'], requestIds: [consent.requestId, statement.requestId].filter(Boolean) },
  };
}

export function idbiEnabled() {
  return String(process.env.IDBI_LIVE_SANDBOX || '').toLowerCase() === 'true';
}
