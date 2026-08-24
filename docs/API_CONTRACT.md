# MITRA — API Contract v1

**Status:** Draft for sandbox implementation
**Base URL:** `https://api.mitra.sandbox.idbi.internal/v1`
**Auth:** `Authorization: Bearer <JWT>` on every route except `/auth/*` and `/health`
**Content type:** `application/json; charset=utf-8`
**Money:** all amounts are **integer paise** (`₹1,234.50` → `123450`). No floats for money, ever.
**Dates:** ISO-8601. Instants `2026-08-24T09:15:00Z`; calendar dates `2026-08-24`.

> **Design principle.** Advice is computed **server-side**. The browser must never be the
> source of truth for a number a customer might act on — the bank needs one auditable engine,
> one versioned answer, and a record of the inputs behind every recommendation.
> This inverts today's architecture, where `engine/analytics.js` runs in the browser.

---

## 0. Conventions

### 0.1 Envelope

Successful reads return the resource directly. Collections are wrapped:

```json
{ "items": [ ... ], "nextCursor": "eyJrIjoi...", "total": 42 }
```

### 0.2 Errors — RFC 9457 Problem Details

```json
{
  "type": "https://api.mitra.idbi.internal/errors/consent-expired",
  "title": "Account Aggregator consent has expired",
  "status": 409,
  "detail": "Consent 9f2c... expired on 2026-08-01. Ask the customer to re-authorise.",
  "instance": "/v1/consents/9f2c-...",
  "traceId": "1-68aa1f30-4c1d2e"
}
```

| Status | When |
|---|---|
| `400` | Malformed request body / failed schema validation |
| `401` | Missing, expired or invalid token |
| `403` | Valid token, but no consent covers this data / insufficient scope |
| `404` | Resource does not exist for this customer |
| `409` | State conflict (consent expired, action already applied, idempotency mismatch) |
| `422` | Semantically invalid (goal horizon of 0 years, negative target) |
| `429` | Rate limited — `Retry-After` header present |
| `503` | Upstream (AA / FIP / Bedrock) unavailable — `Retry-After` present |

### 0.3 Data freshness — every derived resource carries provenance

This replaces the `meta` provenance stamp already present in `advisor.js` responses.

```json
"provenance": {
  "computedAt": "2026-08-24T09:15:00Z",
  "engineVersion": "analytics@2.1.0",
  "dataAsOf": "2026-08-23T18:00:00Z",
  "sources": ["aa:HDFC-SB-****4412", "upload:statement-jun.csv"],
  "staleness": "fresh"
}
```

`staleness`: `fresh` (< 24h) · `stale` (24h–7d) · `expired` (> 7d or consent revoked).
**The UI must visibly degrade on `expired`** — never show a confident number over dead data.

### 0.4 Idempotency

All `POST`/`PATCH`/`DELETE` that mutate money-adjacent state **require**
`Idempotency-Key: <uuid>`. Keys are retained 24h. A replay with the same key and same body
returns the original response; same key with a different body returns `409`.

### 0.5 Caching & concurrency

Derived reads return `ETag` + `Cache-Control: private, max-age=300`.
Mutations on `/goals` and `/rules` accept `If-Match`; a mismatch returns `412`.

### 0.6 Pagination

Cursor-based: `?limit=50&cursor=<opaque>`. `limit` max 200, default 50.
Never offset-based — transaction volumes make offsets unstable.

---

## 1. Bootstrap — the one call that replaces `data/customer.js`

### `GET /v1/me/snapshot`

Returns everything needed for first paint. This is deliberately shaped to mirror the current
`customer.js` export surface so the frontend refactor is a swap, not a rewrite.

`?include=` (optional, comma-separated) narrows the payload:
`profile,holdings,cashflow,goals,tax,insurance,liabilities,insights,market,peers`

**200**

