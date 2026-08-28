# MITRA — My Intelligent Treasury & Robo Advisor
### IDBI-Innovate Hackathon · Track 1: Wealth Advisory · Conversational AI · Mobile Banking

> **"Bank Aisa Dost Jaisa"** is IDBI's promise. **MITRA** (Hindi: *friend*) is that promise, digitised —
> an avatar-based AI wealth advisor inside IDBI GO Mobile+ that turns the bank's greatest untapped asset
> — **the customer's own transaction and investment behaviour** — into timely, personalized,
> data-driven wealth guidance for every customer, not just HNIs.

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
| 10 | **Explainable AI** | Every recommendation carries "🔍 Why this advice?" — the exact data and math behind it (SEBI-suitability aligned) |
| 11 | **Goal-based planning** | Real SIP mathematics per goal + risk-profiled model portfolios from 4-question conversational onboarding |
| 12 | **Wealth XP gamification** | Good financial behaviour earns XP and levels (Smart Saver → Wealth Pro) — engagement loop for repeat visits |
| 13 | **🛡 Fraud Shield** | Ask about any "guaranteed 30%" offer → SEBI/RBI-based 5-point scam check. MITRA protects wealth, not just grows it |
| 14 | **Protection Gap** | Term/health insurance adequacy vs 15×-income rule — finds the ₹1.5 Cr life-cover gap and prices the fix at ₹884/mo |
| 15 | **Money Rules** | IFTTT-for-money automations: salary-day auto-invest, balance sweep-to-FD, dining-budget alerts, SIP step-up on increment |
| 16 | **Human RM handoff** | "Talk to a human" → books an IDBI RM callback with an auto-prepared context brief. AI + human, not AI vs human |
| 17 | **📞 MITRA Live Call** | Full-screen video-call experience: hands-free voice loop (she speaks → listens → answers), animated rings, live captions, secure-line timer — transcript lands back in the chat |
| 18 | **Life events in Time Machine** | Toggle Wedding @31 / Child @33 / Home @35 / Parents' care @45 — every event reshapes the projection and the freedom age, with markers on the curve |
| 19 | **Portfolio X-Ray** | Finds the Regular-plan commission drag (1.82% vs 0.72% Direct = ₹1.9L lost over 15 yrs) and 62% fund overlap — paying active fees for passive stocks |
| 20 | **LTCG Harvesting** | The ₹1.25L/yr tax-free gains window, computed from actual holdings: sell-rebuy before March 31, ₹5,925 saved/yr ≈ ₹4.9L over a 20-year habit |
| 21 | **Prepay vs Invest** | Amortization-level answer to India's favourite question — risk-adjusted comparison on her real education loan |
| 22 | **Money Persona** | Shareable behavioural card ("The Disciplined Dreamer") with discipline/consistency/indulgence/protection scores from 6 months of data |
| 23 | **Goal Collision triage** | All 4 goals need ₹55K/mo vs ₹26K capacity — MITRA admits the deficit and proposes priority-ordered funding instead of pretending |

### Voice layer — powered by Sarvam AI (ships configured)

| # | Capability | What it does |
|---|---|---|
| V1 | **Speaks 9 Indian languages** | **Bulbul v3** gives MITRA a genuine Indian voice in English, Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada and Malayalam — on every device. The browser's own speech engine has no Tamil, Telugu, Kannada or Malayalam voice installed on most phones; this is the difference between a demo and a product |
| V2 | **Understands whatever you speak** | **Saaras v3** transcribes the mic *and identifies the language on its own* (0.99 confidence in testing). The customer never picks a language from a menu — they just talk, and MITRA switches to answer them in it |
| V3 | **One audited rule set, nine languages** | **Mayura** translates the question into English, the deterministic engine computes the answer, and the reply is translated back in `modern-colloquial` mode — which keeps SIP, ELSS, equity fund and every ₹ figure intact inside a native-script sentence. Nine languages share one auditable engine instead of nine forked rule sets |
| V4 | **Hands-free vernacular call** | Tap 📞 and hold a conversation: MITRA speaks, listens, detects end-of-turn from the waveform, understands, and answers — entirely in the customer's language, with live captions |

**Why this matters for a public-sector bank**: the mandate is reaching customers who *aren't* served today.
Those customers don't type English. Voice in their own language is the access mechanism, not a garnish.

### AI layer — powered by DeepSeek (optional key, grounded in the same computed data)

| # | Capability | What it does |
|---|---|---|
| 24 | **Reasoning Mode** | Free-form questions route to `deepseek-reasoner` (R1) and the **chain-of-thought streams live** in the chat — judges watch MITRA reason through Priya's actual numbers in real time, then the answer lands with a "See how MITRA reasoned" trace |
| 25 | **Vernacular AI** | Translation fallback when Sarvam is off — see the Voice layer above, which now owns this end to end |
| 26 | **Offer X-Ray** | Paste any WhatsApp forward / scheme pitch / insurance line → DeepSeek returns a Safe/Caution/Avoid verdict, safety score, red flags, hidden costs and a reality-check vs SEBI/RBI norms. Turns the static Fraud Shield into a real analyzer |
| 27 | **Natural-language goals** | *"I want a MacBook next year"* → DeepSeek extracts amount + timeframe → instant SIP plan and one-tap start. No forms |

