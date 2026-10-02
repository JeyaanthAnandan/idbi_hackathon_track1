# MITRA — My Intelligent Treasury & Robo Advisor
### IDBI-Innovate Hackathon · Track 1: Wealth Advisory · Conversational AI · Mobile Banking

> **"Bank Aisa Dost Jaisa"** is IDBI's promise. **MITRA** (Hindi: *friend*) is that promise, digitised —
> an avatar-based AI wealth advisor inside IDBI GO Mobile+ that turns the bank's greatest untapped asset
> — **the customer's own transaction and investment behaviour** — into timely, personalized,
> data-driven wealth guidance for every customer, not just HNIs.

**Team Innovative Warriors** — Jeyaanth · Sudarssan

| | |
|---|---|
| **Live prototype** | https://dtmbnabakdonb.cloudfront.net/ |
| **Banker / RM console** | https://dtmbnabakdonb.cloudfront.net/?rm=1 |
| **Demo video** | https://drive.google.com/file/d/12MKoCHzKiOfpEMHKgQIa1_rtnwv6_M6F/view?usp=sharing |
| **Repository** | https://github.com/JeyaanthAnandan/idbi_hackathon_track1 |
| **Pitch deck** | [`deck/MITRA-Prototype-Submission-Deck-IDBI-Innovate-2026.pdf`](deck/MITRA-Prototype-Submission-Deck-IDBI-Innovate-2026.pdf) (source: [`deck/index.html`](deck/index.html)) |

**IDBI sandbox flow:** run `npm run dev:sandbox`, then open `http://localhost:5173/?connect=1`. Log in or sign up, choose **Fetch IDBI sandbox data**, review the returned accounts and transactions, and select **Use this data with MITRA**. Existing users can open **Connect / refresh data** from the dashboard or Settings.

---

## 1. The Problem (as stated)

- Wealth advisory is **fragmented and inaccessible** — human RMs serve only the top ~2% of customers.
- The bank already *has* comprehensive behavioural data (salary credits, spends, deposits, SIPs) but it is **not converted into advice**.
- Customers get generic product pushes, not **timely, personalized, data-driven guidance**.

## 2. The Solution — 27 capabilities, all working in the prototype

