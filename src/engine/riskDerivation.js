// ─────────────────────────────────────────────────────────────
// Derives a risk profile straight from a customer's actual holdings and
// cashflow, instead of asking them to self-report it via the quiz. Same
// three buckets the quiz produces, so every downstream screen (model
// portfolios, advisor copy) works unchanged.
// ─────────────────────────────────────────────────────────────
const GROWTH_TYPES = ['Mutual Fund', 'Stocks', 'Equity', 'ETF'];

export function deriveRiskProfile({ holdings = [], monthlySummary = [], age } = {}) {
  const total = holdings.reduce((s, h) => s + h.value, 0);
  const growth = holdings
    .filter((h) => GROWTH_TYPES.includes(h.type))
    .reduce((s, h) => s + h.value, 0);
  const equityPct = total > 0 ? growth / total : 0.3; // no data → assume a moderate starting mix

  let score = 0;
  score += equityPct > 0.55 ? 3 : equityPct > 0.3 ? 2 : 1;
  score += age == null ? 2 : age < 32 ? 3 : age < 45 ? 2 : 1;

  if (monthlySummary.length >= 2) {
    const incomes = monthlySummary.map((m) => m.income);
    const mean = incomes.reduce((a, b) => a + b, 0) / incomes.length;
    const variance = incomes.reduce((a, b) => a + (b - mean) ** 2, 0) / incomes.length;
    const cv = mean ? Math.sqrt(variance) / mean : 0;
    score += cv < 0.08 ? 3 : cv < 0.2 ? 2 : 1;
  } else {
    score += 2;
  }

  if (score <= 4) return 'Conservative';
  if (score <= 6) return 'Balanced';
  return 'Aggressive';
}