```json
{
  "profile": {
    "customerId": "CUST-88214",
    "name": "Priya Sharma",
    "maskedName": "P**** S*****",
    "age": 29,
    "segment": "SALARIED_PROFESSIONAL",
    "city": "Mumbai",
    "relationshipSince": 2019,
    "kycStatus": "VERIFIED",
    "kycRisk": "LOW",
    "panLinked": true,
    "riskProfile": {
      "band": "BALANCED",
      "source": "QUESTIONNAIRE",
      "assessedAt": "2026-08-01T10:00:00Z",
      "validUntil": "2027-08-01T10:00:00Z",
      "score": 8
    },
    "locale": "en-IN",
    "preferredLanguage": "en"
  },

  "accounts": [
    {
      "accountId": "acc_01J8...",
      "type": "SAVINGS",
      "institution": "IDBI Bank",
      "maskedNumber": "****4412",
      "balance": 26450000,
      "currency": "INR",
      "linkedVia": "ACCOUNT_AGGREGATOR",
      "consentId": "cns_01J8...",
      "lastSyncedAt": "2026-08-23T18:00:00Z"
    }
  ],

  "holdings": [
    {
      "holdingId": "hld_01J8...",
      "assetClass": "EQUITY_MF",
      "instrumentType": "MUTUAL_FUND",
      "label": "Nifty 50 Index Fund",
      "isin": "INF209KB1TN0",
      "folio": "****8821",
      "units": 412.338,
      "navAsOf": "2026-08-23",
      "currentValue": 8640000,
      "investedValue": 5800000,
      "unrealisedGain": 2840000,
      "xirr": 12.4,
      "liquid": true,
      "plan": "DIRECT",
      "expenseRatio": 0.20,
      "sipAmount": 500000,
      "sipActive": true,
      "source": "aa:CAMS"
    }
  ],

  "liabilities": [
    {
      "liabilityId": "lia_01J8...",
      "type": "EDUCATION_LOAN",
      "label": "Education Loan",
      "outstanding": 18000000,
      "interestRatePct": 10.5,
      "emi": 835200,
      "tenureMonthsRemaining": 24,
      "nextDueDate": "2026-09-05"
    }
  ],

  "cashflow": {
    "currency": "INR",
    "monthly": [
      { "month": "2026-06", "income": 9500000, "spend": 7135000, "invested": 800000 }
    ],
    "spendByCategory": [
      {
        "category": "DINING_DELIVERY",
        "displayName": "Dining & Food Delivery",
        "amount": 1180000,
        "trailing3mAvg": 810000,
        "essential": false,
        "txnCount": 34
      }
    ],
    "recurringPayments": [
      {
        "merchantId": "mrc_netflix",
        "name": "OTT Bundle (3 platforms)",
        "amount": 109700,
        "cadence": "MONTHLY",
        "firstSeen": "2025-03-11",
        "lastCharged": "2026-08-11",
        "engagementSignal": "UNKNOWN",
        "confidence": 0.94
      }
    ]
  },

  "goals": [
    {
      "goalId": "gol_01J8...",
      "kind": "EMERGENCY_FUND",
      "name": "Emergency Fund",
      "icon": "shield",
      "targetAmount": 40000000,
      "savedAmount": 26450000,
      "targetDate": "2027-08-01",
      "priority": "HIGH",
      "linkedHoldingIds": ["hld_01J8..."],
      "system": true
    }
  ],

  "tax": {
    "assessmentYear": "2027-28",
    "regime": "OLD",
    "regimeConfirmedByCustomer": false,
    "estimatedSlabRatePct": 31.2,
    "deductions": [
      { "section": "80C", "limit": 15000000, "used": 6900000, "verified": true },
      { "section": "80D", "limit": 2500000, "used": 0, "verified": false }
    ]
  },

  "insurance": [
    { "policyId": "pol_01J8...", "type": "TERM_LIFE", "sumAssured": 200000000, "annualPremium": 0, "provider": "Employer Group", "portable": false, "expiresAt": null },
    { "policyId": "pol_01J8...", "type": "HEALTH", "sumAssured": 50000000, "annualPremium": 1200000, "provider": "Star Health", "portable": true, "expiresAt": "2027-03-31" }
  ],
  "dependents": 2,

  "provenance": { "computedAt": "...", "engineVersion": "...", "dataAsOf": "...", "sources": [], "staleness": "fresh" }
}
```

**Notes on shape changes from the prototype**

