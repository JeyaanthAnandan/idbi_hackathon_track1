// ─────────────────────────────────────────────────────────────
// Agentic onboarding — how MITRA builds a customer's picture from the
// bank's systems and fills what they cannot know.
//
//   Identity & KYC ─┬─ Core Banking ───────────────────┐
//                   └─ Account Aggregator ─┬─ Portfolio ┼─ Gap Analyzer ─ MITRA Dialogue ─ Gap Analyzer ─ Insight Engine ─ Narrator
//                                          └─ Protection┘
//
// The order is a fixed DAG, not something a model decides: a bank has to be
// able to say which system was asked what, and why. Every number comes from
// a tool or from the deterministic engine; the Narrator may only reword them.
//
// This is a demo path. It never writes the customer's profile, so the
// app's existing onboarding, connect and persona flows are untouched.
// Runs on Node (streamed by /api/agents/onboard) and in the browser.
// ─────────────────────────────────────────────────────────────
import { createRun, TIERS } from './runtime.js';
import { ASK, evaluateContracts } from './contracts.js';
import { buildCustomPersona, defaultGoals } from '../personaBuilder.js';
import { buildMonthlySummary, detectSubscriptions, selectIncomeCredits } from '../statementImport.js';
import { deriveRiskProfile } from '../riskDerivation.js';
import { customerInsights, talkingPoints } from '../rmInsights.js';
import { POLICY } from '../../data/policy.js';

export const AGENTS = [
  { id: 'orchestrator', name: 'Orchestrator', role: 'Plans the run and routes hand-offs' },
  { id: 'identity', name: 'Identity & KYC', role: 'CIF and CKYC status' },
  { id: 'core', name: 'Core Banking', role: 'IDBI accounts, statement, loans' },
  { id: 'aa', name: 'Account Aggregator', role: 'Consent for data outside IDBI' },
  { id: 'portfolio', name: 'Portfolio', role: 'Mutual fund CAS and demat' },
  { id: 'protection', name: 'Protection', role: 'Insurance repository' },
  { id: 'gaps', name: 'Gap Analyzer', role: 'Checks each insight’s data contract' },
  { id: 'dialogue', name: 'MITRA Dialogue', role: 'Asks what no system knows' },
  { id: 'insights', name: 'Insight Engine', role: 'Deterministic policy engine' },
  { id: 'narrator', name: 'Narrator', role: 'RM brief and customer welcome' },
];

const PLAN = [
  { agent: 'identity', goal: 'Resolve the customer and confirm KYC before any data is fetched' },
  { agent: 'core', goal: 'Pull IDBI accounts, 6-month statement, lien and loans', parallel: 'aa' },
  { agent: 'aa', goal: 'Hold consent for data at other institutions', parallel: 'core' },
  { agent: 'portfolio', goal: 'Read mutual funds and demat — only under an active consent', after: 'aa' },
  { agent: 'protection', goal: 'Read insurance policies — only under an active consent', after: 'aa' },
  { agent: 'gaps', goal: 'Match facts against each insight’s data contract' },
  { agent: 'dialogue', goal: 'Ask the customer only for what is still missing' },
  { agent: 'insights', goal: 'Compute every insight whose contract is met' },
  { agent: 'narrator', goal: 'Write the RM brief from computed facts only' },
];

