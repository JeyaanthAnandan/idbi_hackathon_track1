# IDBI sandbox verification and data-use audit

Checked 2026-09-19T17:20:13.597Z. Reproduce with `node scripts/verify-idbi-sandbox.mjs` (requires the local downloaded `API-openspec/` folder). This sends the published sandbox samples, including synthetic lead and notification events. It never targets a production endpoint. Raw responses are kept in ignored `.data/idbi-audit/`; request secrets are not printed or copied into this report.

## Result

- 34 downloaded YAML files, 31 distinct test routes, 45 distinct published request scenarios.
- 41 scenarios returned HTTP 200 and parseable JSON; 4 returned HTTP 400.
- 30 routes have at least one HTTP 200 sample; the multi-account deduplication route has none.
- HTTP 200 proves sample response availability, not correct cross-API identity, live consent, authentication enforcement, or production readiness.
- Seven routes are wired into the application. Other routes were tested and assessed; they are not all used for insights.

## Every route

| API / route | Sample results | Actual use / potential value |
|---|---|---|
| API 428  createLeadtest — `createLeadtest` | 2 × 200, 1 × 400 | Synthetic lead creation acknowledgement; no wealth input |
| API 365 performAccountEnquirytest — `performAccountEnquirytest` | 2 × 200 | Wired into the sandbox connector |
| API 365  MultiAccount performAccountEnquirytest clone — `performAccountEnquirytest01` | 1 × 200 | Multi-account enquiry fixture; not current app route |
| API 498  pushDataNotificationtest — `pushDataNotificationtest` | 1 × 200 | Synthetic event acknowledgement; does not prove data-ready callback delivery |
| 402 multi account  getLoanOverdueDetailstest clone — `getLoanOverdueDetailstest01` | 1 × 200 | Multi-account overdue fixture; joins unresolved |
| API 362 accountLienEnquirytest — `accountLienEnquirytest` | 1 × 200, 1 × 400 | Available enrichment: restrictions on usable cash |
| API 393  getFullAccountStatementWithPaginationtest — `getFullAccountStatementWithPaginationtest` | 1 × 200 | Wired into the sandbox connector |
| API 433 fetchLoanInterestRatestest — `fetchLoanInterestRatestest` | 2 × 200 | Rate-table scenarios; not the customer’s contracted rate |
| API 415 searchCkycDetailstest — `searchCkycDetailstest` | 1 × 200 | Identity/onboarding only; not wealth insights |
| API 508 fetchHRMSEmployeeDetailstest — `fetchHRMSEmployeeDetailstest` | 1 × 200 | Employment facts; no established link to this customer |
| 442 fetchCustomerLimitDetailstest — `fetchCustomerLimitDetailstest` | 1 × 200 | Credit-limit facts; not cash or wealth |
| API 538 Inquire HPAyofftest — `InquireHPAyofftest` | 1 × 200 | Payoff quote; requires a verified loan/account join |
| API 391 getLoanAccountDetailstest — `getLoanAccountDetailstest` | 1 × 200, 1 × 400 | Loan terms/EMI; current principal still needs a verified join |
| API 591 getConsentListFromFinProtest — `getConsentListFromFinProtest` | 1 × 200 | Wired into the sandbox connector |
| API 592 getWebRedirectionEncryptedURLtest — `getWebRedirectionEncryptedURLtest` | 1 × 200 | Wired into the sandbox connector |
| API 473  generateLoanRepaymentScheduletest — `generateLoanRepaymentScheduletest` | 1 × 200 | What-if schedule; not an actual repayment history |
| API 595  MoneyOneFIUgetAccountStatementtest — `getAccountStatementtest` | 1 × 200 | Alternative statement sample; not yet connected to approval flow |
| API 593  generateDecryptedResponseFromFinProtest — `generateDecryptedResponseFromFinProtest` | 1 × 200 | Decrypts AA redirect result; not statement decryption |
| API 739 getAccountStatementFromFinProtest — `getAccountStatementFromFinProtest` | 1 × 200 | Wired, but strict reference validation blocks the current inconsistent fixture |
| API 456   multi acc performCustomerMasterDedupeChecktest clone — `performCustomerMasterDedupeChecktest01` | 1 × 400 | Unavailable route |
| API 497  pushConsentNotificationtest — `pushConsentNotificationtest` | 1 × 200 | Synthetic event acknowledgement; does not prove real approval delivery |
| API 590 RequestConsentFromFinProtest — `requestConsentFromFinProtest` | 1 × 200 | Wired into the sandbox connector |
| API 441 fetchLoanAccountLimitstest — `fetchLoanAccountLimitstest` | 1 × 200 | Sanction/drawing limits; not assets |
| API 591  multi account getConsentListFromFinProtest01 clone — `getConsentListFromFinProtest01` | 4 × 200 | Multi-account consent fixture; not yet a working chained flow |
| API 595  multi account  getAccountStatementtest01 clone — `getAccountStatementtest01` | 4 × 200 | Four account-type fixtures normalize; chained consent request fails |
| 408 fetchCibilScoretest — `fetchCibilScoretest` | 1 × 200 | Credit report; not used for wealth allocation |
| 402 getLoanOverdueDetailstest — `getLoanOverdueDetailstest` | 1 × 200 | Overdue/principal enrichment; customer/account joins unresolved |
| API 404 getLoanOverduePositionEnquirytest — `getLoanOverduePositionEnquirytest` | 2 × 200 | Overdue position; not a substitute for complete loan balances |
| API 456  performCustomerMasterDedupeChecktest — `performCustomerMasterDedupeChecktest` | 2 × 200 | Identity/deduplication; not advisor input |
| API 394 MultiAccount getCustomerAccountsByCustIdtest clone — `getCustomerAccountsByCustIdtest01` | 1 × 200 | Multi-account discovery fixture; not current app route |
| API 394 getCustomerAccountsByCustIdtest — `getCustomerAccountsByCustIdtest` | 1 × 200 | Wired into the sandbox connector |