- `holdings[].value` → `currentValue` in **paise**; `growth` → `xirr` (a real metric, not a
  hand-written number).
- `subscriptions[].lastUsed: "unused 4 months"` → `recurringPayments[].engagementSignal`
  (`ACTIVE | DORMANT | UNKNOWN`) + `confidence`. **A bank cannot know whether a customer
  *used* Netflix** — only that it charged. The current UI claim is not derivable from a bank
  feed and must be softened to "charged monthly, no app activity detected" or dropped.
- `insurance` becomes an **array of policies**, not a single object — real customers hold several.
- `peers` and `market` are separate endpoints (§6) because they are not customer-owned data.

---

## 2. Auth & session

Replaces `src/engine/auth.js` entirely.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/auth/register` | Sandbox only. Production federates to IDBI's IdP via OIDC. |
| `POST` | `/auth/login` | Returns access (15 min) + refresh (30 d, rotating) tokens. |
| `POST` | `/auth/refresh` | Refresh-token rotation; reuse detection revokes the family. |
| `POST` | `/auth/logout` | Revokes the refresh family. |
| `POST` | `/auth/mfa/challenge` · `/auth/mfa/verify` | OTP. **Required** before any consent creation. |
| `GET` | `/auth/session` | Current session + granted scopes. |

**`POST /auth/login` → 200**

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresIn": 900,
  "tokenType": "Bearer",
  "customerId": "CUST-88214",
  "scopes": ["profile:read", "portfolio:read", "advice:read", "actions:write"],
  "onboardingState": "COMPLETE",
  "mfaRequired": false
}
```

`onboardingState`: `NEW | RISK_PROFILE_PENDING | ACCOUNTS_PENDING | COMPLETE`
— drives the routing currently done by `isOnboarded()` in `App.jsx`.

Access tokens are **never** written to `localStorage`. Refresh token → `HttpOnly; Secure;
SameSite=Strict` cookie; access token in memory only.

---

## 3. Consent & account linking

Replaces `engine/mockProviderData.js` + `components/ConnectAccounts.jsx`.
Modelled on the **RBI Account Aggregator (ReBIT 2.0)** flow, so the sandbox mock and the real
AA are the same contract.

### `GET /v1/providers`

```json
{ "items": [
  { "providerId": "aa:onemoney", "label": "OneMoney", "kind": "ACCOUNT_AGGREGATOR", "fiTypes": ["DEPOSIT","MUTUAL_FUNDS"], "status": "AVAILABLE" },
  { "providerId": "fip:idbi",     "label": "IDBI Bank", "kind": "FIP", "fiTypes": ["DEPOSIT"], "status": "AVAILABLE" },
  { "providerId": "depo:cams",    "label": "CAMS/KFin", "kind": "RTA", "fiTypes": ["MUTUAL_FUNDS"], "status": "AVAILABLE" }
] }
```

### `POST /v1/consents` — `Idempotency-Key` required

```json
{
  "providerId": "aa:onemoney",
  "fiTypes": ["DEPOSIT", "MUTUAL_FUNDS"],
  "purposeCode": "101",
  "purposeText": "Personal finance management and wealth advisory",
  "fetchType": "PERIODIC",
  "frequency": { "unit": "DAY", "value": 1 },
  "dataRange": { "from": "2025-08-01", "to": "2026-08-24" },
  "consentExpiry": "2027-08-24T00:00:00Z",
  "dataLife": { "unit": "YEAR", "value": 1 }
}
```

**201**

```json
{
  "consentId": "cns_01J8...",
  "status": "PENDING",
  "redirectUrl": "https://onemoney.in/consent/abc123?redirect=...",
  "expiresAt": "2026-08-24T09:45:00Z"
}
```