const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
function lakh(n) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1).replace(/\.0$/, '')} L`;
  return inr(n);
}
const avg = (rows, pick) => (rows.length ? rows.reduce((s, r) => s + pick(r), 0) / rows.length : 0);

// Runs one agent; a failure degrades that agent instead of ending the run.
async function step(agent, fn) {
  agent.status('running');
  try {
    const result = await fn();
    agent.status(result?.degraded ? 'degraded' : 'done', result?.note);
    return result;
  } catch (error) {
    if (/cancelled/i.test(error.message)) throw error;
    agent.think(`Could not complete: ${error.message}`);
    agent.status('degraded', error.message);
    return null;
  }
}

function insightValue(id, ins, persona) {
  switch (id) {
    case 'emergency': return `${ins.hs.emergencyMonths.toFixed(1)} of ${POLICY.emergency.targetMonths} months of expenses in savings`;
    case 'surplus': return ins.cf.surplus > 0 ? `${inr(ins.cf.surplus)}/mo idle after spends and SIPs` : 'No idle surplus each month';
    case 'debt': return persona.loans.length ? `EMI is ${ins.emiRatio.toFixed(0)}% of income (ceiling 35%)` : 'No modellable loans';
    case 'protection': return ins.pg.available && ins.pg.termGap > 0 ? `Life cover ${lakh(ins.pg.termGap)} short of ${lakh(ins.pg.termNeeded)} · ${ins.pg.dependents} dependents` : 'Life cover meets 15× income';
    case 'tax': return !ins.tg.available ? '80C does not apply under this regime' : ins.tg.gap > 0 ? `${lakh(ins.tg.gap)} of 80C unused · ~${inr(ins.tg.estSaving)} tax saving` : '80C fully used';
    case 'drift': return `${ins.dr.biggest.name} ${Math.abs(ins.dr.biggest.gap).toFixed(0)}% ${ins.dr.biggest.gap > 0 ? 'below' : 'above'} the ${ins.riskProfile} target`;
    case 'fees': return ins.drag ? `${ins.drag.fund}: ${ins.drag.dragPct}%/yr over its Direct plan` : 'All funds on Direct plans';
    case 'goals': return `Goals need ${inr(ins.goalNeed)}/mo against ${inr(ins.capacity)} capacity`;
    default: return '';
  }
}

export async function runOnboardingFlow({ customer, tools, emit, signal, mode = tools.mode, now }) {
  const run = createRun({ emit, signal, now });
  const has = (field) => run.facts.has(field);
  const fact = (field) => run.facts.get(field)?.value;
  const started = Date.now();
  run.send({ type: 'run', mode, customer, agents: AGENTS, plan: PLAN });

  const orch = run.agent('orchestrator');
  orch.status('running');
  orch.think(`Onboarding CIF ••••${tools.who.cif.slice(-4)}. ${mode === 'live'
    ? 'IDBI sandbox is live, so Core Banking and AA call the real gateway. Funds, insurance and CKYC have no sandbox API and stay simulated.'
    : 'No live gateway in this environment, so every source is a labelled simulation of its real API.'}`);
  orch.think('Plan: identity first, then bank and consent in parallel, then consent-gated sources, then contracts, questions, insights and the brief.');

  // ── 1. Identity ──
  const identity = run.agent('identity');
  run.send({ type: 'handoff', from: 'orchestrator', to: 'identity', note: 'Resolve the customer' });
  const kyc = await step(identity, async () => {
    identity.think('Every later call is keyed on the CIF, so KYC is confirmed before any account is read.');
    const out = await identity.tool('ckyc.searchAndDownload', { cifId: tools.who.cif, idType: 'PAN' }, () => tools.kycLookup(identity));
    const k = out.data;
    identity.fact('identity.cif', `••••${tools.who.cif.slice(-4)}`, { tier: out.tier, source: 'CIF master', label: 'CIF' });
    identity.fact('identity.name', k.name, { tier: out.tier, source: 'CKYC', label: 'Name' });
    identity.fact('identity.age', k.age, { tier: out.tier, source: 'CKYC', label: 'Age' });
    identity.fact('identity.city', k.city, { tier: out.tier, source: 'CKYC', label: 'City' });
    identity.fact('kyc.status', k.ckycStatus, { tier: out.tier, source: 'CKYC', label: 'KYC', display: `${k.ckycStatus} · risk ${k.kycRisk}` });
    return { kyc: k };
  });
  if (!kyc) {
    orch.think('Identity could not be confirmed. Stopping: no account data is read for an unverified customer.');
    orch.status('degraded', 'Stopped at KYC');
    run.send({ type: 'done', ms: Date.now() - started, stats: run.stats, stopped: true });
    return;
  }

  // ── 2. Core banking ∥ Account Aggregator ──
  run.send({ type: 'handoff', from: 'orchestrator', to: 'core', note: 'Fetch IDBI accounts and statement' });
  run.send({ type: 'handoff', from: 'orchestrator', to: 'aa', note: 'Secure consent for other institutions' });
  const core = run.agent('core');
  const aa = run.agent('aa');
  const [bank, consent] = await Promise.all([
    step(core, async () => {
      core.think('Statement is the fail-closed core: a partial history is not imported. Lien and loans are enrichment and may degrade.');
      const out = await core.tool('idbi.directSnapshot', { cifId: tools.who.cif, acctId: tools.who.accountId, window: 'last 24 months' }, (id) => tools.coreBanking(core, id));
      const snap = out.data;
      const tier = out.tier;
      const tx = snap.transactions;
      core.fact('identity.name', snap.account?.customerName || kyc.kyc.name, { tier, source: 'Account enquiry (365)', label: 'Name' });
      const savings = snap.holdings.filter((h) => h.type === 'Savings Account').reduce((s, h) => s + h.value, 0);
      core.fact('bank.savingsBalance', savings, { tier, source: 'Account enquiry (365)', label: 'Savings balance', display: inr(savings), asOf: snap.dataAsOf });
      core.fact('bank.accounts', snap.holdings.length, { tier, source: 'Account discovery (394)', label: 'IDBI accounts', display: snap.holdings.map((h) => h.label).join(' · ') });
      core.fact('bank.transactions', tx.length, { tier, source: 'Statement (393)', label: 'Transactions', display: `${tx.length} rows to ${snap.dataAsOf || '—'}`, asOf: snap.dataAsOf });

      const summary = buildMonthlySummary(tx);
      const incomeKnown = selectIncomeCredits(tx).length > 0;
      core.think(`Derived ${summary.length} month${summary.length === 1 ? '' : 's'} of cash flow from ${tx.length} rows${incomeKnown ? '' : '; no salary or business credits were recognisable'}.`);
      const source = `Engine · ${tx.length} statement rows`;
      if (incomeKnown) core.fact('cashflow.monthlyIncome', Math.round(avg(summary, (m) => m.income)), { tier: TIERS.DERIVED, source, label: 'Monthly income', display: `${inr(avg(summary, (m) => m.income))} avg` });
      if (summary.length && tx.some((t) => t.type === 'debit')) core.fact('cashflow.monthlySpend', Math.round(avg(summary, (m) => m.spend)), { tier: TIERS.DERIVED, source, label: 'Monthly spend', display: `${inr(avg(summary, (m) => m.spend))} avg` });
      const invested = avg(summary, (m) => m.invested);
      if (invested > 0) core.fact('cashflow.monthlyInvested', Math.round(invested), { tier: TIERS.DERIVED, source, label: 'SIP outflow', display: `${inr(invested)}/mo` });
      const subs = detectSubscriptions(tx);
      if (subs.length) core.fact('cashflow.subscriptions', subs.length, { tier: TIERS.DERIVED, source, label: 'Subscriptions', display: subs.map((s) => s.name).slice(0, 3).join(', ') });

      const liab = snap.liabilities;
      if (liab?.status === 'reported') {
        const loans = liab.loans || [];
        core.fact('liabilities.loans', loans.length, { tier, source: 'Loan overdue (402)', label: 'Loans', display: loans.length ? `${loans.length} · ${lakh(loans.reduce((s, l) => s + (l.outstanding || 0), 0))} outstanding` : 'None' });
      } else {
        core.think('Loan records did not come back; liabilities stay unknown rather than zero.');
      }
      (snap.warnings || []).forEach((w) => core.think(`Gateway note: ${w}`));
      return { snap, tier, degraded: liab?.status !== 'reported' };
    }),
    step(aa, async () => {
      aa.think('Funds and insurance live outside IDBI. Nothing is read there without an active AA consent naming those FI types.');
      const out = await aa.tool('aa.consentFlow', { purpose: 'Wealth advisory', fiTypes: ['DEPOSIT', 'MUTUAL_FUNDS', 'INSURANCE_POLICIES'], durationMonths: 12 }, (id) => tools.accountAggregator(aa, id));
      aa.fact('consent.aa', out.data.status, { tier: out.tier, source: 'FinPro consent list (591)', label: 'AA consent', display: `${out.data.status} · ${out.data.fiTypes.join(', ')}` });
      return { consent: out.data, tier: out.tier };
    }),
  ]);

  // ── 3. Consent-gated sources ──
  const scope = consent?.consent.status === 'ACTIVE' ? new Set(consent.consent.fiTypes) : new Set();
  const portfolio = run.agent('portfolio');
  const protection = run.agent('protection');
  const gated = (agent, fiType, fn) => {
    if (scope.has(fiType)) {
      run.send({ type: 'handoff', from: 'aa', to: agent.name, note: `Consent covers ${fiType}` });
      return step(agent, fn);
    }
    agent.think(`No active consent for ${fiType}, so this source is not called.`);
    agent.status('skipped', `No consent for ${fiType}`);
    return null;
  };
  const [funds] = await Promise.all([
    gated(portfolio, 'MUTUAL_FUNDS', async () => {
      const out = await portfolio.tool('cas.consolidatedStatement', { pan: 'ABCDE1234F', sources: ['CAMS', 'KFintech', 'NSDL'] }, (id) => tools.casStatement(portfolio, id));
      const { holdings, fundFacts, regularPlans } = out.data;
      portfolio.fact('portfolio.holdings', holdings.length, { tier: out.tier, source: 'CAMS · KFintech · NSDL', label: 'Investments', display: `${holdings.length} · ${lakh(holdings.reduce((s, h) => s + h.value, 0))}` });
      if (fundFacts) portfolio.fact('portfolio.fundFacts', regularPlans.length, { tier: out.tier, source: 'CAS scheme plan', label: 'Regular-plan funds', display: regularPlans.length ? regularPlans.join(', ') : 'None' });
      const all = [...(bank?.snap.holdings || []), ...holdings];
      const risk = deriveRiskProfile({ holdings: all, monthlySummary: buildMonthlySummary(bank?.snap.transactions || []), age: kyc.kyc.age });
      portfolio.fact('risk.profile', risk, { tier: TIERS.DERIVED, source: 'Engine · holdings mix and cash flow', label: 'Risk profile' });
      return { holdings, fundFacts };
    }),
    gated(protection, 'INSURANCE_POLICIES', async () => {
      const out = await protection.tool('insuranceRepository.policies', { pan: 'ABCDE1234F' }, () => tools.insurancePolicies(protection));
      protection.fact('insurance.termCover', out.data.termCover, { tier: out.tier, source: 'Insurance repository', label: 'Term cover', display: lakh(out.data.termCover) });
      protection.fact('insurance.healthCover', out.data.healthCover, { tier: out.tier, source: 'Insurance repository', label: 'Health cover', display: lakh(out.data.healthCover) });
      protection.think('Policies show cover, not who depends on the income. That has to come from the customer.');
      return out.data;
    }),
  ]);

  // ── 4. Contracts → questions → contracts ──
  const gaps = run.agent('gaps');
  run.send({ type: 'handoff', from: 'orchestrator', to: 'gaps', note: 'Check every insight’s inputs' });
  const firstPass = await step(gaps, async () => {
    const result = evaluateContracts(has);
    result.forEach((c) => run.send({ type: 'contract', pass: 1, id: c.id, title: c.title, requires: c.requires, missing: c.missing, ready: c.ready }));
    const missing = [...new Set(result.flatMap((c) => c.missing))];
    const asks = missing.map((field) => ({ field, ...(ASK[field] || { who: 'rm', question: `No source supplied ${field}.` }) }));
    asks.forEach((a) => run.send({ type: 'gap', field: a.field, who: a.who, question: a.question }));
    gaps.think(`${result.filter((c) => c.ready).length} of ${result.length} insights can be computed. ${missing.length ? `${missing.length} input${missing.length === 1 ? '' : 's'} missing — not guessed.` : 'Nothing missing.'}`);
    return { result, asks };
  });

  const dialogue = run.agent('dialogue');
  const customerAsks = (firstPass?.asks || []).filter((a) => a.who === 'customer');
  if (customerAsks.length) {
    run.send({ type: 'handoff', from: 'gaps', to: 'dialogue', note: `${customerAsks.length} question${customerAsks.length === 1 ? '' : 's'} for the customer` });
    await step(dialogue, async () => {
      dialogue.think('Asking only these, in the customer’s language, as chips in MITRA chat — not a form.');
      const out = await dialogue.tool('mitra.askCustomer', { channel: 'MITRA chat', questions: customerAsks.map((a) => a.question) }, (id) => tools.askCustomer(dialogue, id, customerAsks));
      const labels = { 'household.dependents': 'Dependents', 'tax.regime': 'Tax regime', 'tax.section80CUsed': '80C used', 'cashflow.monthlyIncome': 'Monthly income', 'insurance.termCover': 'Term cover', 'risk.profile': 'Risk profile' };
      Object.entries(out.data).forEach(([field, value]) => dialogue.fact(field, value, {
        tier: TIERS.DECLARED, source: 'Customer · MITRA chat', label: labels[field] || field,
        display: typeof value === 'number' && value > 100 ? inr(value) : String(value),
      }));
      return {};
    });
  } else {
    dialogue.status('skipped', 'Nothing to ask');
  }
  // No system holds a customer's goals. Starter goals sized from income let
  // the goal insight run, marked ESTIMATED until the customer confirms them.
  const income = fact('cashflow.monthlyIncome');
  if (!has('goals') && income > 0) {
    const goals = defaultGoals({ monthlyIncome: income, savingsBalance: fact('bank.savingsBalance') || 0, age: kyc.kyc.age });
    dialogue.fact('goals', goals, { tier: TIERS.ESTIMATED, source: 'Engine · income-based starter goals', label: 'Goals', display: `${goals.length} starter goals · to confirm in chat` });
  }

  const secondPass = evaluateContracts(has);
  secondPass.forEach((c) => run.send({ type: 'contract', pass: 2, id: c.id, title: c.title, requires: c.requires, missing: c.missing, ready: c.ready }));
  const unlocked = secondPass.filter((c) => c.ready).length - (firstPass?.result.filter((c) => c.ready).length || 0);
  gaps.think(`After the customer’s answers: ${secondPass.filter((c) => c.ready).length} of ${secondPass.length} insights ready${unlocked > 0 ? ` (${unlocked} unlocked)` : ''}. ${secondPass.some((c) => !c.ready) ? 'The rest go to the RM as tasks.' : ''}`.trim());
  const blocked = new Map();
  secondPass.filter((c) => !c.ready).forEach((c) => c.missing.forEach((field) => blocked.set(field, [...(blocked.get(field) || []), c.title])));
  blocked.forEach((insights, field) => {
    if (ASK[field]?.who === 'customer') return; // asked already; the customer did not answer
    run.send({ type: 'rm_task', field, insights, task: ASK[field]?.question || `Confirm ${field}.` });
  });

  // ── 5. Insights ──
  const engine = run.agent('insights');
  run.send({ type: 'handoff', from: 'gaps', to: 'insights', note: 'Compute what the contracts allow' });
  const computed = await step(engine, async () => {
    const f = fact;
    const snap = bank?.snap;
    const { persona } = buildCustomPersona({
      name: f('identity.name'), age: kyc.kyc.age, city: kyc.kyc.city,
      holdings: [...(snap?.holdings || []), ...(funds?.holdings || [])],
      transactions: snap?.transactions || [],
      sources: ['agentic-onboarding'],
      snapshots: snap ? [snap] : [],
    });
    persona.customer = { ...persona.customer, id: `CIF-••••${tools.who.cif.slice(-4)}`, segment: kyc.kyc.segment, kycRisk: kyc.kyc.kycRisk, relationshipSince: kyc.kyc.relationshipSince, panLinked: kyc.kyc.panLinked };
    if (run.facts.get('cashflow.monthlyIncome')?.tier === TIERS.DECLARED) {
      const declared = f('cashflow.monthlyIncome');
      persona.customer.monthlyIncome = declared;
      persona.monthlySummary = persona.monthlySummary.map((m) => ({ ...m, income: declared }));
      persona.dataQuality.incomeAvailable = true;
    }
    if (f('insurance.termCover') !== undefined) persona.insurance = { termCover: f('insurance.termCover'), healthCover: f('insurance.healthCover') || 0, dependents: f('household.dependents') ?? 0, dataAvailable: f('household.dependents') !== undefined };
    if (f('tax.regime')) persona.tax = { section80CUsed: f('tax.section80CUsed') || 0, section80CLimit: POLICY.tax.section80CLimit, regime: f('tax.regime'), regimeConfirmed: true, dataAvailable: f('tax.section80CUsed') !== undefined };
    if (funds?.fundFacts) persona.fundFacts = funds.fundFacts;
    if (Array.isArray(f('goals'))) persona.goals = f('goals');
    const riskProfile = f('risk.profile') || 'Balanced';
    engine.think(`Running the same policy rules the RM console uses (policy ${POLICY.version}), with ${/^[AEIOU]/.test(riskProfile) ? 'an' : 'a'} ${riskProfile} risk profile.`);

    const ins = await engine.tool('engine.customerInsights', { riskProfile, contracts: secondPass.filter((c) => c.ready).map((c) => c.id) }, async () => {
      const value = customerInsights(persona, riskProfile);
      return { data: value, tier: TIERS.DERIVED, summary: `Health ${value.hs.total}/100 · ${value.opportunities.length} opportunities · ${value.flags.length} flags` };
    });
    const result = ins.data;
    // The score blends savings rate and emergency cover, so it is withheld
    // until both of those contracts are met rather than scored on zeros.
    const scoreReady = ['emergency', 'surplus'].every((id) => secondPass.find((c) => c.id === id)?.ready);
    if (scoreReady) engine.fact('health.score', result.hs.total, { tier: TIERS.DERIVED, source: 'Engine · 4-part health score', label: 'Health score', display: `${result.hs.total}/100 · ${result.hs.grade}` });
    else engine.think('Health score withheld: cash flow or savings balance is still missing.');
    secondPass.forEach((c) => run.send({
      type: 'insight', id: c.id, title: c.title,
      status: c.ready ? 'computed' : 'needs-data',
      value: c.ready ? insightValue(c.id, result, persona) : `Waiting on ${c.missing.join(', ')}`,
      uses: c.requires,
    }));
    result.flags.forEach((fl) => run.send({ type: 'flag', level: fl.level, code: fl.code, text: fl.text }));
    return { persona, ins: result, scoreReady };
  });

  // ── 6. Narration ──
  const narrator = run.agent('narrator');
  if (computed) {
    run.send({ type: 'handoff', from: 'insights', to: 'narrator', note: 'Brief from computed facts only' });
    await step(narrator, async () => {
      const points = talkingPoints(computed.persona, computed.ins);
      const sheet = {
        customer: fact('identity.name'), facts: [...run.facts.values()].map((x) => `${x.label || x.field}: ${x.display ?? x.value} [${x.tier}]`),
        talkingPoints: points.map((p) => `${p.title} ${p.text}`),
      };
      let brief = null;
      if (tools.narrate) {
        try {
          const out = await narrator.tool('mitraAi.writeBrief', { facts: sheet.facts.length, rule: 'no figure outside the fact sheet' }, () => tools.narrate(sheet));
          brief = out.data;
        } catch {
          narrator.think('The model reply was not usable; using the engine’s own talking points.');
        }
      }
      if (!brief) {
        narrator.think('Using the engine’s talking points verbatim — every figure in them was computed above.');
        brief = { generator: 'engine', points };
      }
      const first = String(fact('identity.name') || 'there').split(' ')[0];
      run.send({ type: 'brief', audience: 'rm', generator: brief.generator, points: brief.points });
      const read = [bank && 'your IDBI accounts', funds && 'funds', has('insurance.termCover') && 'policies'].filter(Boolean);
      const opener = computed.scoreReady ? `Your health score is ${computed.ins.hs.total}/100 — shall` : 'Shall';
      run.send({ type: 'brief', audience: 'customer', generator: 'engine', text: `Namaste ${first}! I’ve gone through ${read.join(', ').replace(/, ([^,]*)$/, ' and $1') || 'what you shared'}. ${opener} we start with ${points[0]?.title.replace(/\.$/, '').replace(/ (first|next)$/, '').toLowerCase() || 'your goals'}?` });
      return {};
    });
  } else {
    narrator.status('skipped', 'No insights to narrate');
  }

  orch.think(`Done. Nothing was saved to the customer profile — this run is a demo of the pipeline.`);
  orch.status('done');
  run.send({ type: 'done', ms: Date.now() - started, stats: { ...run.stats, gaps: firstPass?.asks.length || 0, insightsReady: secondPass.filter((c) => c.ready).length, insightsTotal: secondPass.length } });
}
