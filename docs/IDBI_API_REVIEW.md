# IDBI sandbox API review

Reviewed from `API-openspec/` on 18 September 2026.

## What is in the bundle

The directory contains 34 YAML files but only 31 unique API IDs. The extra files are multi-account clones or duplicate downloads. Every operation is a `POST` under the development path, for example `/Development/getAccountStatementFromFinProtest`.

All files point to the sandbox gateway `https://sandboxpocgatewayprod.idbi.bank.in`. The specifications are request examples: response schemas are empty, most requests have no formal JSON schema, and no authentication scheme is declared in the files.

## Recommended subscription set

Subscribe to these first for a convincing MITRA sandbox journey:

| API | File | Why it matters |
|---|---|---|
| API 394 `getCustomerAccountsByCustIdtest` | `Open API Specifications.yaml` | Discover a customer's savings accounts from a CIF. |
| API 365 `performAccountEnquirytest` | `(10).yaml` | Fetch account-level details/balance after account discovery. |
| API 393 `getFullAccountStatementWithPaginationtest` | `(16).yaml` | Pull transactions for a date range; pagination supports a complete history. |
| API 590 `RequestConsentFromFinProtest` | `(30).yaml` | Start the Account Aggregator consent flow. |
| API 592 `getWebRedirectionEncryptedURLtest` | `(24).yaml` | Obtain the customer redirect URL for consent approval. |
| API 591 `getConsentListFromFinProtest` | `(23).yaml` | Check consent state and discover linked references. |
| API 498 `pushDataNotificationtest` | `(12).yaml` | Receive/handle the “data ready” event in the AA flow. |
| API 739 `getAccountStatementFromFinProtest` | `(28).yaml` | Fetch the consent-backed account statement from FinPro. |
| API 593 `generateDecryptedResponseFromFinProtest` | `(27).yaml` | Decrypt the AA redirect callback result (observed response contains approval/session metadata, not transactions). |

The direct account APIs (394, 365, 393) are the shortest path to a working demo. The consent APIs (590, 592, 591, 498, 739, 593) are the path we should show as the production-shaped architecture. Subscribe to both tracks if the sandbox permits it; the adapter can use direct statements as a fallback while the consent flow is being completed.

Add these only for specific MITRA features:

| API | Use |
|---|---|
| API 391 `getLoanAccountDetailstest` | Loan balance and loan account facts for “prepay vs invest”. |
| API 473 `generateLoanRepaymentScheduletest` | Amortisation schedule and repayment projections. |
| API 433 `fetchLoanInterestRatestest` | Interest-rate lookup for loan comparisons. |
| API 402 `getLoanOverdueDetailstest` | Overdue status/nudge; not required for the first demo. |
| API 441 `fetchLoanAccountLimitstest` | Loan limit/eligibility; optional. |
| API 538 `InquireHPAyofftest` | Hire-purchase payoff; only if vehicle finance is in scope. |
| API 456 `performCustomerMasterDedupeChecktest` | Customer identity deduplication during onboarding. |
| API 415 `searchCkycDetailstest` | CKYC lookup; use only if the sandbox provides compliant test identities. |
| API 408 `fetchCibilScoretest` | Credit score; not necessary for wealth advice and has sensitive credentials in its sample payload. |

Do not subscribe yet to API 428 `createLeadtest`, HRMS API 508, or the payment APIs: they do not provide inputs needed for MITRA’s current wealth dashboard and would expand the compliance scope.

## Consent flow represented by these APIs

```text
MITRA server
  → 590 RequestConsentFromFinPro
  → 592 getWebRedirectionEncryptedURL
  → customer approves at the returned redirect URL
  → 497 pushConsentNotification (consent approved)
  → 591 getConsentListFromFinPro (read active consent/link references)
  → 498 pushDataNotification (data ready)
  → 739 getAccountStatementFromFinPro
  → normalize transactions into MITRA
```

API 497 is a consent notification sample; API 498 is a data-ready notification sample. Both acknowledge posted synthetic events. Their role as real server callbacks, authentication, and retry behavior still need provider confirmation. API 593 separately decodes the encrypted redirect callback metadata; the observed 739 statement is already JSON.