Every advice ends in a one-tap CTA (Start SIP / Enable Round-Up / Approve glide path) — closing the **advice → action loop** inside the bank app.

**Hybrid AI architecture** — the deterministic engine computes every number (auditable, SEBI-defensible, works
offline); DeepSeek adds reasoning, language and open-ended understanding on top of that same grounded context. The
app is fully functional with **no key**; paste a DeepSeek key in Settings and features 24–27 light up.

**Voice degrades gracefully too**: with a Sarvam key (shipped in `.env`) MITRA speaks and hears all 9 languages;
without one she silently falls back to the Web Speech API at English + Hindi, exactly as before. Nothing breaks
on stage. *Prototype note: both keys are browser-side for a zero-backend demo — in a real bank build they must
live server-side behind a proxy.*

**Design language**: Apple-product-page structure carrying real IDBI brand identity — warm white canvas, deep IDBI
teal (#0f8c7e) as the primary action color, IDBI orange (#f2761d) for stat accents, the real IDBI Bank logo, native
SF Pro typography, gradient display headlines, and a full motion system: scroll-choreographed reveals
(IntersectionObserver), count-up animated stats, tab crossfades, spring-eased hovers and press states, with
`prefers-reduced-motion` respected.

## 3. Why this wins

1. **Demos end-to-end, fully offline** — onboarding → dashboard → nudge → avatar voice conversation → chart → executed SIP. Nothing on stage can break.
2. **Advice is computed, not canned** — change one number in the synthetic data and every score, nudge, projection and recommendation changes.
3. **Hybrid AI a regulated bank can actually ship** — deterministic, auditable advisory engine for the numbers; optional LLM (Claude) only for open-ended phrasing, grounded in the same computed context. Explainability built in.
4. **Scales advisory to every customer** at near-zero marginal cost, in their language — democratizing what RMs do for HNIs.

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
│  · SIP / goal / 80C / FIRE mathematics            · optional LLM (Claude), grounded   │
│  · model portfolios by risk profile                 by the same computed context      │
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
3. Tap **"Invest my surplus"** → projection widget → open **"🔍 Why this advice?"** → tap the orange CTA → SIP created.
4. Tap **अ** → repeat in Hindi, by voice: *"टैक्स बचाओ"*. Or skip the menu entirely: tap 🎤 and just
   **speak Tamil** — MITRA detects the language, switches, and answers in Tamil with the same computed ₹ figures.
5. **Wealth tab** → Market Pulse, health breakdown, **You vs People Like You**, drift nudge → "Rebalance my portfolio".
6. **Time Machine®** → drag extra SIP to ₹18,000 → *"freedom never arrives on your current path… now it's age 54."* Bear/bull stress-test. One tap sends the plan to MITRA.
7. Ask: *"I got a WhatsApp offer with 30% guaranteed returns"* → **Fraud Shield** scam check.
8. Ask: *"Am I protected?"* → ₹1.5 Cr life-cover gap found, fixed for ₹884/month.
9. Wealth tab → flip on **Money Rules** (salary-day auto-invest, sweep-to-FD…).
10. Tap **📞** → **live call with MITRA**: speak hands-free, watch the rings pulse, captions roll, transcript saved to chat.
11. Time Machine → toggle **Child @33 + Home @35** → freedom slips past 60 → MITRA's honest replan moment.
12. Ask: *"X-ray my portfolio"* (hidden fees + overlap), *"harvest my capital gains"* (₹1.25L LTCG trick), *"should I prepay my loan or invest?"*, *"do I have enough for all my goals?"* (collision triage), *"what's my money personality?"*
13. Ask: *"Talk to a human advisor"* → RM callback booked with auto-prepared brief.
14. Toggle **📱 Phone demo** to show it living inside the mobile banking shell.

> Sarvam AI ships configured in `.env` (copy `.env.example` to use your own key) — that's MITRA's voice and all
> 9 languages. Optionally paste a DeepSeek key in **Settings** for open-ended reasoning. Everything else runs offline.

## 6. Production roadmap

- **Data**: RBI Account Aggregator + core-banking feeds for true 360° (other-bank assets included)
- **Avatar & voice**: 3D lip-synced avatar (MetaHuman / Ready Player Me). Neural TTS/STT in 9 Indian languages is
  **already live via Sarvam AI**; production moves the key server-side and adds Punjabi + Odia (Bulbul supports both)
- **Compliance**: immutable advice audit-log (already explainable), SEBI IA guardrails, human-RM escalation for complex cases
- **Execution**: live MF/FD/SGB order APIs, NPCI e-mandates, nudges as push notifications
- **Learning loop**: accepted/rejected-nudge feedback trains per-customer personalization; cohort benchmarks from real anonymised segments

## 7. Tech stack

React 18 + Vite · hand-rolled SVG chart engine (zero chart deps) · **Sarvam AI** (Bulbul v3 TTS, Saaras v3 STT,
Mayura translation — 9 Indian languages) with Web Speech API fallback · optional DeepSeek API for reasoning ·
no backend needed for the prototype.

---
*All financial figures are computed live from synthetic data. Illustrative only — not investment advice.*
