# MITRA — Sandbox & Production Requirements

**Purpose:** What it takes to move MITRA from a static browser prototype to a sandbox
environment on AWS with real (or realistically-shaped) customer data.
**Audience:** IDBI infrastructure + risk/compliance reviewers, and the build team.
**Companion docs:** `DATA_AUDIT.md` (current state), `API_CONTRACT.md` + `openapi.yaml` (interface).

---

## 1. Where we are, and what changes

| | Today | Sandbox target |
|---|---|---|
| Architecture | Static SPA, no backend | SPA + API + async ingest pipeline |
| Data source | 2 hand-authored personas + `Math.random()` | AA sandbox / synthetic-but-realistic corpus |
| Advice engine | Runs in the browser | Runs server-side, versioned, audited |
| LLM | DeepSeek key in `localStorage`, called from browser | Amazon Bedrock, server-side, guardrailed |
| Auth | Plaintext passwords in `localStorage` | Cognito (sandbox) → IDBI IdP federation (prod) |
| State | 11 `localStorage` keys | DynamoDB + Aurora, tokens in `HttpOnly` cookies |
| Audit | None | CloudTrail + immutable advice log |
| Tests | None | Golden-file parity + contract tests |

**The one-sentence version:** the analytics are good and should be preserved almost verbatim;
everything around them — where data comes from, where compute happens, and who can see it —
has to be rebuilt.

---

## 2. Target AWS architecture

**Region: `ap-south-1` (Mumbai), DR in `ap-south-2` (Hyderabad).** Non-negotiable — RBI's
2018 storage directive requires payment-system data to reside in India, and DPDP-era guidance
plus IDBI's own policy will extend that to customer financial data. **No cross-region
replication outside India for any bucket, table, or backup.**

```
                            ┌─────────────────────────────────────┐
  Customer browser ──HTTPS──▶ CloudFront + WAF                    │
                            │  └─ S3 (SPA static assets, OAC)     │
                            └──────────────┬──────────────────────┘
                                           │ /v1/*
                            ┌──────────────▼──────────────────────┐
                            │ API Gateway (HTTP API) + WAF        │
                            │  Cognito JWT authorizer, throttling │
                            └──────────────┬──────────────────────┘
                                           │
        ┌──────────────────────────────────┼───────────────────────────────┐
        │                    Lambda (Node 20, ARM64) in VPC                │
        │  fn-auth   fn-snapshot   fn-insights   fn-advisor   fn-consent   │
        │  fn-goals  fn-actions    fn-ingest-api fn-reference              │
        └───┬──────────────┬─────────────┬──────────────┬──────────────────┘
            │              │             │              │
     ┌──────▼─────┐ ┌──────▼──────┐ ┌────▼──────┐ ┌─────▼──────────────────┐
     │ DynamoDB   │ │ Aurora      │ │ Bedrock   │ │ Step Functions         │
     │ (single-   │ │ Serverless  │ │ (Claude)  │ │  ingest pipeline       │
     │  table)    │ │ v2 Postgres │ │ Guardrails│ │  ┌──────────────────┐  │
     │ profile,   │ │ txns,       │ └───────────┘ │  │ GuardDuty scan   │  │
     │ consents,  │ │ holdings,   │               │  │ Textract (PDF)   │  │
     │ actions,   │ │ time-series │               │  │ Normalise        │  │
     │ chat, XP   │ │ analytics   │               │  │ Categorise       │  │
     └────────────┘ └─────────────┘               │  │ Persist          │  │
                                                  │  │ Recompute        │  │
     ┌────────────┐ ┌─────────────┐ ┌───────────┐ │  └──────────────────┘  │
     │ S3 ingest  │ │ Secrets Mgr │ │ KMS CMK   │ └────────────────────────┘
     │ (SSE-KMS,  │ │ AA creds,   │ │ per-env,  │
     │  90d TTL)  │ │ feed keys   │ │ rotating  │      EventBridge
     └────────────┘ └─────────────┘ └───────────┘   (AA webhooks, nightly
                                                     recompute, market pull)
     Observability: CloudWatch Logs/Metrics · X-Ray · CloudTrail (org trail,
     immutable, separate log-archive account) · Security Hub · Config
```

### 2.1 Service choices and why

