# MITRA — Mock Data Audit

**Scope:** Assess whether the current data layer can carry real customer data, and identify
exactly what must change before a sandbox deployment.
**Commit audited:** `b7fbddb` (main)
**Verdict:** The *analytics* are genuinely computed and worth keeping. The *data layer* is a
synchronous, module-level singleton that cannot accept a network source without a refactor.
Roughly **20% of the engine code has persona-specific constants baked in** that will produce
wrong numbers for a real customer.

---

## 1. How data flows today

```
data/personas.js  (2 hand-authored personas + 1 localStorage "custom")
        │  module-level object literal
        ▼
data/customer.js  const persona = PERSONAS[getActivePersonaId()]   ← runs at IMPORT time
        │  re-exports 12 named constants (customer, holdings, goals, tax, …)
        ▼
engine/analytics.js  ─┐
engine/advisor.js    ─┤  import { customer, holdings, … }   ← static ES bindings
components/*.jsx     ─┘
        ▼
localStorage: mitra_users, mitra_session, mitra_persona, mitra_custom_persona,
              mitra_applied_state, mitra_chat_history, mitra_xp, mitra_deepseek_key,
              mitra_risk_profile, mitra_onboarded, mitra_theme
```

There is **no backend, no network data source, and no async boundary anywhere in the read
path.** `src/engine/deepseek.js` is the only outbound HTTP call in the app.

---

## 2. What is real vs. simulated

| Layer | File | Status |
|---|---|---|
| CSV parsing | `engine/csvParser.js` | **Real.** Correct quoted-field handling, no deps. |
| Statement → transactions | `engine/statementImport.js` | **Real.** Genuine parse, categorise, monthly rollup, subscription detection. |
| Risk derivation | `engine/riskDerivation.js` | **Real** heuristic (equity %, age, income CV). |
| Persona assembly | `engine/personaBuilder.js` | **Real**, but fills gaps with placeholders. |
| All analytics/advice | `engine/analytics.js`, `engine/advisor.js` | **Real** math — SIP FV, drift, LTCG, prepay amortisation, health score. |
| **"Connect account" flow** | `engine/mockProviderData.js` | **Simulated.** `Math.random()` generates holdings/txns. No Zerodha/Groww/AA integration exists. Honestly documented in the file header. |
| Market feed | `data/customer.js` → `market` | **Static literal.** 20 hardcoded index points, fixed headline. |
| Peer benchmarks | `data/personas.js` → `peers` | **Hand-authored per persona.** No cohort computation. |
| Fund expense ratios | `data/personas.js` → `fundFacts` | **Hand-authored.** No AMC/AMFI feed. |
| Auth | `engine/auth.js` | **Simulated.** Plaintext passwords in `localStorage`. |
| PDF statement upload | `components/UploadStatements.jsx:50` | **Silently no-ops.** File accepted, nothing extracted, no error shown. |

**The honest framing for a demo:** everything MITRA *says* is computed. What it *reads* is
synthetic, and the account-connect flow is theatre. That is fine for a hackathon and clearly
commented — it is not fine for a sandbox holding real customer records.

---

## 3. Blocking defects for real data

### 3.1 Structural — the data layer cannot go async

`src/data/customer.js:10`

```js
const persona = PERSONAS[getActivePersonaId()];   // evaluated once, at import
export const customer = persona.customer;          // static binding
```

Every consumer imports these as constants. There is no loading state, no error state, no
refetch, no cache invalidation. Switching persona today requires
`window.location.reload()` (`data/personas.js:222`) — direct proof the tree cannot
re-hydrate in place.

**Impact:** this is the single largest refactor. Every one of the 12 exports becomes a
promise, and ~15 components need loading/error branches.

### 3.2 Hard crashes on real-world data shapes

| File:line | Code | Fails when |
|---|---|---|
| `engine/analytics.js:310` | `holdings.find(h => h.label.includes('ELSS')).value` | Customer holds no ELSS fund → `TypeError` on `undefined.value`. Also throws if any holding lacks `label`. |
| `engine/analytics.js:353` | `loans[0].balance` | Customer has no loans → `TypeError`. |
| `engine/analytics.js:190` | `unusedSubscriptions()` → `s.lastUsed.startsWith(...)` | Real feeds have no `lastUsed` field — it is a UI-only concept. |
| `engine/analytics.js:167` | `equityExposure()` divides by `totalWealth()` | New customer with zero holdings → `NaN` propagates into the health score and every chart. |

`engine/personaBuilder.js:21` (`ensureElssHolding`) injects a **zero-value phantom ELSS
holding** purely to stop `xray()` crashing. That band-aid is the clearest signal the engine
is coupled to one persona's shape.