## Failures and contradictions

1. API 428 sample 3: invalid PAN format (HTTP 400). The first two samples return 200.
2. API 362 sample 2 and API 391 sample 2: address/postcode mismatch (HTTP 400). The first samples return 200.
3. API 456 multi-account clone: `Unknown API: performCustomerMasterDedupeChecktest01` (HTTP 400).
4. Standard API 591 returns link reference `LRN0001`; API 739 returns a different link reference. The earlier connector silently accepted it. It now refuses the import. This corrects the earlier claim that this was a verified end-to-end consent flow.
5. The multi-account API 591 clone supplies one consent with four account references. Passing that returned consent ID and those references to the API 595 clone returned HTTP 400, `Data not found`. Independently supplied example consent IDs do work. They cannot safely be substituted for an approved consent.
6. Direct statement running balances are on a different scale from account-enquiry balances. The FinPro sample’s last transaction balance also differs from its summary. These are snapshot inconsistencies, not proof of available cash.
7. API 593 returns decrypted redirect fields (redirect URL, session, source reference, status, transaction ID). It does not return financial transactions. Notification APIs only acknowledged posted test events; real callback authentication and lifecycle remain unverified.

## What Mitra now uses

| Data | Handling and resulting insight |
|---|---|
| Account/statement amounts, dates and debit/credit directions | Validated; observed credits, debits and net cash movement are available to the avatar. Missing/invalid values no longer become zero or debit. |
| Available, effective available and lien balances | Preserved with source metadata; the data-coverage answer distinguishes these from reported savings balance. |
| Multiple FinPro accounts and balance variants | All returned consent-matched accounts normalize, including `transactionalBalance`; savings, current and term deposits remain distinct. Actual multi-account live flow is still blocked by the fixture mismatch. |
| Consent handle/status, account reference and application errors | Match requested handle and identity; pending/revoked/expired or foreign-account results stop the import. Consent handle is attached to the authenticated MITRA session. |
| Pagination | Direct statement pages follow the supplied cursor fields with a loop/limit guard; no incomplete successful snapshot. Only single-page live data was available, so multi-page behavior is regression-tested with controlled responses. |
| Provenance, observed dates and warnings | Persist through profile creation; bank-only portfolio coverage is marked partial and responses label dated sandbox data. |
| Unlabelled credits | Included in cash-movement totals, excluded from salary estimates. Salary words on a debit or reversal do not establish income. |
| Loan terms, rates, limits and overdue responses | Inspected but not joined into the customer profile: fixtures lack a verified consistent loan/customer association. Limits are not treated as savings, and original disbursement is not treated as outstanding principal. |
| Identity, address, PAN, CKYC, HRMS, CIBIL | Not needed for the current wealth calculation; not copied into the advisor context merely because supplied. |
| Fees, cost basis, investment holdings, insurance, tax utilisation | Not established by the bank fixture; related advice remains unavailable or explicitly simulated. Bank holdings no longer fabricate purchase cost or a 3% observed yield. |