| Concern | Service | Rationale |
|---|---|---|
| Compute | **Lambda (Node 20, ARM64)** | The engine is already pure JS. Zero idle cost matters for a sandbox that sits unused between demos. Move `fn-advisor` to Fargate only if SSE cold starts hurt. |
| API | **API Gateway HTTP API** | Cheaper and faster than REST API; native JWT authorizer. Use REST API only if you need request validation against the OpenAPI schema at the gateway. |
| Key-value | **DynamoDB single-table**, PK `CUST#<id>`, SK `PROFILE` / `CONSENT#<id>` / `ACTION#<ts>` / `MSG#<ts>` | Every access pattern is customer-scoped. On-demand billing; PITR on. |
| Relational | **Aurora Serverless v2 Postgres** (min 0.5 ACU) | Transactions and holdings need `GROUP BY month, category` and window functions. Forcing that into DynamoDB is the classic mistake. Scales to zero-ish between demos. |
| Objects | **S3** — `mitra-ingest-sbx` (SSE-KMS, 90-day lifecycle, versioning, Block Public Access) | Raw statements. Presigned PUT so files never transit Lambda. |
| PDF extraction | **Amazon Textract** `AnalyzeDocument` (TABLES) | Fixes the silent PDF no-op in `UploadStatements.jsx:50`. |
| LLM | **Amazon Bedrock** — Claude Sonnet 5 (chat), Claude Haiku 4.5 (classification/categorisation) | Keeps the key server-side, stays in-region, gives Guardrails + model invocation logging. This directly retires the `localStorage` API-key risk. |
| Guardrails | **Bedrock Guardrails** | Denied topics: guaranteed returns, specific stock tips, tax evasion. PII masking on input. Blocked-word list for competitor products. |
| Orchestration | **Step Functions (Express)** | The ingest pipeline is 6 stages with retries — visible state beats a chain of Lambdas. |
| Events | **EventBridge** | AA webhooks, nightly insight recompute, market-close data pull. |
| Secrets | **Secrets Manager** (auto-rotate 90d) | AA client creds, market feed key. Never in env vars. |
| Encryption | **KMS CMK per environment** | Field-level envelope encryption for PAN, account numbers, name. Key policy denies `Decrypt` to anyone but the app roles. |
| Front end | **CloudFront + S3 + OAC**, or **Amplify Hosting** | Amplify for speed of setup; CloudFront when you need custom WAF rules and cache behaviours. |
| WAF | **AWS WAF** on CloudFront + API GW | Managed rule sets, rate rules, geo-restriction to India for the sandbox. |

### 2.2 Environments

| Env | Account | Data | Access |
|---|---|---|---|
| `dev` | Sandbox account | Synthetic only | Team, open |
| `sbx` | Sandbox account | AA sandbox + synthetic corpus | Team + reviewers, IP-allowlisted |
| `uat` | Pre-prod account | Masked production-shaped data | Named testers, MFA |
| `prod` | Production account | Real customer data | Break-glass only, full CloudTrail |

Separate AWS accounts under Organizations, not separate VPCs in one account. SCPs deny
region use outside `ap-south-*` and deny disabling CloudTrail.

### 2.3 Indicative sandbox cost (monthly, low demo traffic)

| Item | Estimate |
|---|---|
| Lambda + API Gateway | $5–15 |
| DynamoDB on-demand + PITR | $5–10 |
| Aurora Serverless v2 (0.5 ACU floor, ~8h/day active) | **$45–90** |
| S3 + Textract (≈500 pages/mo) | $10–20 |
| Bedrock (≈2,000 conversations/mo, Sonnet + Haiku mix) | **$40–120** |
| CloudFront + WAF | $15–25 |
| KMS, Secrets Manager, CloudWatch, X-Ray | $15–25 |
| **Total** | **≈ $135–305 / month** |

Aurora and Bedrock dominate. If budget is tight for the hackathon stage: drop Aurora, keep
everything in DynamoDB with pre-aggregated monthly rollups, and route all LLM traffic to
Haiku. That lands nearer **$60–90/month** at the cost of ad-hoc query flexibility.

---

## 3. Data integration requirements

### 3.1 Account Aggregator (the real path)

This replaces `engine/mockProviderData.js` entirely.

