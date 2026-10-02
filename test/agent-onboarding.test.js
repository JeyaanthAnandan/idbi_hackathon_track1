import test from 'node:test';
import assert from 'node:assert/strict';
import { runOnboardingFlow } from '../src/engine/agents/onboardingFlow.js';
import { simulatedTools } from '../src/engine/agents/simulatedSources.js';
import { redact, TIERS } from '../src/engine/agents/runtime.js';
import { evaluateContracts } from '../src/engine/agents/contracts.js';
import { briefIsGrounded } from '../server/agents.mjs';

// Simulated latency is real setTimeout; strip it so the suite stays fast.
function instantTools(customer, overrides = {}) {
  const tools = simulatedTools(customer);
  return { ...tools, ...overrides };
}

async function run(customer, overrides) {
  const events = [];
  const original = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => original(fn, 0);
  try {
    await runOnboardingFlow({ customer, tools: instantTools(customer, overrides), emit: (e) => events.push(e) });
  } finally {
    globalThis.setTimeout = original;
  }
  return events;
}

test('a simulated run unlocks every insight after the customer answers', async () => {
  const events = await run('priya');
  const done = events.find((e) => e.type === 'done');
  assert.equal(done.stats.insightsReady, 8);
  assert.equal(done.stats.failedTools, 0);
  const firstPass = events.filter((e) => e.type === 'contract' && e.pass === 1);
  assert.ok(firstPass.some((c) => !c.ready), 'some insights must wait on the customer');
  assert.ok(events.filter((e) => e.type === 'insight').every((i) => i.status === 'computed'));
});

test('every fact carries a source tier and every tool result a timing', async () => {
  const events = await run('arjun');
  const tiers = new Set(Object.values(TIERS));
  events.filter((e) => e.type === 'fact').forEach((f) => assert.ok(tiers.has(f.tier), `${f.field} has tier ${f.tier}`));
  events.filter((e) => e.type === 'tool_result').forEach((r) => assert.ok(Number.isFinite(r.ms)));
  // Every call that started also finished.
  const calls = events.filter((e) => e.type === 'tool_call').map((e) => e.id);
  const results = new Set(events.filter((e) => e.type === 'tool_result').map((e) => e.id));
  calls.forEach((id) => assert.ok(results.has(id), `${id} has a result`));
});

test('the Insight Engine matches the RM console engine for the same customer', async () => {
  const events = await run('arjun');
  const score = events.find((e) => e.type === 'fact' && e.field === 'health.score');
  assert.ok(score.value > 0 && score.value <= 100);
  const protection = events.find((e) => e.type === 'insight' && e.id === 'protection');
  assert.match(protection.value, /3 dependents/);
});

test('a failed core-banking source degrades the run instead of ending it', async () => {
  const events = await run('priya', { coreBanking: async () => { throw new Error('IDBI gateway returned 403'); } });
  const core = events.filter((e) => e.type === 'agent' && e.agent === 'core').at(-1);
  assert.equal(core.status, 'degraded');
  const emergency = events.find((e) => e.type === 'insight' && e.id === 'emergency');
  assert.equal(emergency.status, 'needs-data');
  assert.ok(!events.some((e) => e.type === 'fact' && e.field === 'health.score'), 'no health score on missing cash flow');
  assert.ok(events.some((e) => e.type === 'rm_task' && e.field === 'bank.savingsBalance'));
  assert.ok(events.some((e) => e.type === 'done'));
});

test('consent-gated sources are not called without consent', async () => {
  const events = await run('priya', { accountAggregator: async () => ({ data: { status: 'REJECTED', fiTypes: [] }, tier: TIERS.SIMULATED, summary: 'Rejected' }) });
  const portfolio = events.filter((e) => e.type === 'agent' && e.agent === 'portfolio').at(-1);
  assert.equal(portfolio.status, 'skipped');
  assert.ok(!events.some((e) => e.type === 'tool_call' && e.agent === 'portfolio'));
});

test('identifiers are masked in tool arguments', () => {
  assert.deepEqual(redact({ input: { acid: '660100100003', branchId: '105' }, cifId: '98655854' }), { input: { acid: '••••0003', branchId: '105' }, cifId: '••••5854' });
});

test('contracts list exactly what is missing', () => {
  const have = new Set(['cashflow.monthlyIncome', 'cashflow.monthlySpend']);
  const surplus = evaluateContracts((f) => have.has(f)).find((c) => c.id === 'surplus');
  assert.equal(surplus.ready, true);
  const protection = evaluateContracts((f) => have.has(f)).find((c) => c.id === 'protection');
  assert.deepEqual(protection.missing, ['insurance.termCover', 'household.dependents']);
});

test('a model-written brief may not introduce figures', () => {
  const sheet = { facts: ['Term cover: ₹5 L [SIMULATED]', '80C used: ₹24,000 [DECLARED]'] };
  assert.equal(briefIsGrounded([{ title: 'Tax.', text: '₹24,000 used so far, 3 dependents.' }], sheet), true);
  assert.equal(briefIsGrounded([{ title: 'Tax.', text: 'Invest ₹50,000 more.' }], sheet), false);
});