The client opens `redirectUrl`; the AA authenticates the customer independently.
**MITRA never sees or handles the customer's bank credentials.** The `consentField` text
input in today's `ConnectAccounts.jsx` must be removed — collecting a broker Client ID in our
own UI is a phishing-shaped pattern a bank cannot ship.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/consents/{id}` | `PENDING → ACTIVE → (PAUSED\|REVOKED\|EXPIRED)` |
| `POST` | `/consents/{id}/fetch` | Trigger an FI data pull → `202` + `jobId` |
| `DELETE`| `/consents/{id}` | Revoke. **Must** purge derived data per `dataLife`. |
| `GET` | `/consents` | All consents — this is the customer's DPDP consent dashboard. |

**Webhook (AA → MITRA):** `POST {callbackUrl}` signed `X-Mitra-Signature: sha256=...`
(HMAC over the raw body, 5-minute timestamp window, constant-time compare).

---

## 4. Statement ingestion

Replaces `components/UploadStatements.jsx` + `engine/statementImport.js`.
Parsing moves server-side: it needs OCR for PDFs, and the categoriser must be improvable
without shipping a new frontend.

### `POST /v1/ingest/uploads`

```json
{ "filename": "statement-jun.pdf", "contentType": "application/pdf", "sizeBytes": 284410, "documentType": "BANK_STATEMENT" }
```

**201** — presigned S3 `PUT`, so the file never transits our API.

```json
{
  "uploadId": "upl_01J8...",
  "uploadUrl": "https://mitra-ingest-sbx.s3.ap-south-1.amazonaws.com/...",
  "method": "PUT",
  "headers": { "x-amz-server-side-encryption": "aws:kms", "x-amz-server-side-encryption-aws-kms-key-id": "arn:aws:kms:..." },
  "expiresIn": 900
}
```

Accepted: `text/csv`, `application/pdf`, `application/vnd.ms-excel`, OFX/QIF. Max 25 MB.
Password-protected PDFs → `POST /ingest/uploads/{id}/unlock` with the password
(**never persisted**, held in memory for the Textract call only).

### `POST /v1/ingest/jobs`

```json
{ "uploadIds": ["upl_01J8..."], "documentType": "BANK_STATEMENT" }
```

**202** → `{ "jobId": "job_01J8...", "status": "QUEUED", "pollAfterMs": 2000 }`

### `GET /v1/ingest/jobs/{id}`

```json
{
  "jobId": "job_01J8...",
  "status": "COMPLETED",
  "stages": [
    { "name": "VIRUS_SCAN",  "status": "COMPLETED" },
    { "name": "EXTRACT",     "status": "COMPLETED", "detail": "Textract: 3 pages, 148 rows" },
    { "name": "NORMALISE",   "status": "COMPLETED" },
    { "name": "CATEGORISE",  "status": "COMPLETED", "detail": "141/148 categorised, 7 need review" },
    { "name": "PERSIST",     "status": "COMPLETED" },
    { "name": "RECOMPUTE",   "status": "COMPLETED" }
  ],
  "result": {
    "transactionsImported": 148,
    "holdingsImported": 0,
    "periodCovered": { "from": "2026-04-01", "to": "2026-06-30" },
    "needsReview": [
      { "txnId": "txn_01J8...", "date": "2026-05-14", "description": "NEFT-XXTRD-9921", "amount": 1250000, "suggestedCategory": "OTHER", "confidence": 0.31 }
    ],
    "warnings": ["3 rows had unparseable dates and were skipped"]
  }
}
```

**Two things the prototype gets wrong that this fixes:** PDF uploads currently no-op silently
(`UploadStatements.jsx:50`), and unparseable dates silently corrupt income
(`statementImport.js:163`). Both become explicit, surfaced outcomes.

`PATCH /v1/transactions/{id}` lets the customer correct a category — the correction is the
training signal for the categoriser.

---

## 5. Derived insights — the advice engine

Every response carries `provenance` and an `explain` block. **`explain` is a compliance
requirement, not a nicety:** the bank must be able to reconstruct why a customer was told
something, months later.

| Method | Path | Replaces |
|---|---|---|
| `GET` | `/insights/health-score` | `healthScore()` |
| `GET` | `/insights/nudges` | `topNudges()` |
| `GET` | `/insights/allocation-drift?riskProfile=` | `drift()` |
| `GET` | `/insights/portfolio-xray` | `xray()` |
| `GET` | `/insights/protection-gap` | `protectionGap()` |
| `GET` | `/insights/tax-optimisation` | `taxGap()` + `ltcgHarvest()` |
| `GET` | `/insights/goal-collision` | `goalCollision()` |
| `GET` | `/insights/money-persona` | `moneyPersona()` |
| `GET` | `/insights/spending-anomalies` | `spendingAnomalies()` |
| `POST` | `/insights/wealth-projection` | `projectWealth()` |
| `POST` | `/simulate/sip` | `sipFutureValue()` / `sipRequired()` |
| `POST` | `/simulate/prepay-vs-invest` | `prepayVsInvest()` |

### `GET /v1/insights/health-score` → 200

```json
{
  "total": 68,
  "grade": "GOOD",
  "components": [
    {
      "key": "SAVINGS_RATE",
      "label": "Savings Rate",
      "score": 21.3, "max": 25,
      "actual": 25.6, "target": 30, "unit": "PCT",
      "note": "26% of income saved (target 30%)"
    },
    {
      "key": "EMERGENCY_COVER",
      "label": "Emergency Cover",
      "score": 17.4, "max": 25,
      "actual": 4.2, "target": 6, "unit": "MONTHS",
      "note": "4.2 months of expenses covered (target 6)"
    }
  ],
  "trend": [ { "month": "2026-06", "total": 64 }, { "month": "2026-07", "total": 66 } ],
  "explain": {
    "policyVersion": "health-score@1.3.0",
    "inputs": { "avgIncome": 9500000, "avgSpend": 7067000, "savingsBalance": 26450000, "equityPct": 17.3 },
    "assumptions": [
      { "key": "EMERGENCY_MONTHS_TARGET", "value": 6, "source": "IDBI advisory policy v2" },
      { "key": "SAVINGS_RATE_TARGET_PCT", "value": 30, "source": "IDBI advisory policy v2" }
    ]
  },
  "provenance": { "...": "..." }
}
```

> **The `assumptions` array is where the audit's §3.3 hardcodes go.** `400000`, `monthsLeft = 9`,
> `0.312`, `1500000`, `125000`, `0.125`, the `11%` return — all become server-side **policy
> parameters**, versioned, dated, and returned with the answer. When the Union Budget changes
> the LTCG exemption, one policy record changes; no code ships. This is the single highest-value
> item in the whole migration.

### `POST /v1/insights/wealth-projection`

```json
{
  "extraMonthlyInvestment": 1500000,
  "expectedReturnPct": 11,
  "toAge": 60,
  "events": [ { "age": 32, "label": "Home down payment", "oneTimeCost": 250000000, "monthlyDelta": -1800000 } ]
}
```

**200**

```json
{
  "series": [ { "age": 29, "wealth": 62690000, "invested": 62690000, "freedomTarget": 2120100000 } ],
  "financialFreedomAge": 51,
  "wealthAtTargetAge": 418200000,
  "scenarios": {
    "pessimistic": { "returnPct": 8,  "wealthAtTargetAge": 289400000, "financialFreedomAge": 56 },
    "base":        { "returnPct": 11, "wealthAtTargetAge": 418200000, "financialFreedomAge": 51 },
    "optimistic":  { "returnPct": 14, "wealthAtTargetAge": 612800000, "financialFreedomAge": 48 }
  },
  "disclaimer": "Projections are illustrative, assume constant returns, and are not a guarantee. Market-linked investments carry risk.",
  "explain": { "...": "..." },
  "provenance": { "...": "..." }
}
```

**`scenarios` is mandatory, not optional.** The prototype shows a single deterministic curve
at 11%. Presenting one number as *the* outcome is exactly the mis-selling pattern regulators
penalise. Every projection must ship a band.

### `GET /v1/insights/nudges` → 200

```json
{
  "items": [
    {
      "nudgeId": "ndg_01J8...",
      "kind": "SURPLUS_IDLE",
      "priority": 1,
      "severity": "OPPORTUNITY",
      "icon": "bulb",
      "title": "₹12,450 idle every month",
      "body": "Money left in savings earns ~3%. A SIP could earn ~11% — about ₹27.4L in 10 years vs ₹17.4L idle.",
      "quantifiedBenefit": { "amount": 100000000, "horizonYears": 10, "metric": "PROJECTED_DIFFERENCE" },
      "suggestedAction": { "type": "START_SIP", "params": { "monthlyAmount": 1200000, "productCategory": "INDEX_FUND" } },
      "cta": "Invest my surplus",
      "dismissible": true,
      "expiresAt": "2026-09-24T00:00:00Z",
      "explain": { "...": "..." }
    }
  ],
  "provenance": { "...": "..." }
}
```

`POST /v1/nudges/{id}/dismiss` with `{ "reason": "NOT_RELEVANT" }` — dismissals feed ranking.

---

## 6. Reference data (not customer-owned)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/market/pulse` | Replaces the static `market` literal. Backed by a licensed NSE/BSE feed. |
| `GET` | `/benchmarks/peers` | Replaces hand-authored `peers`. **Must be k-anonymous — minimum cohort size 1,000**, or it leaks. Returns `403` if the customer's cohort is too small. |
| `GET` | `/products/catalogue?category=` | IDBI-distributed products. Replaces `modelPortfolios`. Each entry carries `riskometer`, `expenseRatio`, `sebiCategory`, `benchmark`. |
| `GET` | `/policy/assumptions` | The full assumption set (returns, tax rates, targets) with effective dates. Makes the engine's beliefs inspectable. |