**R-AA-1** Integrate with one RBI-licensed AA (Onemoney, Finvu, CAMS Finserv, or NADL).
Their sandbox is the fastest route to realistic data.
**R-AA-2** Implement the ReBIT 2.0 flow: `ConsentRequest` → customer authenticates **on the
AA's own surface** → `ConsentArtefact` → `FIDataRequest` → encrypted FI response.
**R-AA-3** Implement ECC-Curve25519 / Diffie-Hellman key exchange for the FI data channel per
the ReBIT spec. Data arrives encrypted and must be decrypted in-process, never persisted raw.
**R-AA-4** Map ReBIT FI schemas (`DEPOSIT`, `MUTUAL_FUNDS`, `EQUITIES`, `INSURANCE_POLICIES`,
`NPS`) onto the `Holding` / `Transaction` / `InsurancePolicy` schemas in `openapi.yaml`.
**R-AA-5** Honour `dataLife` — when a consent expires or is revoked, purge derived data within
24 hours and record the purge in the consent log.
**R-AA-6** Webhook signature verification (HMAC-SHA256, 5-minute timestamp window,
constant-time compare) with replay protection.

> **Remove the credential-collection UI.** `ConnectAccounts.jsx` currently asks for a broker
> Client ID in our own form. Even simulated, that is a phishing-shaped pattern a bank cannot
> ship — and it will be flagged in any security review. Under AA, the customer authenticates
> on the aggregator's surface and MITRA never sees a credential.

**Lead time:** AA onboarding involves a commercial agreement and technical certification.
Budget **4–8 weeks of elapsed time**, largely outside the team's control. Start it in week 1
and build against the synthetic corpus meanwhile.

### 3.2 Synthetic corpus (the unblocking path — do this first)

**R-SYN-1** Generate **200–500 synthetic customers** spanning: salaried metro, self-employed
tier-2, retired pensioner, gig worker with irregular income, high-net-worth, **and a
zero-holdings new customer**. That last one is what breaks `analytics.js` today
(`xray()` at line 310, `loans[0]` at line 353).
**R-SYN-2** Generate **24 months** of transactions per customer with realistic seasonality —
festival spikes, bonus months, rent-day clustering, salary-date variance.
**R-SYN-3** Deterministic generation from a seed. `Math.random()` in `mockProviderData.js`
makes every demo different and every bug unreproducible.
**R-SYN-4** Include deliberately adversarial rows: unparseable dates, duplicate txns, refunds
and reversals, ₹0 amounts, 60-character merchant strings, mixed date formats within one file,
UTF-8 merchant names in Devanagari and Tamil.
**R-SYN-5** Fixture files committed to the repo, used by the golden-file tests in §5.

This is the highest-leverage item in the whole plan. It costs days, not weeks, it unblocks
every other workstream, and it can start immediately.

### 3.3 Market and product data

**R-MKT-1** Licensed NSE/BSE EOD feed for index levels. Free scraping is a licensing
violation a bank cannot carry.
**R-MKT-2** AMFI daily NAV file (`portal.amfiindia.com`) for MF NAVs — free and officially
published.
**R-MKT-3** Expense ratios and SEBI category from AMC factsheets or a data vendor. Replaces
the hand-authored `fundFacts`.
**R-MKT-4** Cache EOD data with a 24h TTL; never call an upstream feed in a request path.

### 3.4 Statement ingestion

**R-ING-1** Move parsing server-side. Port `csvParser.js` + `statementImport.js` as-is; they
are sound.
**R-ING-2** Textract for PDF statements, with a bank-specific template layer for the 8–10
largest Indian banks (their PDF layouts are stable and distinct).
**R-ING-3** Password-protected PDF support. Password held in memory for the extraction call
only — **never persisted, never logged**.
**R-ING-4** Replace the 10-rule keyword categoriser with a two-stage design: deterministic
merchant-map first (fast, free, explainable), Bedrock Haiku fallback for the tail. Cache by
normalised merchant string so each unique merchant costs one inference ever.
**R-ING-5** Surface a `needsReview` queue for low-confidence rows. Customer corrections are
the training signal.
**R-ING-6** Virus scan (GuardDuty Malware Protection for S3) before any parse.
**R-ING-7** Delete raw uploads after 90 days; keep only derived transactions.
**R-ING-8** **Fix `statementImport.js:163`** — the `Math.random()` fallback for unparseable
dates silently corrupts computed income and makes it non-deterministic.

---

## 4. Security & compliance requirements

### 4.1 Must-fix before any real data touches the system