### 3.3 Persona-specific constants that will be wrong for real customers

| File:line | Constant | Problem |
|---|---|---|
| `analytics.js:45`, `analytics.js:491`, `advisor.js:303` | `400000` | Priya's 6-month emergency target, hardcoded three times. For a customer spending ₹20K/month, MITRA will demand a ₹4L emergency fund and report a negative shortfall. |
| `analytics.js:186` | `monthsLeft = 9 // Jul–Mar` | 80C monthly top-up assumes it is always July. Wrong every other month of the year. |
| `analytics.js:193` | `* 0.312` | Assumes 30% slab + cess for everyone. |
| `analytics.js:203` | `healthNeeded = 1500000` | Metro health-cover rule applied to all cities. |
| `analytics.js:207-208` | `55` / `230` per lakh | Insurance premiums frozen at one age band. |
| `analytics.js:343-345` | `125000` / `0.125` | LTCG exemption + rate hardcoded; changes with every Union Budget. |
| `analytics.js:381` | `{ label: 'Consistency', score: 88 }` | Not computed at all — a literal. |
| `analytics.js:386-391` | `'The Disciplined Dreamer'`, `'Never missed a SIP in 6 months — top 12%'` | Money Persona title and traits are hardcoded prose for Priya. Arjun (who missed 4 of 6 SIPs) gets the same "never missed a SIP" trait. |
| `analytics.js` (many) | `11`, `12`, `13.5` | Expected-return assumptions scattered across ~12 call sites with no single source. |

### 3.4 Latent bug

`engine/statementImport.js:163`

```js
return d ? `${d.getFullYear()}-${d.getMonth()}` : Math.random();
```

Unparseable dates become a random Set key, so each one inflates the month count and
**silently deflates computed monthly income**. Non-deterministic — the same CSV can yield a
different income on two runs. Should be a single `'unknown'` sentinel, or the row dropped.

### 3.5 Security — every one of these is a hard sandbox blocker

| File | Issue |
|---|---|
| `engine/auth.js:38` | Passwords stored **plaintext** in `localStorage`. |
| `engine/deepseek.js:23` | LLM API key in `localStorage`, sent from the browser. Any XSS exfiltrates it; no rate limit, no per-user attribution, no audit trail. |
| Everywhere | Customer financial data unencrypted in `localStorage`, readable by any script on the origin. |
| — | No consent artifact, no audit log, no data-retention policy, no right-to-erasure path. |

All are correctly labelled prototype-only in code comments. None can survive contact with a
real customer record.

### 3.6 Quality gates

- **Zero tests.** No unit tests on the SIP/amortisation math — the numbers that matter most.
- **No types, no runtime schema validation.** A malformed API response fails deep inside a
  chart render rather than at the boundary.
- **No error boundaries.** One `TypeError` in `analytics.js` blanks the whole app.

### 3.7 Regulatory

`riskDerivation.js` infers risk profile from *observed behaviour* (current equity %). SEBI
risk-profiling norms expect documented assessment of **capacity, tolerance and need** with an
auditable record and periodic review. The existing 4-question quiz in
`data/customer.js:riskQuestions` is closer to compliant — the derived path is not, and it
currently *bypasses* the quiz entirely (`personas.js:saveCustomPersonaAndActivate` marks the
profile as known).

---

## 4. What to keep

Do not rewrite these — they are the product:

- All of `engine/analytics.js`'s **math** (SIP FV, `sipRequired`, amortisation loop in
  `prepayVsInvest`, drift, projection). Move it server-side unchanged.
- `engine/statementImport.js` categorisation rules — a good seed for a server categoriser.
- `engine/riskDerivation.js` as a *signal*, feeding a compliant profile rather than replacing it.
- The persona-switching pattern itself — it becomes tenant/customer switching in a sandbox.

## 5. Effort estimate

| Workstream | Effort |
|---|---|
| Async data layer + loading/error states | 5–8 days |
| Extract constants → server-side config/policy | 2–3 days |
| Fix crashes + add schema validation at boundary | 2–3 days |
| Port analytics to server (Lambda) with parity tests | 5–8 days |
| Backend scaffold (auth, API, persistence) | 8–12 days |
| AA sandbox integration | 8–15 days (gated by aggregator onboarding) |
| Move LLM server-side (Bedrock) + guardrails | 3–5 days |
| Security hardening + audit logging | 5–8 days |

**~7–11 person-weeks** to a credible sandbox. See `SANDBOX_REQUIREMENTS.md` for the phased plan.
