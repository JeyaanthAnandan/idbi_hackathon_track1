import { customer, dataQuality, totalWealth } from '../data/customer.js';
import { cashflow, healthScore, fmt } from './analytics.js';
import { POLICY, returnScenario } from '../data/policy.js';
import { getBootstrap } from './api.js';

const FORMULAS = {
  allocation: 'holding value ÷ total connected wealth',
  spending: 'latest complete month compared with prior 3-month mean',
  sip: 'monthly SIP future-value formula using the displayed scenario rate',
  goals: 'target less compounded savings, funded through monthly SIPs',
  tax: 'eligible 80C gap ÷ remaining FY months; saving uses confirmed marginal rate',
  health: 'weighted savings, emergency cover, diversification and goal readiness',
  drift: 'current connected allocation compared with risk-profile target',
  protection: 'term-cover multiple and city health-cover policy',
  xray: 'same-fund regular vs direct expense-ratio compounding',
  harvest: 'eligible unrealised equity gain × current LTCG policy rate',
  compare: 'loan amortisation compared with scenario-based investment return',
  collision: 'sum of goal SIP needs compared with current investing capacity',
  offer: 'policy signal check; not a certification that an offer is legitimate',
};

function evidenceFor(response) {
  const cf = cashflow();
  const evidenceAsOf = getBootstrap().profile?.savedAt?.slice(0, 10) || dataQuality.dataAsOf || 'Demo fixture';
  const evidence = [
    { field: 'customer.totalWealth', value: fmt(totalWealth()), source: 'customer-360' },
    { field: 'cashflow.monthlyIncome', value: fmt(cf.avgIncome), source: 'transaction-analytics' },
    { field: 'cashflow.monthlySurplus', value: fmt(cf.surplus), source: 'transaction-analytics' },
  ];
  if (response.widget?.type === 'health') evidence.push({ field: 'health.score', value: `${healthScore().total}/100`, source: 'wealth-policy-engine' });
  const data = response.widget?.data || {};
  if (response.widget?.type === 'sip') {
    evidence.push({ field: 'projection.monthly', value: fmt(data.monthly), source: 'wealth-policy-engine' });
    evidence.push({ field: 'projection.returnScenario', value: `${data.rate}%`, source: POLICY.version });
  }
  if (response.widget?.type === 'tax') evidence.push({ field: 'tax.80cGap', value: fmt(data.gap), source: 'confirmed-tax-profile' });
  if (response.widget?.type === 'protection') evidence.push({ field: 'protection.termGap', value: fmt(data.termGap), source: 'insurance-policy-feed' });
  if (response.widget?.type === 'xray' && data.available !== false) evidence.push({ field: 'fund.expenseRatioGap', value: `${data.dragPct}%`, source: 'fund-facts' });
  return evidence.slice(0, 8).map((item) => ({ ...item, asOf: evidenceAsOf }));
}

export function buildAdvicePassport({ question, response, riskProfile, engineMode = 'DETERMINISTIC' }) {
  if (!question || !response?.text || !(response.widget || response.why || response.cta || response.toolRouted)) return null;
  const type = response.widget?.type || response.cta?.type || 'guidance';
  const connectedSources = getBootstrap().profile?.sources;
  const sources = connectedSources?.length ? connectedSources : dataQuality.sources?.length ? dataQuality.sources : ['synthetic:customer-360'];
  const observedAsOf = getBootstrap().profile?.savedAt?.slice(0, 10) || dataQuality.dataAsOf || 'Demo fixture';
  const scenario = returnScenario(riskProfile);
  const assumptions = [
    `Policy ${POLICY.version}, effective ${POLICY.asOf}`,
    `Return band for ${riskProfile}: ${scenario.bear}% / ${scenario.base}% / ${scenario.bull}%`,
    ...(response.why || []),
  ];
  return {
    question,
    summary: response.text,
    recommendationType: type,
    engineMode,
    riskProfile,
    policyVersion: POLICY.version,
    dataAsOf: observedAsOf,
    confidence: response.widget?.type?.endsWith('-unavailable')
      ? Math.min(Number(dataQuality.confidence ?? 0.35), 0.35)
      : Math.max(0, Math.min(Number(dataQuality.confidence ?? 0.75), 1)),
    customerRef: customer.id,
    sources,
    formula: FORMULAS[type] || 'deterministic policy rule over connected customer facts',
    evidence: evidenceFor(response),
    assumptions,
    action: {
      type: response.cta?.type || 'none',
      status: response.cta ? 'PENDING_CONFIRMATION' : 'EDUCATIONAL',
    },
  };
}