| # | Capability | What it does |
|---|---|---|
| 1 | **Avatar conversation** | Animated advisor who **speaks (TTS), listens (voice), emotes**, and renders live charts inside the chat |
| 2 | **हिंदी mode** | One tap → MITRA converses, speaks and takes voice input in Hindi (vernacular = true accessibility) |
| 3 | **360° behavioural insights** | Idle-surplus detection, spend spikes vs 3-month baseline, unused-subscription leakage, 80C gap — all computed from transactions |
| 4 | **Financial Health Score** | 0–100 across savings, emergency cover, diversification, goal readiness — AI-computed monthly |
| 5 | **⏳ Wealth Time Machine** | What-if simulator: drag extra-SIP and bear/base/bull levers, watch wealth-to-60 and the **age of financial freedom** move live |
| 6 | **Round-Up investing** | Sweeps UPI spare change (~₹1,479/mo detected) into a liquid fund — investing that happens while you pay for chai |
| 7 | **Peer benchmarking** | "Top 22% of salaried 25–32 metro earners" — percentile bars vs anonymised cohort |
| 8 | **Market Pulse** | Weekly index move translated into *your* portfolio impact in ₹, with MITRA's behavioural framing |
| 9 | **Drift detection & rebalancing** | Current vs target allocation donuts; fixes drift via SIP glide path (no tax-triggering sells) |
| 10 | **Advice Passport** | Every personalized recommendation carries evidence, formula, data date, confidence, policy version, action state, and an API-issued tamper-evident receipt |
| 11 | **Goal-based planning** | Real SIP mathematics per goal + risk-profiled model portfolios from 4-question conversational onboarding |
| 12 | **Wealth XP gamification** | Good financial behaviour earns XP and levels (Smart Saver → Wealth Pro) — engagement loop for repeat visits |
| 13 | **🛡 Fraud Shield** | Ask about any "guaranteed 30%" offer → SEBI/RBI-based 5-point scam check. MITRA protects wealth, not just grows it |
| 14 | **Protection Gap** | Term/health insurance adequacy vs 15×-income rule — finds the ₹1.5 Cr life-cover gap and prices the fix at ₹884/mo |
| 15 | **Money Rules** | IFTTT-for-money automations: salary-day auto-invest, balance sweep-to-FD, dining-budget alerts, SIP step-up on increment |
| 16 | **Human RM handoff preview** | "Talk to a human" prepares a reviewable context brief; the prototype clearly labels that no callback is booked |
| 17 | **📞 MITRA Live Call** | Full-screen video-call experience: hands-free voice loop (she speaks → listens → answers), animated rings, live captions, secure-line timer — transcript lands back in the chat |
| 18 | **Life events in Time Machine** | Toggle Wedding @31 / Child @33 / Home @35 / Parents' care @45 — every event reshapes the projection and the freedom age, with markers on the curve |
| 19 | **Portfolio X-Ray** | Finds the Regular-plan commission drag (1.82% vs 0.72% Direct = ₹1.9L lost over 15 yrs) and 62% fund overlap — paying active fees for passive stocks |
| 20 | **LTCG Harvesting simulator** | Models the current policy exemption and tax impact from connected holdings, with eligibility/exit-load warnings and no execution claim |
| 21 | **Prepay vs Invest** | Amortization-level answer to India's favourite question — risk-adjusted comparison on her real education loan |
| 22 | **Money Persona** | Shareable behavioural card ("The Disciplined Dreamer") with discipline/consistency/indulgence/protection scores from 6 months of data |
| 23 | **Goal Collision triage** | All 4 goals need ₹55K/mo vs ₹26K capacity — MITRA admits the deficit and proposes priority-ordered funding instead of pretending |

### Voice layer — powered by Sarvam AI

| # | Capability | What it does |
|---|---|---|
| V1 | **Speaks 9 Indian languages** | **Bulbul v3** gives MITRA a genuine Indian voice in English, Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada and Malayalam — on every device. The browser's own speech engine has no Tamil, Telugu, Kannada or Malayalam voice installed on most phones; this is the difference between a demo and a product |
| V2 | **Understands whatever you speak** | **Saaras v3** transcribes the mic *and identifies the language on its own* (0.99 confidence in testing). The customer never picks a language from a menu — they just talk, and MITRA switches to answer them in it. **Auto language mode** (the default in the language menu) does the same for typed text: the script identifies Tamil, Telugu, Kannada, Malayalam, Bengali and Gujarati instantly, and Sarvam's language ID separates Hindi from Marathi and catches romanised Hindi ("SIP kitna karna chahiye"). Each reply — text and voice — follows the language of the question just asked; pinning a language keeps every reply in it |
| V3 | **One audited rule set, nine languages** | **Mayura** translates the question into English, the deterministic engine computes the answer, and the reply is translated back in `modern-colloquial` mode — which keeps SIP, ELSS, equity fund and every ₹ figure intact inside a native-script sentence. Nine languages share one auditable engine instead of nine forked rule sets |
| V4 | **Hands-free vernacular call** | Tap 📞 and hold a conversation: MITRA speaks, listens, detects end-of-turn from the waveform, understands, and answers — entirely in the customer's language, with live captions |

**Why this matters for a public-sector bank**: the mandate is reaching customers who *aren't* served today.
Those customers don't type English. Voice in their own language is the access mechanism, not a garnish.

### AI layer — DeepSeek reasons and writes, the engine owns every number