| ID | Requirement | Replaces |
|---|---|---|
| **R-SEC-1** | No credentials in `localStorage`. Access token in memory, refresh token in `HttpOnly; Secure; SameSite=Strict` cookie. | `auth.js` plaintext passwords |
| **R-SEC-2** | LLM keys server-side only. All inference via Bedrock with an IAM role. | `deepseek.js:23` |
| **R-SEC-3** | TLS 1.3 in transit; KMS CMK at rest; field-level envelope encryption for PAN, account number, name, DOB. | nothing today |
| **R-SEC-4** | MFA required before consent creation and before any `mode: EXECUTED` action. | none |
| **R-SEC-5** | CSP header, no `unsafe-inline`. Subresource integrity on any third-party asset. | none |
| **R-SEC-6** | Secrets in Secrets Manager with 90-day rotation. Never in env vars or code. | none |
| **R-SEC-7** | Least-privilege IAM per Lambda. No wildcard resource ARNs. | none |
| **R-SEC-8** | VPC with private subnets; VPC endpoints for S3, DynamoDB, Bedrock, Secrets Manager, KMS. No NAT-gateway egress for data-plane functions. | none |
| **R-SEC-9** | Structured logging with PII redaction at the logger, not the log group. Account numbers and PAN never reach CloudWatch. | none |
| **R-SEC-10** | Penetration test + SAST/DAST in CI before UAT. | none |

### 4.2 RBI / DPDP / SEBI

| ID | Requirement |
|---|---|
| **R-REG-1** | **Data localisation.** All data, backups and logs in `ap-south-1` / `ap-south-2`. SCP-enforced. |
| **R-REG-2** | **DPDP Act 2023 — consent.** Specific, informed, unambiguous, purpose-limited, freely revocable. `GET /privacy/consent-log` is the customer-facing artifact. |
| **R-REG-3** | **DPDP — data principal rights.** Access, correction, erasure, portability, grievance redressal. Endpoints exist in the contract (§11); SLA for erasure is 30 days. |
| **R-REG-4** | **DPDP — breach notification.** Documented runbook; notify the Data Protection Board and affected principals without delay. |
| **R-REG-5** | **Purpose limitation.** Data pulled for "wealth advisory" cannot feed credit scoring or marketing without fresh consent. Enforce with per-purpose IAM scoping, not policy prose. |
| **R-REG-6** | **SEBI positioning.** Without an RIA licence, MITRA is *financial education and guidance*, not *investment advice*. Every screen carries a disclaimer. **The `analyzeOffer` scam-check and generic asset-allocation guidance are fine; naming a specific scheme to buy is not** — this is why `/products/catalogue` returns `riskometer` and `disclaimer` on every entry. Get counsel's read before launch. |
| **R-REG-7** | **Risk profiling.** Documented capacity/tolerance/need assessment with an auditable record and annual review (`validUntil` in the contract). The current derived-only path in `riskDerivation.js` does not meet this on its own. |
| **R-REG-8** | **Advice audit trail.** Every recommendation stored with input snapshot, engine version, policy version, and what the customer did. Retain 8 years per SEBI record-keeping norms. |
| **R-REG-9** | **No guaranteed returns, ever.** Enforced three ways: Bedrock Guardrail denied-topic, a server-side output filter, and a linted phrase blocklist in the deterministic response templates. |
| **R-REG-10** | **Projections must show a band.** Never a single deterministic curve. Enforced by the `ScenarioBand` schema being required on every projection response. |

### 4.3 Model governance

**R-AI-1** Version and store every prompt; log model ID, prompt version, input hash and output
hash per invocation (Bedrock model invocation logging → S3).
**R-AI-2** Human review queue sampling ≥5% of LLM replies during sandbox and UAT.
**R-AI-3** Grounding rule: the LLM may only restate numbers present in the supplied context. A
post-generation check extracts every ₹ figure from the reply and asserts it appears in the
context — reject and retry deterministically on mismatch. This is what makes the `citations`
array in `AdvisorReply` honest rather than decorative.
**R-AI-4** Fallback path: when Bedrock is unavailable, `mode: DETERMINISTIC` must still answer.
The rule engine in `advisor.js` already does this — preserve it. It is a genuine resilience
asset, not a stopgap.
**R-AI-5** Never send raw PAN, account numbers, or full name to the model. Send derived
aggregates and masked identifiers only.

---

## 5. Engineering requirements

### 5.1 Correctness

