// IDBI sandbox adapter. All gateway calls stay server-side; the browser only
// receives the normalized shape consumed by buildCustomPersona().

const DEFAULT_BASE_URL = 'https://sandboxpocgatewayprod.idbi.bank.in';
const DEFAULTS = {
  cifId: process.env.IDBI_CIF_ID || '98655854',
  accountId: process.env.IDBI_ACCOUNT_ID || '660100100003',
  branchId: process.env.IDBI_BRANCH_ID || '105',
  // Unset means "the last two years up to today" — see statementWindow(). The
  // sandbox holds Priya's rows in May 2025 and Arjun's in June 2025, so a
  // one-month window pinned to May silently hides one customer's history.
  fromDate: process.env.IDBI_FROM_DATE || '',
  toDate: process.env.IDBI_TO_DATE || '',
  mobile: process.env.IDBI_MOBILE || '9988776655',
  vua: process.env.IDBI_VUA || '9988776655@onemoney',
  productId: process.env.IDBI_PRODUCT_ID || 'TEST',
};

// The test customers IDBI publishes in its sandbox samples. `priya` is the
// default and follows the IDBI_* overrides above; the rest are fixed identities.
// Only identifiers confirmed to resolve on the direct APIs are listed — the
// four-account customer in the AA samples returns "Data not found" on every
// direct route, so it is deliberately absent.
export const SANDBOX_CUSTOMERS = {
  priya: { label: 'Priya Patil', cifId: DEFAULTS.cifId, accountId: DEFAULTS.accountId, branchId: DEFAULTS.branchId },
  arjun: { label: 'Arjun Mehta', cifId: '77123456', accountId: '660100100004', branchId: '106' },
};
export const DEFAULT_SANDBOX_CUSTOMER = 'priya';
export const listSandboxCustomers = () => Object.entries(SANDBOX_CUSTOMERS).map(([id, { label }]) => ({ id, label }));

export function resolveSandboxCustomer(key = DEFAULT_SANDBOX_CUSTOMER) {
  if (typeof key !== 'string' || !Object.hasOwn(SANDBOX_CUSTOMERS, key)) {
    throw Object.assign(new Error('Unknown sandbox customer.'), { status: 422 });
  }
  const { label: _label, ...identity } = SANDBOX_CUSTOMERS[key];
  return identity;
}

const isoDate = (date) => date.toISOString().slice(0, 10);
export function statementWindow(now = new Date(), { fromDate, toDate } = {}) {
  const twoYearsAgo = new Date(Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), now.getUTCDate()));
  return { fromDate: fromDate || isoDate(twoYearsAgo), toDate: toDate || isoDate(now) };
}

const inr = (value) => `₹${Math.round(value).toLocaleString('en-IN')}`;

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

// ── Enrichment: lien, loans and credit exposure ───────────────
// These routes are chained from what the core fetch already returned rather
// than copied from IDBI's sample bodies. The lien and loan-detail APIs check the
// account's registered address, so a body rebuilt from the account-enquiry
// response resolves for every customer, while a copied sample only ever does
// for the one it was written for (that is what produced the earlier HTTP 400s).
// The customer id on the enquiry is the join key: every loan row must carry it.

const nullable = (value) => (value === undefined || value === null || value === '' || value === 'NULL' ? null : value);
const round2 = (value) => Math.round(value * 100) / 100;

export function mapLien(response, accountId) {
  const result = response?.result;
  if (result?.acctId && result.acctId !== accountId) throw contractError('IDBI lien response is for a different account.');
  const lien = result?.bankInfo?.lienDetails;
  if (!lien || lien.isDeleted === 'Y') return null;
  const amount = asNumber(lien.newLienAmt?.amountValue);
  if (amount === null || amount < 0) throw contractError('IDBI returned an invalid lien amount.');
  return {
    amount,
    startDate: nullable(lien.lienDate?.startDate),
    endDate: nullable(lien.lienDate?.endDate),
    reason: nullable(lien.reasonCode),
    remarks: nullable(lien.remarks),
    lienId: nullable(lien.lienId),
  };
}