---

## 7. Actions — advice → execution

Replaces `engine/portfolioState.js`. In the prototype an "applied action" is a localStorage
entry. In a bank it is either a real instruction or an explicitly simulated one — and the
difference must be unmistakable in the payload.

### `POST /v1/actions` — `Idempotency-Key` required

```json
{
  "type": "START_SIP",
  "mode": "SIMULATED",
  "params": { "monthlyAmount": 1200000, "productId": "prd_nifty50_direct", "startDate": "2026-09-01", "stepUpPct": 0 },
  "sourceNudgeId": "ndg_01J8...",
  "acknowledgedDisclosures": ["MARKET_RISK", "EXPENSE_RATIO", "NO_GUARANTEED_RETURN"]
}
```

`mode`: `SIMULATED` (sandbox / what-if — affects insights only) or `EXECUTED` (real
instruction to the transaction system; requires MFA re-auth and a signed mandate).

**201**

```json
{
  "actionId": "act_01J8...",
  "type": "START_SIP",
  "mode": "SIMULATED",
  "status": "APPLIED",
  "appliedAt": "2026-08-24T09:20:00Z",
  "reversible": true,
  "impact": { "monthlySurplusDelta": -1200000, "healthScoreDelta": 4, "projectedWealthDelta": 100000000 },
  "auditRef": "aud_01J8..."
}
```