**R-ENG-1** **Golden-file parity tests.** Snapshot every analytics output for all synthetic
personas *before* moving the engine server-side; assert byte-identical results after. This is
what makes the port safe.
**R-ENG-2** **Unit tests on the money math** — `sipFutureValue`, `sipRequired`, the
amortisation loop in `prepayVsInvest`, `projectWealth`. Verify against independent
calculations. These numbers are the product; they are currently untested.
**R-ENG-3** **Contract tests** — validate every response against `openapi.yaml` in CI.
**R-ENG-4** **Integer paise everywhere.** Float rupees will produce off-by-one reconciliation
errors. Convert at the API boundary and the display layer only.
**R-ENG-5** **Runtime schema validation at the boundary** (Zod or Ajv). A malformed upstream
response must fail loudly at the edge, not silently inside a chart.
**R-ENG-6** **Fix the §3.2 crash paths** from `DATA_AUDIT.md` before any real data:
`analytics.js:310` (missing ELSS), `analytics.js:353` (no loans), zero-holdings division.
**R-ENG-7** **Extract every hardcoded constant** into the policy service. This is the single
highest-value refactor: `400000`, `monthsLeft = 9`, `0.312`, `1500000`, `125000`, `0.125`,
`55`/`230` per lakh, and the scattered `11`/`12`/`13.5` return assumptions all become
versioned, dated policy records returned in `explain.assumptions`.

### 5.2 Reliability

**R-ENG-8** Idempotency keys on all mutations (contract §0.4).
**R-ENG-9** Exponential backoff + jitter on upstream calls; circuit breaker on AA and Bedrock.
**R-ENG-10** Graceful degradation — stale insights served with `staleness: "stale"` beat an
error page. The UI must visibly degrade rather than present dead data confidently.
**R-ENG-11** Error boundaries in React. One `TypeError` currently blanks the entire app.
**R-ENG-12** Structured JSON logs with a correlation ID threaded from CloudFront through to
Bedrock.

### 5.3 Observability

**R-OPS-1** RED metrics per endpoint (rate, errors, duration) with p50/p95/p99.
**R-OPS-2** Business metrics: nudges shown vs acted on, advice→action conversion, ingest
success rate, categorisation confidence distribution, LLM fallback rate.
**R-OPS-3** X-Ray tracing across API GW → Lambda → Aurora/Bedrock.
**R-OPS-4** Alarms: 5xx > 1% (5 min), p99 > 3s, ingest failure > 5%, Bedrock throttle,
any KMS `Decrypt` denial, **any consent-purge SLA breach**.
**R-OPS-5** Cost anomaly detection on Bedrock and Aurora — the two line items that can run away.

### 5.4 Delivery

**R-DEL-1** IaC for everything — **AWS CDK (TypeScript)**, matching the team's language. No
console-created resources.
**R-DEL-2** CI/CD: GitHub Actions → OIDC role assumption (no long-lived AWS keys) → CDK deploy.
**R-DEL-3** Pipeline gates: lint → unit → contract → SAST (`cdk-nag`, Semgrep) → deploy dev →
integration → manual approval → sbx.
**R-DEL-4** Feature flags for AA integration, LLM mode, and execution mode, so the sandbox can
be demoed with any subsystem disabled.
**R-DEL-5** Blue/green on Lambda aliases with automatic rollback on the 5xx alarm.

---

## 6. Phased plan

### Phase 0 — Foundations (1–2 weeks, no AWS needed)

Highest value per day. Everything here is independently useful even if the AWS work never
starts.

1. Build the synthetic corpus generator (**R-SYN-1…5**) — seeded, deterministic, adversarial rows included.
2. Fix the crashes and the `Math.random()` date bug (**R-ENG-6**, **R-ING-8**).
3. Extract hardcoded constants into a local `policy.js` with the same shape the future
   endpoint will return (**R-ENG-7**).
4. Add unit tests on the money math (**R-ENG-2**) and golden-file snapshots (**R-ENG-1**).
5. Stand up a Prism mock from `openapi.yaml`:
   ```bash
   npx @stoplight/prism-cli mock docs/openapi.yaml --port 4010
   ```
   Verified working — 53 routes served. Note Prism strips the `/v1` server prefix, so
   point the client base URL at `http://localhost:4010`, not `.../v1`. Add `--dynamic`
   for randomised payloads, and add `example:` values to the schemas so mock responses
   read like real data rather than `"string"`.
6. Introduce `src/api/client.js` + a snapshot context; point it at Prism. Components keep
   their current imports (contract §15, step 1).

**Exit:** app runs unchanged against a mock API. No AWS spend yet.

### Phase 1 — Backend skeleton (2–3 weeks)

7. CDK stacks: VPC, Cognito, API GW, DynamoDB, S3, KMS, WAF.
8. `fn-auth`, `fn-snapshot` serving the synthetic corpus from DynamoDB.
9. Port `analytics.js` to `fn-insights` **unchanged**; golden-file tests assert parity.
10. Delete the client-side engine copy and `engine/auth.js`; move tokens out of `localStorage`.
11. CI/CD with OIDC (**R-DEL-2**).