export function mapLoanRows(response, customerId) {
  const rows = response?.overdueDetails;
  if (!Array.isArray(rows)) throw contractError('IDBI loan list is missing overdueDetails.');
  return rows.map((row) => {
    const outstanding = asNumber(row.outstandingBal);
    const overdueAmount = asNumber(row.totalOverdueAmt);
    const dpd = asNumber(row.dpd);
    if (!row.accountId || outstanding === null || outstanding < 0 || overdueAmount === null || overdueAmount < 0 || dpd === null || dpd < 0) {
      throw contractError('IDBI returned an invalid loan record; no liabilities were imported.');
    }
    if (String(row.customerId) !== String(customerId)) {
      throw contractError('IDBI loan list contains another customer; no liabilities were imported.');
    }
    const accountId = String(row.accountId);
    return {
      accountId,
      maskedAccountNumber: `…${accountId.slice(-4)}`,
      outstanding,
      overdueAmount,
      dpd,
      npaStatus: nullable(row.npaStatus),
      overdueSince: nullable(row.overdueDate),
      npaSince: nullable(row.npaDate),
      terms: null,
    };
  });
}

export function mapExposure(response, cifId) {
  const summary = response?.customerSummary;
  if (!summary || String(summary.custCifId) !== String(cifId)) throw contractError('IDBI exposure summary is for a different customer.');
  const amountOf = (node) => asNumber(node?.amount);
  return {
    customerId: nullable(summary.customerID) ? String(summary.customerID) : null,
    totalLimit: amountOf(response.exposureSummary?.totalLimit),
    fundedLimit: amountOf(response.exposureSummary?.fundedLimit),
    totalOutstanding: amountOf(response.exposureSummary?.totalOutstanding),
  };
}

export function mapLoanTerms(response, accountId, customerId) {
  const result = response?.result;
  if (!result || result.loanAcctId?.acctId !== accountId) throw contractError('IDBI loan details are for a different account.');
  if (result.custId?.custId && String(result.custId.custId) !== String(customerId)) throw contractError('IDBI loan details belong to another customer.');
  const plan = result.loanGenDetails?.pmtPlan?.repmtRec?.[0];
  const rate = asNumber(result.netIntRate?.value ?? plan?.installRate?.value);
  const emi = asNumber(plan?.flowAmt?.amountValue);
  const tenureMonths = asNumber(plan?.noOfInstall);
  if (!(rate > 0) || !(emi > 0) || !(tenureMonths > 0)) return null;
  return {
    rate,
    emi,
    tenureMonths,
    loanAmount: asNumber(result.loanGenDetails?.loanAmt?.amountValue),
    disbursed: asNumber(result.amtAlreadyDisb?.amountValue),
    openedOn: nullable(result.acctOpenDt) ? String(result.acctOpenDt).slice(0, 10) : null,
  };
}

// A loan may drive repayment or prepayment maths only if its own numbers can
// describe a loan that is actually being repaid. Both sandbox customers fail
// this: the reported outstanding exceeds everything ever disbursed and the EMI
// is smaller than a month's interest, so amortising it never terminates.
export function assessLoan(loan) {
  const issues = [];
  const terms = loan.terms;
  if (!terms) {
    issues.push({ code: 'NO_TERMS', message: 'Contract terms (rate, EMI, tenure) are not available.' });
  } else {
    if (Number.isFinite(terms.disbursed) && loan.outstanding > terms.disbursed + 0.5) {
      issues.push({ code: 'OUTSTANDING_EXCEEDS_DISBURSED', message: `reported outstanding ${inr(loan.outstanding)} exceeds the ${inr(terms.disbursed)} disbursed.` });
    }
    const monthlyInterest = (loan.outstanding * terms.rate) / 1200;
    if (loan.outstanding > 0 && terms.emi <= monthlyInterest) {
      issues.push({ code: 'EMI_BELOW_INTEREST', message: `the ${inr(terms.emi)} EMI is below the ${inr(monthlyInterest)} monthly interest on the reported outstanding, so the balance could never fall.` });
    }
  }
  return { ...loan, issues, modellable: issues.length === 0 && loan.outstanding > 0 };
}