Types: `START_SIP · ENABLE_ROUNDUP · SWITCH_TO_DIRECT · HARVEST_LTCG · PREPAY_LOAN ·
CANCEL_SUBSCRIPTION · TOP_UP_PROTECTION · FIX_EMERGENCY_FUND · REBALANCE`

`GET /v1/actions` · `DELETE /v1/actions/{id}` (reverse, if `reversible`)

### Money rules

`GET /v1/rules` · `PATCH /v1/rules`

```json
{ "salaryDayAutoInvest": true, "sweepToFd": false, "diningAlert": true, "annualStepUp": false }
```

---

## 8. Goals

| Method | Path |
|---|---|
| `GET` | `/goals` |
| `POST` | `/goals` |
| `GET` | `/goals/{id}` |
| `PATCH` | `/goals/{id}` (`If-Match`) |
| `DELETE` | `/goals/{id}` |
| `GET` | `/goals/{id}/plan?expectedReturnPct=11` |
| `POST` | `/goals/extract` | NL → structured goal (replaces `deepseek.extractGoal`) |

**`GET /v1/goals/{id}/plan` → 200**

```json
{
  "goalId": "gol_01J8...",
  "requiredMonthlySip": 1834500,
  "currentMonthlyContribution": 500000,
  "shortfall": 1334500,
  "progressPct": 13.2,
  "onTrack": false,
  "projectedShortfallAtTarget": 118400000,
  "recommendedProducts": [ { "productId": "prd_...", "allocationPct": 70, "rationale": "6-year horizon supports equity tilt" } ],
  "scenarios": { "pessimistic": { "...": "..." }, "base": { "...": "..." }, "optimistic": { "...": "..." } },
  "explain": { "...": "..." }
}
```

