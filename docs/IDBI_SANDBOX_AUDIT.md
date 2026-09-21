# IDBI sandbox verification and data-use audit

Checked 2026-09-19T17:20:13.597Z. Reproduce with `node scripts/verify-idbi-sandbox.mjs` (requires the local downloaded `API-openspec/` folder). This sends the published sandbox samples, including synthetic lead and notification events. It never targets a production endpoint. Raw responses are kept in ignored `.data/idbi-audit/`; request secrets are not printed or copied into this report.

## Result

- 34 downloaded YAML files, 31 distinct test routes, 45 distinct published request scenarios.
- 41 scenarios returned HTTP 200 and parseable JSON; 4 returned HTTP 400.
- 30 routes have at least one HTTP 200 sample; the multi-account deduplication route has none.
- HTTP 200 proves sample response availability, not correct cross-API identity, live consent, authentication enforcement, or production readiness.
- Seven routes were wired at the time of this audit; eleven are now (see **Update — 21 September 2026** at the end, which supersedes the loan/lien findings below). Other routes were tested and assessed; they are not all used for insights.

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

## Update — 21 September 2026: the remaining APIs, and what MITRA Connect now uses

Explored with read-only calls using only identifiers IDBI itself publishes in the samples and responses. Raw captures stay in ignored `.data/idbi-explore/`. This corrects three earlier conclusions: the 400s on APIs 362 and 391 were request-shape problems, not API limits; the customer/loan join *can* be verified; and a wider statement window matters.

### The sandbox holds three customers, and answers per identity

| Customer | Direct-API identity | What the direct APIs return |
|---|---|---|
| Priya Patil | CIF `98655854` → customer `68453002`, account `…0003`, branch 105 | 20 statement rows, 1–20 May 2025; balance ₹56,780; lien ₹5,000 to 8 Jul 2027; 3 loan accounts |
| Arjun Mehta | CIF `77123456` → customer `77712345`, account `…0004`, branch 106 | 20 statement rows, 1–20 Jun 2025; balance ₹89,500; lien ₹3,000; 1 loan account |
| Neha Singh | accounts `…0006`–`…0009` (four-account AA fixtures) | `Data not found` on every direct route; reachable only through the FinPro fixtures, whose consent-to-statement chain fails (finding 5 above) |

- The date filter works: Priya's account is empty in June and Arjun's in May. A statement window pinned to May 2025 silently hid Arjun's whole history, so the connector now defaults to the last two years.
- **Every statement narration is a placeholder** (`S1 TXN 1…20`, `S2 TXN 1…20`) and amounts are random. There are no merchants, categories or salary credits anywhere in the direct statement API, so richer *transactions* do not exist in this sandbox. The richer material is on the liability side.

### Verified joins

The account-enquiry response carries the loan-side customer id (`custId`) and the registered address and scheme that APIs 362 and 391 validate. Requests rebuilt from it return 200 for both customers; copied sample bodies only match the one customer they were written for. API 442 links the CIF to the same customer id, and API 402 (queried by CIF) returns rows carrying that id. The connector requires every loan row to carry the enquiry's customer id and refuses the whole list otherwise.

### Loan figures do not reconcile, so they are reported, not modelled

| | Priya (`…0003`) | Arjun (`…0004`) |
|---|---|---|
| Outstanding (402) | ₹37,54,903 (+ two more loans, ₹6,74,624 and ₹2,41,960) | ₹48,50,200 |
| Disbursed (391) | ₹15,00,000 | ₹25,00,000 |
| Contract EMI / rate (391) | ₹16,800 / 8.75 % | ₹30,500 / 9.25 % |
| Monthly interest on the outstanding | ≈ ₹27,380 | ≈ ₹37,387 |
| Exposure summary outstanding (442) vs itemised | ₹72,49,563 vs ₹46,71,487 | ₹98,00,000 vs ₹48,50,200 |

Both customers owe more than was ever disbursed and carry an EMI below one month's interest, so amortising them never terminates. Days past due is 0 and asset class is `SA` (standard) on every listed loan. The other two of Priya's loans answer `Data not found` on every account-level route, so they have balances only.

### What MITRA Connect now does

- Fetches, in addition to accounts, balance and statement: **362** lien (amount, start, end date), **402** loan list with days past due and asset class, **442** customer credit exposure, **391** contract terms for the loan that is the fetched account. A customer chooser selects Priya or Arjun.
- The statement stays fail-closed. Each enrichment degrades to a stated gap on failure. Loan-side warnings live on `liabilities.warnings`, not `snapshot.warnings`.
- `persona.liabilities` holds every reported loan for display and Q&A ("What do I owe?"). `persona.loans`, which prepay-vs-invest amortises, receives only loans that pass `assessLoan` (terms present, outstanding not above disbursed, EMI above monthly interest). Neither sandbox customer currently passes, so prepayment stays unavailable and MITRA now says why instead of "no loan data".
- Liabilities are not netted against holdings, and no health score or net worth is derived from them.

### Explored and deliberately not used

| API | Why not |
|---|---|
| 408 CIBIL | The 200 wraps a bureau rejection (`Missing Required Field`) and no score; the applicant block only echoes the request |
| 508 HRMS | An employee directory (grade, supervisor, department), not customer data; no income |
| 415 CKYC / 456 dedupe | Identity documents; would require collecting PAN and add nothing to a wealth answer |
| 428 lead / 497 / 498 notifications | Writes; not part of a read-only connect |
| 538 payoff, 473 schedule, 433 rates | Payoff principal (₹4,00,000 / ₹6,00,000) contradicts the outstanding again; the schedule is a ₹1,00,000 what-if; 433 returns a composite blob mixing other customers' fixtures |

Also noted: `API-openspec/Open API Specifications (4).yaml` (the CIBIL spec) is tracked in git and contains a UAT username and password in its sample request. It is IDBI's published sandbox credential, but it should be removed before the repository is made public.

