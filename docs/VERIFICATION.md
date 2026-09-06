# MITRA verification and operating boundaries

Verified locally on 6–7 September 2026. This report takes precedence over older capability claims and sandbox planning documents. It describes the current implementation, not a production certification.

## Current evidence

- `npm test`: 62 passing tests, including six API journey subtests. The customer-context tests additionally exercise 25 deterministic review prompts against six distinct data scenarios (150 prompt/scenario combinations).
- `npm run build`: passes.
- Browser: account creation, onboarding, two sandbox providers, profile building, wrong-password rejection, logout, re-login, restored conversation, desktop and phone rendering. A ₹5,000/month SIP changed from 10 to 15 years without losing its amount.
- Browser CSV journey: supplied fixtures reached the review screen as 37 transactions and 5 holdings, then the dashboard and portfolio reply with ₹2,62,400 total. Native file-picker automation stalled; the completed test attached the same files through DOM file-input events. This verifies application processing, not the operating-system picker.
- Final uploaded-profile replies: growth exposure includes stocks (88%, rounded); tax review asks for the missing regime and verified 80C usage instead of inventing a tax SIP. No uncaught browser errors were reported in the completed journey.
- Live Sarvam: three routing probes passed (fees, definition, ambiguity); speech generation passed; Hindi and Tamil translations preserved tested quantities and percentage bindings; generated English audio was transcribed back with the portfolio intent and English detected. These are small live probes, not accuracy benchmarks or microphone/device certification.
- DeepSeek: no configured key was available for live verification. Its failure/fallback path is covered with injected provider responses, not a live service call.

## What data actually arrives

| Source | Current behavior | Available depth |
|---|---|---|
| Priya / Arjun demo | Local synthetic customer records | Holdings, monthly summaries, goals, loan, policy cover, tax facts and fund facts; market and cohort figures are synthetic |
| Create account + quiz | Real local account/session, no bank feed | Risk quiz and empty personal financial profile; no borrowed demo balances |
| CSV upload | Authenticated API parses supplied text | Supported transaction/holdings columns; summaries and categorization derived from rows; no automatic insurance, tax or loan feed |
| Connect accounts | Authenticated sandbox fixture endpoint | Explicit consent preview + synthetic provider rows; no live AA, bank or broker connection |
| AI provider | Routes language requests to tools | It does not fetch customer financial records; the deterministic engine reads the active profile |

The bundled files contain **37 transactions**, **5 holdings**, and **₹2,62,400** in holdings. They yield:

| Month | Income | Consumption | Investments |
|---|---:|---:|---:|
| Jun | ₹95,000 | ₹40,558 | ₹5,000 |
| Jul | ₹95,000 | ₹40,988 | ₹5,000 |
| Aug | ₹95,000 | ₹38,068 | ₹5,000 |

Both the bundled bank CSV and bank sandbox cover three observed months. The current policy requires **four observed months** for personalized trend responses. With those files, withholding a trend recommendation is expected. A counted month means a month with observed rows, not proof that the statement is complete.

Savings account balances are not inferred from transaction credits or accumulated net flows. If no savings holding is supplied, the balance card says “Not supplied.” Uploaded records cannot establish fund overlap, plan expense ratios, insurance adequacy, verified tax utilization, or loan amortization details. Those reviews explain missing inputs.

## How a conversation works

1. The app requests `/api/bootstrap` before loading customer-dependent modules. The authenticated profile, risk setting, chat, XP and simulation state come from the session owner.
2. A user message is added to the conversation. Voice transcription can set the reply language. Incoming translation is accepted only when tested numeric quantities and percentages survive.
3. `conversation.js` handles explicit calculations, named-goal reviews, goal simulations with supplied cost/time, definitions, previous-answer explanations, limited SIP follow-ups, and unsupported execution requests.
4. Remaining recognized intents run deterministic calculations against the active profile. Missing-data gates can return an unavailable response.
5. For unknown wording, the configured Sarvam router is tried, then DeepSeek if configured. Each router has an eight-second deadline. It receives the latest request and up to six previous text messages, bounded in length.
6. Both providers use the same prompt, `mitra-router-2026-09-06.1`, from `src/engine/advisorPrompt.js`. They must select one of 21 tools. Unknown tools, malformed arguments and extra fields are rejected. The tools call deterministic calculations; provider-written financial prose is not accepted as personalized advice.
7. A finished answer may be translated. The validator permits grammatical reordering but rejects changed numeric values, missing/extra figures, and changed percentage bindings. It does not establish full semantic translation correctness.
8. The UI validates the response, renders its chart/action, builds an Advice Passport when applicable, requests a hash-linked receipt, and saves recent chat. Simulations update planning state; no order or bank mandate is placed.