---

## 9. Risk profiling

| Method | Path |
|---|---|
| `GET` | `/risk-profile` |
| `GET` | `/risk-profile/questionnaire` |
| `POST` | `/risk-profile/assessment` |

```json
{
  "answers": [ { "questionId": "q1", "optionId": "q1c" } ],
  "derivedSignals": { "observedEquityPct": 17.3, "incomeVolatilityCv": 0.04, "age": 29 }
}
```

**201**

```json
{
  "band": "BALANCED",
  "score": 8,
  "capacity": "HIGH", "tolerance": "MODERATE", "need": "MODERATE",
  "source": "QUESTIONNAIRE",
  "derivedSuggestion": "AGGRESSIVE",
  "divergenceNote": "Your answers indicate moderate tolerance, but your age and stable income support more equity. We use the more conservative of the two.",
  "assessedAt": "2026-08-24T09:00:00Z",
  "validUntil": "2027-08-24T09:00:00Z",
  "targetAllocation": [ { "assetClass": "EQUITY", "pct": 55 }, { "assetClass": "DEBT", "pct": 30 }, { "assetClass": "GOLD", "pct": 10 }, { "assetClass": "CASH", "pct": 5 } ]
}
```

**Two deliberate changes from `riskDerivation.js`.** First, it splits capacity / tolerance /
need, as SEBI profiling norms expect. Second, when the questionnaire and the derived signal
disagree, **the conservative band wins** and the divergence is disclosed. The prototype's
derived path currently *replaces* the questionnaire and marks onboarding complete
(`personas.js:saveCustomPersonaAndActivate`) — a real advisor cannot skip a documented
assessment. `validUntil` forces annual re-assessment.

---

## 10. Conversational advisor

Replaces `engine/advisor.js` + `engine/deepseek.js`. **The LLM key moves server-side.**

### `POST /v1/advisor/messages` — SSE

```
Accept: text/event-stream
```

```json
{
  "conversationId": "cnv_01J8...",
  "message": "Should I prepay my education loan or invest?",
  "language": "en",
  "mode": "AUTO",
  "clientContext": { "screen": "wealth-dashboard" }
}
```

`mode`: `AUTO` (deterministic intent engine, falls back to LLM) · `DETERMINISTIC` (rule
engine only — works offline, zero LLM cost) · `REASONING` (streams chain-of-thought).

**Stream**

```
event: intent
data: {"intent":"PREPAY_VS_INVEST","confidence":0.94,"handler":"DETERMINISTIC"}

event: reasoning
data: {"delta":"Loan rate is 10.5% post-tax; expected equity return 11% pre-tax..."}

event: token
data: {"delta":"Your education loan is at 10.5%"}

event: widget
data: {"type":"PREPAY_COMPARISON","payload":{"interestSaved":4210000,"monthsSaved":7,"investGain":3890000}}

event: done
data: {
  "messageId":"msg_01J8...",
  "mood":"thinking",
  "chips":["Prepay ₹50,000","Show my loan"],
  "disclosures":["NOT_INVESTMENT_ADVICE","MARKET_RISK"],
  "citations":[{"field":"loan.interestRatePct","value":10.5,"source":"aa:IDBI-LOAN-****9921","asOf":"2026-08-23"}],
  "guardrail":{"triggered":false},
  "tokensUsed":412,
  "latencyMs":1840
}
```

**`citations` is non-negotiable.** Every number in the reply names the field and source it came
from. This is the server-side version of the `meta` provenance stamp already in `advisor.js`,
and it is what makes the advice auditable.