| # | Capability | What it does |
|---|---|---|
| 24 | **Grounded AI answers** | A question the customer types or speaks goes to DeepSeek in thinking mode with a fact sheet the engine computed from their data. DeepSeek answers the actual question (job loss, marriage, rent vs buy, bitcoin…) and picks the engine card to show with it. Every figure in the reply must already be in the fact sheet or the customer's own words, or the reply is rewritten once and otherwise dropped for the engine's answer. Suggested-question chips stay instant and deterministic |
| 25 | **Vernacular AI** | Translation fallback when Sarvam is off — see the Voice layer above, which now owns this end to end |
| 26 | **Offer X-Ray** | Paste any WhatsApp forward / scheme pitch / insurance line → DeepSeek returns a Safe/Caution/Avoid verdict, safety score, red flags, hidden costs and a reality-check vs SEBI/RBI norms. Turns the static Fraud Shield into a real analyzer |
| 27 | **Natural-language goals** | *"I want a MacBook next year"* → DeepSeek extracts a schema-validated amount + timeframe → policy-based SIP simulation. No forms, no fabricated mandate |

Money-adjacent CTAs are explicitly labelled simulations. They update the what-if plan but never claim that a mandate, trade, policy, cancellation, or callback was executed.

**Hybrid AI architecture** — a dated policy engine computes every personalized number. DeepSeek writes the reply to
free-form questions from those computed figures and may not introduce a figure of its own; the same policy filters
reject execution or guaranteed-return claims, and chips, exact calculations and safety declines never touch the model.
Translation is accepted only when every numeric figure is preserved. **AI keys live on the server:** the browser
calls `/api/ai/deepseek` and `/api/ai/sarvam/*`, which add the key, fix the model, cap tokens and rate-limit.

**Voice:** with Sarvam configured, MITRA speaks and hears all 9 languages. Speech falls back to the device voice for English and Hindi.