**Exit:** SPA runs entirely off the sandbox API with synthetic data. No mock server.

### Phase 2 — Ingestion & LLM (2–3 weeks)

12. S3 presigned upload + Step Functions pipeline + Textract (**R-ING-1…7**).
13. Two-stage categoriser with the Bedrock Haiku fallback and merchant cache.
14. `fn-advisor` on Bedrock with Guardrails, SSE streaming, grounding check (**R-AI-3**).
15. Delete `engine/deepseek.js`.
16. Advice audit log (**R-REG-8**).

**Exit:** real statement upload works end to end, including PDFs. No API key in the browser.

### Phase 3 — Account Aggregator (3–5 weeks, start the commercial track in week 1)

17. AA commercial agreement + sandbox credentials — **begin this at the start of Phase 0.**
18. Consent lifecycle, ReBIT encryption, FI schema mapping (**R-AA-1…6**).
19. Delete `mockProviderData.js`; remove the credential input from `ConnectAccounts.jsx`.
20. Consent dashboard, revocation, purge-on-revoke.
21. DPDP endpoints: export, erasure, consent log (**R-REG-2…4**).

**Exit:** a real customer can link a real account in the AA sandbox.

### Phase 4 — Hardening (2–3 weeks)

22. Pen test, SAST/DAST, `cdk-nag` clean (**R-SEC-10**).
23. Load test to target concurrency; tune Aurora ACU floor and Lambda memory.
24. DR drill — restore into `ap-south-2`, measure RTO/RPO.
25. Runbooks: breach, AA outage, Bedrock outage, bad-advice incident.
26. Compliance sign-off: legal on SEBI positioning (**R-REG-6**), risk on DPDP.

**Total: 10–16 weeks** to a sandbox that could credibly hold real data. Phases 1 and 2 can run
in parallel with two engineers.

---

## 7. Decisions needed before Phase 1

These change the architecture, so they are worth settling early. Sensible defaults in bold.

| # | Question | Options | Default |
|---|---|---|---|
| 1 | Real AA data in the sandbox, or synthetic only? | Synthetic-only is faster and carries no regulatory weight; AA sandbox is a far stronger demo | **Synthetic first, AA in Phase 3** — do not let AA onboarding block everything |
| 2 | Who owns the AWS account? | IDBI's landing zone vs. a team-owned account | **Team account for sandbox**, migrate at UAT. IDBI onboarding is slow. |
| 3 | Aurora or DynamoDB-only? | Aurora costs ~$50–90/mo and adds VPC complexity; DynamoDB-only needs pre-aggregated rollups | **Aurora** if you want ad-hoc analytics; **DynamoDB-only** if cost is the binding constraint |
| 4 | Bedrock or keep DeepSeek server-side? | Bedrock: in-region, guardrails, IAM, bank-acceptable. DeepSeek: cheaper, data leaves India | **Bedrock** — DeepSeek is a non-starter for a bank on localisation grounds |
| 5 | Does the sandbox execute real transactions? | Simulated-only vs. real SIP mandates | **Simulated-only** (`mode: SIMULATED`). Real execution needs mandate infrastructure and a much heavier audit posture |
| 6 | RIA licence path? | Education-only positioning vs. pursue registration | **Education-only for now**; get counsel's read before any specific-product recommendation ships |
| 7 | Keep the persona-switcher in the sandbox? | It is a strong demo device | **Keep it**, re-cast as "demo customer" selection over the synthetic corpus, disabled in prod by feature flag |

---

## 8. What is already good

Worth stating plainly, because the audit above is a long list of gaps:

- **The analytics engine is real.** SIP future value, required-SIP solving, loan amortisation,
  allocation drift, LTCG harvesting, fee-drag projection — all correctly computed, not faked.
  It ports to Lambda essentially unchanged.
- **The deterministic advisor is a genuine resilience asset.** A rule engine that answers
  without an LLM is exactly what a bank wants when the model endpoint is down, and it costs
  nothing per query. Most teams have to retrofit this.
- **Statement parsing is real** and the category rules are a reasonable seed for a server categoriser.
- **The persona abstraction already proves multi-tenancy.** `customer.js` as a thin loader over
  `personas.js` is the right seam — it becomes the API client with a small refactor.
- **The prototype is honest about its own limits.** `mockProviderData.js`, `auth.js` and
  `deepseek.js` all carry accurate headers saying what is simulated and why. That candour is
  worth preserving in the sandbox — it is what makes this audit short rather than archaeological.
