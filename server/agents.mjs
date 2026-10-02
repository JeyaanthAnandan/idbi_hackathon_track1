// Agentic onboarding demo — POST /api/agents/onboard streams one run of
// src/engine/agents/onboardingFlow.js as NDJSON, one event per line.
//
// With IDBI_LIVE_SANDBOX=true, Core Banking and the AA consent call the real
// sandbox gateway and every HTTP request appears on the trace. Sources IDBI
// does not expose (CAS, insurance, CKYC) stay simulated and say so. The run
// is read-only: it writes nothing to the user's profile, so the existing
// connect and onboarding flows are unaffected.
import { runOnboardingFlow } from '../src/engine/agents/onboardingFlow.js';
import { simulatedTools } from '../src/engine/agents/simulatedSources.js';
import { TIERS } from '../src/engine/agents/runtime.js';
import { fetchIdbiConsentSnapshot, fetchIdbiDirectSnapshot, idbiEnabled, idbiTrace, requestIdbiConsent } from './idbi.mjs';
import { aiStatus, clientId, deepseekComplete, rateLimited } from './aiProxy.mjs';
import { audit, updateStore } from './store.mjs';

// API id and a one-line reading of each gateway response, for the trace.
const ROUTES = {
  getCustomerAccountsByCustIdtest: ['394', (d) => `${d.customerAccountInfo?.length ?? 0} accounts discovered`],
  performAccountEnquirytest: ['365', (d) => `${d.bankAcctStatusCode || 'status ?'} · ${d.acctCurr || 'INR'} · ${d.acctBal?.length ?? 0} balance types`],
  getFullAccountStatementWithPaginationtest: ['393', (d) => `${d.result?.transactionDetails?.length ?? 0} rows · hasMoreData=${d.result?.hasMoreData ?? '?'}`],
  accountLienEnquirytest: ['362', () => 'Lien details returned'],
  fetchCustomerLimitDetailstest: ['442', () => 'Credit exposure summary returned'],
  getLoanOverdueDetailstest: ['402', () => 'Loan overdue rows returned'],
  getLoanAccountDetailstest: ['391', () => 'Loan contract terms returned'],
  requestConsentFromFinProtest: ['590', (d) => `consent_handle issued · ${d.data?.status || 'PENDING'}`],
  getWebRedirectionEncryptedURLtest: ['592', () => 'Redirect URL issued'],
  getConsentListFromFinProtest: ['591', () => 'Consent list returned'],
  getAccountStatementFromFinProtest: ['739', () => 'Consent-backed statement returned'],
};

function traced(ctx, parent, fn) {
  return idbiTrace.run((call) => {
    const route = call.path.split('/').pop();
    const [api, read] = ROUTES[route] || [null, () => 'OK'];
    let summary;
    try { summary = call.ok ? read(call.data || {}) : undefined; } catch { summary = 'OK'; }
    ctx.subcall(parent, {
      tool: `idbi.${route.replace(/test$/, '')}`, api, args: call.payload, ms: call.ms, ok: call.ok,
      tier: TIERS.LIVE, summary, requestId: call.requestId, error: call.error,
    });
  }, fn);
}

const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const figures = (text) => (String(text).match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => n.replace(/,/g, ''));

// Every figure in the brief must already be in the fact sheet; small counts
// (1–9) are allowed because "3 dependents" restates a fact, not a new number.
export function briefIsGrounded(points, sheet) {
  const allowed = new Set(figures(JSON.stringify(sheet)));
  return points.every((p) => figures(`${p.title} ${p.text}`).every((n) => allowed.has(n) || /^\d$/.test(n)));
}