**Design language**: Apple-product-page structure carrying real IDBI brand identity — warm white canvas, deep IDBI
teal (#0f8c7e) as the primary action color, IDBI orange (#f2761d) for stat accents, the real IDBI Bank logo, native
SF Pro typography, gradient display headlines, and a full motion system: scroll-choreographed reveals
(IntersectionObserver), count-up animated stats, tab crossfades, spring-eased hovers and press states, with
`prefers-reduced-motion` respected.

## 3. Why this wins

1. **Demos end-to-end with honest boundaries** — onboarding → dashboard → nudge → avatar conversation → chart → Advice Passport → planning simulation.
2. **Advice is computed, not canned** — change one number in the synthetic data and every score, nudge, projection and recommendation changes.
3. **Hybrid AI a regulated bank can defend** — deterministic policy engine for numbers and narration; optional LLM only selects schema-validated tools. Every recommendation is receipt-backed.
4. **Scales advisory to every customer** at near-zero marginal cost, in their language — democratizing what RMs do for HNIs.

## Banker / Relationship Manager console — `?rm=1`

MITRA has two sides. Customers talk to MITRA; the bank's relationship managers work in the **RM console**
(`/?rm=1`, or **Bank staff? Open the Relationship Manager console** on the sign-in screen, or **RM view** in the desktop rail).
It runs on a synthetic book of 8 customers, computed by the same policy engine the customer app uses.

| Screen | What the RM does |
|---|---|
| **Overview** | Book AUM, MITRA engagement, open handoffs with SLA, pending sign-offs, high-risk customers, opportunity pipeline, reviews due |
| **Handoff queue** | Customers who asked MITRA for a human arrive here with MITRA's briefing and recorded consent. Accept → schedule (phone / video / branch) → call notes → close with outcome, or escalate. Every step is sent back to the customer's MITRA chat in real time |
| **My book → Customer 360** | Health score breakdown, allocation vs risk-profile target, 6-month cash flow, goals vs capacity, holdings & loans, suitability-ranked opportunities (each tied to its policy rule), risk flags, relationship history, printable meeting brief |
| **Advice review (maker–checker)** | MITRA output above policy thresholds (SIP ≥ ₹25K/mo, lump sum ≥ ₹5L, customers 60+, protection gaps with dependents) waits for a human. The RM sees the Advice Passport and a live suitability check, then approves, approves with changes, or rejects with a reason |
| **Compliance** | Book-wide flags (liquidity, debt burden, irregular income, protection, suitability, KYC, seniors) and a consent register |
| **Audit trail** | Every customer-raised case, MITRA referral and RM decision, hash-chained so an edited entry breaks verification |

**Try the end-to-end loop:** open the RM console in one tab and the customer app (`/?demo=1&screen=mitra`) in another.
Ask MITRA *"Talk to a human advisor"* → **Send to my IDBI RM** → the case appears at the top of the RM's handoff queue →
accept / schedule it → the customer's chat shows the RM's update live.

> Prototype boundary: the RM desk is shared browser storage on the same origin, so the hosted static demo needs no server.
> In production it is the bank's CRM / case-management service behind SSO with role-based access.

## Agentic onboarding demo — Settings → *Onboard a customer with agents*

A read-only demo of how MITRA would build a customer's picture from the bank's systems. Ten agents run as a fixed DAG
(`src/engine/agents/onboardingFlow.js`). The console shows each hand-off, every tool call with the IDBI gateway
requests nested inside it (masked arguments, latency, request id), and each fact tagged with where it came from:
**LIVE** (IDBI sandbox, this run), **SIMULATED** (a stand-in with the real API's shape), **DECLARED** (the customer
said it), **DERIVED** (computed by the engine) or **ESTIMATED** (a default to confirm).

| Agent | Does |
|---|---|
| Identity & KYC | CIF and CKYC status. The run stops here if KYC fails |
| Core Banking ∥ Account Aggregator | IDBI accounts, statement, lien and loans (APIs 394/365/393/362/402) in parallel with AA consent (590/592/591) |
| Portfolio, Protection | CAS / demat and the insurance repository. Called **only** when the AA consent covers that FI type |
| Gap Analyzer | Checks each insight's data contract (`contracts.js`). Missing inputs are never guessed |
| MITRA Dialogue | Asks the customer only what no system holds (dependents, tax regime, 80C outside IDBI) |
| Insight Engine | The same `rmInsights.js` policy engine the RM console uses |
| Narrator | RM brief. MITRA AI (the server-side model) when configured, rejected if it adds any figure not in the fact sheet; the engine's talking points otherwise |

`POST /api/agents/onboard` streams the run as NDJSON. With `npm run dev:sandbox`, Core Banking and AA call the real
sandbox gateway; a failed call stays red on the trace and the run falls back to the simulated source. With no API
server (the static hosted demo), the same flow runs in the browser on simulated sources. Nothing is written to the
customer's profile, so the existing connect and onboarding flows are unchanged.

## 4. Architecture

```
┌────────────────────────── IDBI GO Mobile+ (mobile app shell) ─────────────────────────┐
│  Onboarding      Home + Daily Brief     Wealth 360°      ⏳ Time Machine     MITRA     │
│  (risk quiz)     (proactive nudges)     (score, drift,   (what-if sim,      (avatar,  │
│                                          peers, pulse)    freedom age)       voice,   │
│                                                                              EN/हिंदी) │
├────────────────────────────────── Intelligence Layer ─────────────────────────────────┤
│  Analytics Engine (deterministic, auditable)      Conversational Engine               │
│  · cashflow & surplus detection                   · 17 intents (EN + Hindi keywords)  │
│  · spend anomalies vs 3-mo baseline               · data-grounded response composer   │
│  · subscription & round-up detection              · inline chart widget payloads      │
│  · health score · drift · peer percentile         · "why this advice" explanations    │
│  · SIP / goal / 80C / FIRE mathematics            · allow-listed tool routing         │
│  · dated policy + Advice Passport receipts         · schema + policy filters          │
├──────────────────────────────────── Data Layer ───────────────────────────────────────┤
│  Synthetic customer 360°: KYC, salary, 6-mo transactions, holdings, goals, tax,       │
│  market feed, cohort stats  (prod: core banking + AA framework + NSE/AMC feeds)       │
└───────────────────────────────────────────────────────────────────────────────────────┘
Voice: Sarvam AI — Bulbul v3 TTS + Saaras v3 STT (9 languages, auto-detected) + Mayura translation,
       with Web Speech API as the offline fallback · Avatar: animated SVG with lip-sync & moods
```

## 5. Run it

```bash
npm install
npm run dev        # → http://localhost:5173
```

**Demo script (3 minutes):**
1. Answer the 4 risk questions → investor profile + model portfolio → **+50 XP**.
2. MITRA greets you by voice: health score + ₹18,000/month idle surplus.
3. Tap **"Invest my surplus"** → projection widget → open **Advice Passport** → show evidence, policy version and receipt hash → run the SIP simulation.
4. Tap **अ** → repeat in Hindi, by voice: *"टैक्स बचाओ"*. Or skip the menu entirely: tap 🎤 and just
   **speak Tamil** — MITRA detects the language, switches, and answers in Tamil with the same computed ₹ figures.
5. **Wealth tab** → Market Pulse, health breakdown, **You vs People Like You**, drift nudge → "Rebalance my portfolio".
6. **Time Machine®** → drag extra SIP to ₹18,000 → *"freedom never arrives on your current path… now it's age 54."* Bear/bull stress-test. One tap sends the plan to MITRA.
7. Ask: *"I got a WhatsApp offer with 30% guaranteed returns"* → **Fraud Shield** scam check.
8. Ask: *"Am I protected?"* → policy-based gap and indicative premium → simulate the protection plan; no policy is issued.
9. Wealth tab → flip on **Money Rules** (salary-day auto-invest, sweep-to-FD…).
10. Tap **📞** → **live call with MITRA**: speak hands-free, watch the rings pulse, captions roll, transcript saved to chat.
11. Time Machine → toggle **Child @33 + Home @35** → freedom slips past 60 → MITRA's honest replan moment.
12. Ask: *"X-ray my portfolio"* (hidden fees + overlap), *"harvest my capital gains"* (₹1.25L LTCG trick), *"should I prepay my loan or invest?"*, *"do I have enough for all my goals?"* (collision triage), *"what's my money personality?"*
13. Ask: *"Talk to a human advisor"* → review the prepared RM brief and explicit "not submitted" state.
14. Toggle **📱 Phone demo** to show it living inside the mobile banking shell.

> Copy `.env.example` to `.env` and add `SARVAM_API_KEY` (voice and all 9 languages) and `DEEPSEEK_API_KEY` (answers to open questions). `npm run dev` passes them to the API server only — they are never bundled into the web app. A key pasted in **Settings** overrides the server key for that browser.

## 6. Production roadmap

- **Data**: RBI Account Aggregator + core-banking feeds for true 360° (other-bank assets included)
- **Avatar & voice**: 3D lip-synced avatar (MetaHuman / Ready Player Me). Neural TTS/STT in 9 Indian languages is
  **already live via Sarvam AI** (key held server-side); production adds Punjabi + Odia (Bulbul supports both)
- **Compliance**: extend the implemented hash-linked advice receipts with managed append-only/WORM storage, SEBI IA review, and approved RM escalation
- **Execution**: live MF/FD/SGB order APIs, NPCI e-mandates, nudges as push notifications
- **Learning loop**: accepted/rejected-nudge feedback trains per-customer personalization; cohort benchmarks from real anonymised segments

## 7. Tech stack

React 18 + Vite · local authenticated Node API · hash-linked advice receipts · hand-rolled SVG charts ·
**Sarvam AI** (Bulbul v3 TTS, Saaras v3 STT, Mayura translation) · DeepSeek V4 Flash (thinking mode) for grounded answers, via a server-side proxy.

---
*All financial figures are computed live from synthetic data. Illustrative only — not investment advice.*