## Important request shapes found

- API 394 account discovery: `{ input: { acctType: "SBA", branchId, cifId }, txn: "E" }`.
- API 365 account enquiry: `{ acctId }`.
- API 393 statement pagination: `{ input: { acid, branchId, fromDate, toDate, sortIn, paginationDetails } }`.
- API 590 consent request: `partyIdentifierType`, `partyIdentifierValue`, `productID`, `accountID`, `vua`, and `transactionID`.
- API 591 consent lookup: the same party/account identity fields without the transaction ID.
- API 592 redirect: `{ consentHandle, redirectUrl }`.
- API 739/595 account statement: `{ consentId, linkRefNumber: [...] }`.
- API 593 decryption: `{ webRedirectionURL: { ecres, resdate, fi } }`.

The samples use synthetic IDs and must not be copied into the application.

## How this maps to the current code

The existing prototype already has the right seam:

| Current code | Change |
|---|---|
| `src/engine/api.js` | Exposes MITRA routes for requesting consent and fetching a consent-backed snapshot; gateway calls remain server-side. |
| `server/index.mjs` | Provides authenticated `/api/idbi/consent/request` and `/api/idbi/consent/snapshot` routes. |
| `src/components/ConnectAccounts.jsx` | Shows the pending consent state, opens the registered AA redirect, and fetches approved data into the existing profile builder. |
| `src/engine/statementImport.js` | Reuse its normalized transaction shape for IDBI statement rows. Add a dedicated IDBI mapper instead of modifying CSV parsing. |
| `src/engine/personaBuilder.js` | Feed mapped holdings/transactions into the existing persona builder. Preserve source, consent ID, and `dataAsOf` in `dataQuality`. |
| `src/data/customer.js` | Keep the export surface initially; later replace it with a server snapshot. |
| `src/engine/analytics.js` | Keep for the sandbox demo, but move calculations server-side before using real customer data. |

The IDBI adapter must normalize all monetary values into the prototype’s rupee-number shape. If the gateway returns paise or nested `{ amountValue, currencyCode }` objects, conversion belongs in one adapter module. Never scatter unit conversion through UI components.

## Required work before production calling

1. Subscribe to the minimum set above in the IDBI application portal. The sandbox request, redirect, consent-list, and statement calls are now exercised by `server/idbi.mjs`.
2. Download the generated credentials/configuration for the Development environment. Do not commit them; store them in `.env` or deployment secrets.
3. Confirm the gateway authentication scheme. The YAML does not declare one, and the gateway may require API key, OAuth, mTLS, signed headers, or a combination.
4. Confirm mandatory headers, request correlation IDs, timeout/retry rules, rate limits, and whether the `test` suffix is part of the deployed route.
5. Obtain response samples or run the portal’s test console. The downloaded specs currently have `responses: {}` and cannot be used to write a reliable response parser by themselves.
6. Confirm the encryption/decryption contract for API 593 and the callback signature/authentication for APIs 497/498. These are intentionally not faked by the adapter because the downloaded specs do not define them.
7. Build a server-side adapter and record raw sandbox responses in redacted fixtures. Add contract tests against those fixtures.

## Suggested implementation order

### Phase 1: direct statement proof

Subscribe to 394, 365, and 393. Implement one server route that discovers an account, fetches a statement for a selected date range, maps it to MITRA transactions, and renders the existing dashboard. This proves value quickly and avoids blocking on AA encryption.

### Phase 2: consent-shaped integration (implemented for sandbox polling)

590, 592, 591, and 739 are wired for the sandbox. The connector checks the consent list, binds the stored handle to the authenticated user, requires a matching active consent, and verifies every statement account reference.

### Phase 3: loan intelligence

Add 391, 473, and 433. Map the result into the existing loan model and enable the prepay-vs-invest response only when the required loan fields are present.

### Phase 4: identity and optional enrichment

Add 456/415 only if onboarding requires them. Add CIBIL, HRMS, lead creation, overdue, limits, and payoff APIs only when a defined product feature needs them.