export function buildLiabilities({ loans, exposure, customerId }) {
  const assessed = loans.map(assessLoan);
  const totalOutstanding = round2(assessed.reduce((sum, loan) => sum + loan.outstanding, 0));
  const gap = exposure?.totalOutstanding != null ? round2(exposure.totalOutstanding - totalOutstanding) : null;
  const unitemisedOutstanding = gap !== null && gap > 1 ? gap : null;
  const withoutTerms = assessed.filter((loan) => !loan.terms);
  const warnings = [
    ...assessed.filter((loan) => loan.terms).flatMap((loan) => loan.issues.map((issue) => `Loan ${loan.maskedAccountNumber}: ${issue.message}`)),
    withoutTerms.length ? `${withoutTerms.length} of ${assessed.length} loan${assessed.length === 1 ? '' : 's'} ha${withoutTerms.length === 1 ? 's' : 've'} no contract terms available, so ${withoutTerms.length === 1 ? 'it is' : 'they are'} listed by outstanding balance only.` : null,
    unitemisedOutstanding !== null ? `IDBI's exposure summary reports ${inr(exposure.totalOutstanding)} outstanding across all facilities, but only ${inr(totalOutstanding)} is itemised in the loan list; the other ${inr(unitemisedOutstanding)} cannot be attributed to a loan.` : null,
  ].filter(Boolean);
  return {
    status: 'reported',
    customerRef: customerId,
    loans: assessed,
    totalOutstanding,
    allStandard: assessed.length > 0 && assessed.every((loan) => loan.npaStatus === 'SA' && loan.dpd === 0 && loan.overdueAmount === 0),
    exposure,
    unitemisedOutstanding,
    reconciled: assessed.every((loan) => loan.modellable) && unitemisedOutstanding === null,
    // Kept on the liabilities, not the snapshot: these are about the loans, and
    // the snapshot's own warnings feed answers that should stay about balances.
    warnings,
  };
}

async function fetchLien(accountId, enquiry) {
  if (!enquiry.acctType || !enquiry.bankInfo) throw contractError('The account enquiry did not include the fields a lien lookup needs.');
  const response = await callIdbi('/Development/accountLienEnquirytest', {
    input: { acctId: accountId, moduleType: 'DEPOSIT', acctCurr: enquiry.acctCurr || 'INR', acctType: enquiry.acctType, bankInfo: enquiry.bankInfo },
  });
  return { lien: mapLien(response.data, accountId), requestId: response.requestId };
}

async function fetchLiabilities({ input, accountId, enquiry, now }) {
  const customerId = nullable(enquiry.custId) ? String(enquiry.custId) : null;
  if (!customerId) throw contractError('The account enquiry did not identify the customer, so loan records cannot be matched to them.');
  const [exposureCall, loansCall] = await Promise.allSettled([
    callIdbi('/Development/fetchCustomerLimitDetailstest', { custCifId: input.cifId }),
    callIdbi('/Development/getLoanOverdueDetailstest', { customerId: input.cifId, accountNo: '' }),
  ]);
  if (loansCall.status === 'rejected') throw loansCall.reason;
  const loans = mapLoanRows(loansCall.value.data, customerId);
  const requestIds = [loansCall.value.requestId], apis = ['402:getLoanOverdueDetails'], notes = [];

  let exposure = null;
  if (exposureCall.status === 'fulfilled') {
    try {
      exposure = mapExposure(exposureCall.value.data, input.cifId);
      // the exposure summary names the loan-side customer id; it must be the one the loans carry
      if (exposure.customerId && exposure.customerId !== customerId) throw contractError('IDBI exposure summary names a different customer id than the loan list.');
      requestIds.push(exposureCall.value.requestId);
      apis.push('442:fetchCustomerLimitDetails');
    } catch (error) {
      exposure = null;
      notes.push(`IDBI's credit-exposure summary was ignored: ${error.message}`);
    }
  } else {
    notes.push('IDBI\'s credit-exposure summary could not be retrieved, so total exposure is not shown.');
  }

  // Contract terms exist only for the loan that is this account: the other
  // loan accounts answer "Data not found" on every account-level route.
  const own = loans.find((loan) => loan.accountId === accountId);
  if (own && enquiry.acctType && enquiry.bankInfo) {
    try {
      const details = await callIdbi('/Development/getLoanAccountDetailstest', {
        input: {
          loanAcctId: {
            acctId: accountId,
            acctType: enquiry.acctType,
            acctCurr: enquiry.acctCurr || 'INR',
            // IDBI's sample sends the address as an "Office" address and the
            // route rejects a mismatch; the rest is the enquiry's own address.
            bankInfo: { ...enquiry.bankInfo, postAddr: { ...enquiry.bankInfo.postAddr, addrType: 'Office' } },
          },
          custId: { custId: customerId },
          channel: 'API',
          requestId: `MITRA${now.getTime()}`,
          reqDate: isoDate(now),
        },
      });
      own.terms = mapLoanTerms(details.data, accountId, customerId);
      requestIds.push(details.requestId);
      apis.push('391:getLoanAccountDetails');
    } catch (error) {
      notes.push(`Contract terms for loan …${accountId.slice(-4)} could not be retrieved: ${error.message}`);
    }
  }

  const liabilities = buildLiabilities({ loans, exposure, customerId });
  liabilities.warnings.push(...notes);
  return { liabilities, requestIds: requestIds.filter(Boolean), apis };
}

