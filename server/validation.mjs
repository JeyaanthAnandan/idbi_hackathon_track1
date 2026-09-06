export const validRisk = (value) => ['Conservative', 'Balanced', 'Aggressive'].includes(value);
const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const amount = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export function validPersona(p) {
  return record(p) && record(p.customer) && typeof p.customer.name === 'string' && p.customer.name.trim().length > 0
    && amount(p.customer.monthlyIncome) && amount(p.customer.savingsBalance)
    && p.customer.age >= 18 && p.customer.age <= 120
    && ['holdings', 'loans', 'monthlySummary', 'spendByCategory', 'subscriptions', 'goals'].every((key) => Array.isArray(p[key]))
    && p.holdings.every((h) => record(h) && typeof h.type === 'string' && typeof h.label === 'string' && amount(h.value))
    && p.monthlySummary.every((m) => record(m) && typeof m.month === 'string' && ['income', 'spend', 'invested'].every((key) => amount(m[key])))
    && p.goals.every((g) => record(g) && typeof g.name === 'string' && amount(g.target) && amount(g.saved) && g.horizonYears > 0)
    && p.spendByCategory.every((c) => record(c) && typeof c.category === 'string' && amount(c.amount) && amount(c.avg3m))
    && p.subscriptions.every((s) => record(s) && typeof s.lastUsed === 'string' && amount(s.amount))
    && p.loans.every((l) => record(l) && amount(l.balance) && amount(l.rate) && amount(l.emi))
    && ['tax', 'insurance', 'peers', 'roundupStats'].every((key) => record(p[key]));
}

export function validState(input) {
  if (!record(input)) return false;
  if (input.chat !== undefined && (!Array.isArray(input.chat) || !input.chat.every((m) => record(m) && ['user', 'mitra'].includes(m.from) && typeof m.text === 'string'))) return false;
  if (input.xp !== undefined && (!record(input.xp) || !amount(input.xp.total) || !Array.isArray(input.xp.awarded) || !input.xp.awarded.every((r) => typeof r === 'string'))) return false;
  if (input.appState !== undefined) {
    const s = input.appState;
    const actions = new Set(['sip', 'roundup', 'direct-switch', 'harvest', 'prepay', 'subs-cancel', 'protection-fix', 'emergency-fix']);
    if (!record(s) || !Array.isArray(s.actions) || !record(s.rules)) return false;
    if (!s.actions.every((a) => record(a) && actions.has(a.type) && amount(a.amount))) return false;
    if (!Object.entries(s.rules).every(([key, value]) => ['salary', 'sweep', 'dining', 'stepup'].includes(key) && typeof value === 'boolean')) return false;
  }
  return true;
}