Context is deliberately bounded. SIP amount/time adjustments and “why?” are supported; this is not unrestricted memory or reliable arbitrary multi-topic reasoning. Explicit new-goal requests produce a **simulation**, not a persisted goal. Missing cost/time prompts for clarification instead of inventing a product price.

## Corrections completed in this pass

- Authentication no longer trusts an old local-storage session. Login refreshes bootstrap and reloads customer-bound modules. Logout clears cached customer data only after server logout succeeds; failures are reported.
- Empty server chat cannot fall back to another account's old local history. In-session saves refresh the bootstrap cache, and server state writes are ordered.
- New accounts use an empty personal profile instead of the demo persona. Demo mode avoids loading the authenticated profile or posting its state.
- Profile changes atomically reset dependent conversation and planning state on the server. Malformed profile, onboarding and state payloads are rejected.
- Date parsing handles ISO and Indian day-first dates explicitly, rejects impossible dates, and normalizes accepted rows. Invalid/infinite numeric input is rejected.
- Rent and SIPs no longer count as subscriptions. Recurring subscription usage is unknown unless separately supplied; a debit is not evidence of use or disuse.
- Keyword matching no longer treats “hi” inside “this” as a greeting. Named goal cards resolve the selected goal instead of repeating the whole goal list.
- No negative additional-investment CTA is issued when monthly cashflow is in deficit. Negative unrealized gains do not produce negative harvesting savings.
- Individual stocks now participate in growth exposure, drift and the synthetic market-impact calculation. The prototype still treats all generic mutual-fund rows as equity; production needs scheme-level asset classification.
- Shared, versioned router prompt, stricter tool arguments, limited deterministic follow-ups, provider fallback and timeouts.
- Removed unsupported narration about live market data, transfer monitoring, calculated fund overlap, predicted peer ranking improvements, and an invented eight-month goal delay.
- Evidence dates now prefer observation dates instead of treating profile upload time as the financial data date.
- Added a data-source/coverage banner, a visible server-save failure message and a render error boundary.

## What it survives, and what remains

| Condition | Behavior / boundary |
|---|---|
| Missing holdings, tax, cover or loan | Tested review paths avoid crashes and explain missing facts; some dashboard indicators remain illustrative |
| Too few observed months | Trend responses withheld, other supplied facts remain usable |
| Invalid CSV or PDF | Clear rejection; PDF extraction is not implemented |
| Unknown/invalid provider output or outage | Next configured provider, then a deterministic fallback; no unbounded router wait |
| Changed translated figures | Original response retained; numeric checks alone do not certify translation meaning |
| Wrong password / duplicate email | Rejected; existing account remains intact |
| Logout / server restart | Session invalidation and persisted account/context tested |
| API unavailable during a save | Warning shown; **no durable offline retry queue**; do not assume unsaved changes survive reload |
| Account switched in another browser tab | Not stress-tested; requires session-change coordination before production use |
| Concurrent production load | Not benchmarked; local JSON storage and synchronous password hashing are not a bank-scale architecture |

Production work still required:

- Move AI keys and financial calculation authority server-side. The current browser build can contain a configured Sarvam key; saved override keys are also browser-side.
- Replace local JSON storage with durable, transactional persistence; add deployment-backed sessions, secure-cookie configuration, rate limiting, password recovery and operational monitoring.
- Implement actual bank/AA/broker integration and consent lifecycle. Displayed bank-shell payment buttons and money-rule toggles are not payment infrastructure.
- Complete formal risk assessment: a holdings-derived band is a heuristic, not confirmed risk tolerance/capacity.
- Validate financial methodology independently across more loan/tax/holding-lot cases. Harvesting currently lacks verified acquisition dates and complete tax-lot eligibility. A receipt proves the recorded payload's integrity, not that its financial conclusion is correct; its financial payload is still client-produced.
- Expand statement formats, separate debit/credit columns, multi-line descriptions, duplicate detection, coverage completeness, refunds/transfers, and source reconciliation. Current tests do not certify every bank export.
- Add full multilingual conversation evaluations and actual microphone tests across devices. Only two output translation languages and one synthetic STT language were probed live in this pass.

## Repeat the checks

```sh
npm test
npm run build
npm run dev
# Opt-in: sends synthetic text/audio to configured external services.
npm run verify:providers
```

Account APIs require the Node service. A static `dist` deployment alone does not supply login, profile persistence, or receipt endpoints. The draft OpenAPI/sandbox architecture documents describe a future backend, not the current set of running routes.

Automated API tests create and remove their own temporary store. Browser verification used `/tmp/mitra-verification-20260906`; the project's existing `.data` was not modified.
