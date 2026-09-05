// Versioned financial assumptions used by the deterministic engine.
// In production this shape is returned by /policy/assumptions and every
// recommendation stores the version it used in its Advice Passport.
export const POLICY_VERSION = 'wealth-policy@2026.09.04';
export const POLICY_AS_OF = '2026-09-04';

export const POLICY = Object.freeze({
  version: POLICY_VERSION,
  asOf: POLICY_AS_OF,
  emergency: Object.freeze({ targetMonths: 6 }),
  tax: Object.freeze({
    section80CLimit: 150000,
    section80CEligibleRegimes: Object.freeze(['Old']),
    ltcgEquityExemption: 125000,
    ltcgEquityRate: 0.125,
    fallbackMarginalRate: 0.312,
  }),
  insurance: Object.freeze({
    termIncomeMultiple: 15,
    metroHealthCover: 1500000,
    nonMetroHealthCover: 1000000,
    metroCities: Object.freeze(['Mumbai', 'Delhi', 'Bengaluru', 'Chennai', 'Kolkata', 'Hyderabad', 'Pune']),
    premiumPerLakhByAge: Object.freeze([
      Object.freeze({ maxAge: 30, termAnnual: 55, healthAnnual: 230 }),
      Object.freeze({ maxAge: 40, termAnnual: 82, healthAnnual: 310 }),
      Object.freeze({ maxAge: 50, termAnnual: 145, healthAnnual: 475 }),
      Object.freeze({ maxAge: Infinity, termAnnual: 260, healthAnnual: 720 }),
    ]),
  }),
  returns: Object.freeze({
    savings: 3,
    fixedDeposit: 7,
    Conservative: Object.freeze({ bear: 5, base: 8, bull: 10 }),
    Balanced: Object.freeze({ bear: 7, base: 11, bull: 14 }),
    Aggressive: Object.freeze({ bear: 8, base: 13.5, bull: 17 }),
  }),
  offerChecks: Object.freeze({ highReturnClaimPct: 8 }),
  confidence: Object.freeze({ minimumForAdvice: 0.7, minimumMonthsForTrend: 4 }),
});

export function monthsRemainingInFinancialYear(value = POLICY_AS_OF) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00+05:30`);
  if (Number.isNaN(date.getTime())) throw new TypeError('A valid policy date is required');
  const month = date.getMonth() + 1;
  return month <= 3 ? 4 - month : 16 - month;
}

export function returnScenario(profile = 'Balanced') {
  return POLICY.returns[profile] || POLICY.returns.Balanced;
}

export function healthCoverTarget(city = '') {
  const metro = POLICY.insurance.metroCities.some((item) => item.toLowerCase() === String(city).trim().toLowerCase());
  return metro ? POLICY.insurance.metroHealthCover : POLICY.insurance.nonMetroHealthCover;
}

export function insurancePremiumRates(age = 30) {
  return POLICY.insurance.premiumPerLakhByAge.find((band) => Number(age) <= band.maxAge)
    || POLICY.insurance.premiumPerLakhByAge.at(-1);
}