export async function fetchIdbiDirectSnapshot(config = {}) {
  const { customer, now = new Date(), ...overrides } = config;
  const input = { ...DEFAULTS, ...(customer ? resolveSandboxCustomer(customer) : {}), ...overrides };
  const range = statementWindow(now, input);
  input.fromDate = range.fromDate;
  input.toDate = range.toDate;
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
  const latest = transactions.map((item) => item.date).sort().at(-1) || null;

  // Optional enrichment. The statement above is the fail-closed core; these add
  // context, so one failing degrades to a stated gap instead of losing the import.
  const [lienCall, liabilitiesCall] = await Promise.allSettled([
    fetchLien(accountId, enquiry.data),
    fetchLiabilities({ input, accountId, enquiry: enquiry.data, now }),
  ]);
  const enrichmentWarnings = [], enrichmentApis = [], enrichmentRequestIds = [];
  let lien = null;
  if (lienCall.status === 'fulfilled') {
    lien = lienCall.value.lien;
    enrichmentApis.push('362:accountLienEnquiry');
    enrichmentRequestIds.push(lienCall.value.requestId);
    const reported = lien?.amount ?? 0, enquired = balances.LIEN ?? 0;
    if (Math.abs(reported - enquired) > 0.01) {
      enrichmentWarnings.push(`The lien API reports ${inr(reported)} but the account enquiry reports ${inr(enquired)}; the lien figure is unreconciled.`);
    }
  } else {
    console.warn('[MITRA idbi] lien lookup failed', lienCall.reason?.message);
    enrichmentWarnings.push('Lien start/end dates could not be retrieved; only the balance-level lien amount is shown.');
  }
  let liabilities = null;
  if (liabilitiesCall.status === 'fulfilled') {
    liabilities = liabilitiesCall.value.liabilities;
    enrichmentApis.push(...liabilitiesCall.value.apis);
    enrichmentRequestIds.push(...liabilitiesCall.value.requestIds);
  } else {
    console.warn('[MITRA idbi] liabilities lookup failed', liabilitiesCall.reason?.message);
    enrichmentWarnings.push('Loans and credit exposure could not be retrieved, so liabilities are not reflected anywhere in this snapshot.');
  }

  return {
    transactions,
    holdings,
    mode: 'IDBI_SANDBOX_DIRECT',
    providerId: 'idbi-bank',
    dataAsOf: latest,
    warnings: [
      'Bank-only snapshot: investments, tax and insurance are not connected.',
      ...(needsReconciliation ? ['Statement balances and account-enquiry balances require reconciliation before financial recommendations.'] : []),
      ...enrichmentWarnings,
    ],
    coverage: {
      statementComplete: true,
      portfolioComplete: false,
      accountCount: 1,
      discoveredAccountCount: discovered.data.customerAccountInfo.length,
      liabilities: { status: liabilities ? 'reported' : 'unavailable', itemisedLoans: liabilities?.loans.length ?? 0, reconciled: liabilities?.reconciled ?? false },
    },
    liabilities,
    account: {
      lien,
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
      apis: ['394:getCustomerAccountsByCustId', '365:performAccountEnquiry', '393:getFullAccountStatementWithPagination', ...enrichmentApis],
      requestIds: [discovered.requestId, enquiry.requestId, ...requestIds, ...enrichmentRequestIds].filter(Boolean),
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