`guardrail.triggered: true` means the model output was blocked or rewritten (guaranteed-return
language, a specific stock tip, a product outside the customer's risk band). The event carries
`{ "triggered": true, "policy": "NO_GUARANTEED_RETURNS", "action": "REWRITTEN" }`.

| Method | Path |
|---|---|
| `GET` | `/advisor/conversations` · `/advisor/conversations/{id}` |
| `DELETE`| `/advisor/conversations/{id}` |
| `POST` | `/advisor/offer-analysis` — scam/mis-selling check (replaces `analyzeOffer`) |
| `POST` | `/advisor/translate` — replaces client-side `translate`; prefer pre-translated server strings for the deterministic path |
| `POST` | `/advisor/escalate` — hand off to a human RM; returns a ticket + callback window |

### `POST /v1/advisor/offer-analysis`

```json
{ "offerText": "Guaranteed 30% returns monthly! Join our Telegram...", "channel": "WHATSAPP" }
```

**200**

```json
{
  "verdict": "AVOID",
  "safetyScore": 4,
  "headline": "This has the hallmarks of an investment scam.",
  "redFlags": [
    { "flag": "GUARANTEED_RETURNS", "detail": "30% monthly is ~2,300% annualised. No SEBI-regulated product can promise this.", "severity": "CRITICAL" },
    { "flag": "UNREGISTERED_ENTITY", "detail": "No SEBI registration number provided.", "severity": "HIGH" }
  ],
  "hiddenCosts": [],
  "realityCheck": "Equity mutual funds have historically returned 11–14% annually, with years of negative returns.",
  "recommendedAction": "Do not transfer money. Report to cybercrime.gov.in or 1930.",
  "reportingLinks": [ { "label": "National Cybercrime Portal", "url": "https://cybercrime.gov.in" } ],
  "provenance": { "...": "..." }
}
```

---

## 11. Gamification, notifications, privacy

| Method | Path | Notes |
|---|---|---|
| `GET` | `/xp` · `POST /xp/events` | Replaces `engine/xp.js` |
| `GET` | `/notifications` · `POST /notifications/{id}/read` | |
| `POST` | `/notifications/subscribe` | Web Push / FCM token |
| `GET` | `/privacy/data-export` | DPDP portability — `202`, emailed link |
| `POST` | `/privacy/erasure` | DPDP right to erasure; `202` + SLA date |
| `GET` | `/privacy/consent-log` | Immutable audit of every consent grant/revoke |
| `GET` | `/privacy/advice-log` | Every recommendation shown, with inputs and engine version |

---

## 12. Ops

| Method | Path |
|---|---|
| `GET` | `/health` (public, unauthenticated) |
| `GET` | `/health/deep` (internal — checks DB, AA, Bedrock) |
| `GET` | `/version` |

---

## 13. Rate limits

| Tier | Limit |
|---|---|
| Read endpoints | 120 req/min per customer |
| `POST /advisor/messages` | 20 req/min, 200/day per customer |
| `POST /ingest/jobs` | 10/hour per customer |
| `POST /consents` | 5/hour per customer |
| Unauthenticated `/auth/*` | 10 req/min per IP, exponential backoff on failure |

Headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`.

---

## 14. Versioning & deprecation

- Path-versioned (`/v1`). Breaking changes → `/v2`.
- Additive changes ship in `v1`; clients must **ignore unknown fields**.
- Deprecation: `Deprecation: <date>` + `Sunset: <date>` headers, minimum 90 days' notice.

---

## 15. Frontend migration path

The refactor that unblocks everything else, in order:

1. **Introduce a data-access layer.** Create `src/api/client.js` and `src/hooks/useSnapshot.js`.
   Keep `data/customer.js`'s export names, but source them from a React context fed by
   `GET /me/snapshot`. Components stay untouched initially.
2. **Add loading / error / stale states.** Today there are none — this is where the real work is.
3. **Move `engine/analytics.js` to the server verbatim**, then delete the client copy. Keep the
   pure functions; run the *same file* in Lambda. Golden-file tests assert client and server
   agree on every persona before the client copy is removed.
4. **Delete `mockProviderData.js`** and point `ConnectAccounts` at `/consents`. Remove the
   credential input field.
5. **Delete `engine/auth.js`**; move tokens out of `localStorage`.
6. **Delete `engine/deepseek.js`**; point `AvatarChat` at `/advisor/messages` (SSE).
7. **Keep `portfolioState.js` as a write-through cache** over `/actions` for optimistic UI.

A mock server generated from `openapi.yaml` (Prism, one command) lets step 1 start today,
before any AWS resource exists.