## Insight quality

The current sample supports a dated balance overview and an observed cash-movement explanation. It does not support reliable salary, merchant-category trends, investable surplus, whole-portfolio rebalancing, a financial-health score, personalised tax/insurance advice, or a verified prepayment recommendation. Mitra now explains missing evidence instead of scoring incomplete data or recommending an investment amount.

The four multi-account statement examples expose savings, current, term-deposit and salary account balances and transactions over May–July 2025. Those are useful contract examples, but not fresh financial data or evidence that three complete monthly statements were supplied.

## Provider fixes needed

- Align account-link references between 591 and 739, and consent IDs between the multi-account 591 and 595 routes.
- Enable the missing API 456 clone or remove it from the catalog.
- Supply consistent customer/CIF/account/loan identifiers and reconciled balances across fixtures.
- Provide recent, categorisable transactions, explicit income, and full statement coverage.
- Document gateway authentication, registered callback handling, event verification/retries, expiry/revocation and rate limits.

## Verified observations and application checks

The direct sandbox profile contains 20 transactions dated 1–20 May 2025: credits ₹48,392.97, debits ₹1,03,909.83 and net cash outflow ₹55,516.86. Reported savings are ₹56,780.25; available balance is ₹55,780.25, effective available balance ₹50,780.25 and lien ₹5,000. These are dated sandbox facts, not current customer finances. Narrations do not establish income, and these totals do not establish consumption or loss.

- `npm test`: 94/94 passed, including 12 new IDBI contract/insight regression tests.
- `npm run build`: passed.
- Browser: signed up with an isolated test store, requested sandbox consent, and verified that the mismatched statement produces an explicit error with no imported profile.
- Browser: separately loaded the direct API snapshot through the authenticated MITRA API into the isolated test profile, then checked the dashboard, spending explanation and data-coverage answer. This is a test of the direct-data path, not a claim that the blocked consent path succeeded.
- Corrected UI: dynamic observed-month chart heading; insufficient-history label; unknown salary, tax and health score; partial-portfolio notice; synthetic market label; personal retirement projection withheld without sufficient data. The page renders without a Vite error overlay.
- Existing avatar-direction, presentation, speech-unit, account-isolation and conversation regression tests pass. This pass did not test actual customer AA approval or real microphone/TTS provider output.

## Visible connection flow — 20 September 2026

The working direct-data route is now exposed through the UI. Run `npm run dev:sandbox` and open `/?connect=1`, then log in, fetch IDBI sandbox data, review the returned rows and balances, and choose **Use this data with MITRA**. Existing users can open **Connect / refresh data** from the dashboard or Settings. The AA flow remains separate and retains its account-reference checks. There is no silent local-fixture fallback for the direct IDBI action.

Browser verification used the actual controls with an isolated account: signup → gateway fetch → 20-transaction preview → profile save → avatar greeting based on the fetched snapshot. Re-entering from the dashboard and fetching again updated the timestamp from 00:38:06 to 00:39:14 IST. Applying the second snapshot persisted that timestamp and started a fresh chat. No profile was injected through developer tools for this pass. The optional risk questionnaire was never entered. All 94 regression tests and the build pass.

The local app was restarted with sandbox mode enabled at port 5173 using its usual persistent store. Static hosting still needs a deployed Node API and proxy before this connection flow can work there.