function liveTools(customer, signal) {
  const base = simulatedTools(customer, { signal });
  const tools = { ...base, mode: 'live' };

  // A gateway failure is left on the trace, then the run continues on the
  // simulated source and says so — a demo that stops at a 403 shows nothing.
  tools.coreBanking = async (ctx, callId) => {
    try {
      return await traced(ctx, callId, async () => {
        const snap = await fetchIdbiDirectSnapshot({ customer });
        return {
          data: snap, tier: TIERS.LIVE, requestId: snap.provenance?.requestIds?.[0] || null,
          summary: `${snap.transactions.length} transactions · balance ${inr(snap.account?.balance || 0)} · loans ${snap.liabilities?.status || 'unavailable'}`,
        };
      });
    } catch (error) {
      ctx.think(`Live IDBI gateway failed (${error.message}). Falling back to the simulated core-banking source; its facts are tagged SIMULATED.`);
      return base.coreBanking(ctx, callId);
    }
  };

  // The sandbox consent samples are bound to one test mobile (Priya's), so
  // only she has a live consent; anyone else uses the simulated one.
  if (customer === 'priya') {
    tools.accountAggregator = async (ctx, callId) => {
      try {
        return await traced(ctx, callId, async () => {
          await requestIdbiConsent();
          const snap = await fetchIdbiConsentSnapshot();
          const status = String(snap.consent?.status || '').toUpperCase();
          return {
            data: { status: status || 'UNKNOWN', consentId: snap.consent?.consentId, fiTypes: ['DEPOSIT', 'MUTUAL_FUNDS', 'INSURANCE_POLICIES'], accounts: snap.accounts?.length || 0 },
            tier: TIERS.LIVE,
            summary: `Consent ${status || 'UNKNOWN'} · ${snap.accounts?.length || 0} linked account(s)`,
          };
        });
      } catch (error) {
        ctx.think(`Live consent flow failed (${error.message}). Continuing on the simulated consent so the rest of the run can be shown.`);
        return base.accountAggregator(ctx, callId);
      }
    };
  }
  return tools;
}

async function narrate(sheet) {
  const content = await deepseekComplete({
    json: true,
    maxTokens: 700,
    messages: [
      { role: 'system', content: 'You write a pre-meeting brief for an IDBI Bank relationship manager. Use ONLY figures that appear in the fact sheet, copied exactly. No new numbers, no product names that are not in it, no promises of returns. Reply as JSON: {"points":[{"title":"2-4 words.","text":"one sentence"}]} with at most 4 points, most urgent first.' },
      { role: 'user', content: JSON.stringify(sheet) },
    ],
  });
  const points = JSON.parse(content).points;
  if (!Array.isArray(points) || !points.length || points.some((p) => typeof p?.title !== 'string' || typeof p?.text !== 'string')) throw new Error('Brief was not in the expected shape');
  if (!briefIsGrounded(points, sheet)) throw new Error('Brief introduced a figure that is not in the fact sheet');
  return { data: { generator: 'ai', points: points.slice(0, 4) }, tier: TIERS.DERIVED, summary: `${points.length} points · every figure checked against the fact sheet` };
}

export async function streamOnboarding(req, res, input, user) {
  const customer = input.customer;
  if (!['priya', 'arjun'].includes(customer)) {
    res.writeHead(422, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ title: 'Unknown onboarding customer', status: 422 }));
  }
  if (rateLimited(clientId(req), 'agents')) {
    res.writeHead(429, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ title: 'Too many onboarding runs — try again in a minute', status: 429 }));
  }
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });

  const live = idbiEnabled() && input.live !== false;
  const tools = live ? liveTools(customer, controller.signal) : simulatedTools(customer, { signal: controller.signal });
  if (aiStatus().llm) tools.narrate = narrate;
  const emit = (event) => { if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`); };
  try {
    await runOnboardingFlow({ customer, tools, emit, signal: controller.signal, mode: live ? 'live' : 'simulated' });
    if (user) await updateStore((db) => audit(db, user.id, 'agents.onboarding.run', { customer, mode: live ? 'live' : 'simulated' }));
  } catch (error) {
    if (!controller.signal.aborted) emit({ type: 'error', message: error.message });
  }
  res.end();
}
