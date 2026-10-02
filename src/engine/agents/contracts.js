// ─────────────────────────────────────────────────────────────
// What each insight needs before MITRA may state it. The Gap Analyzer
// checks these against the fact ledger: an insight whose inputs are all
// present is computed; one with a missing input is not guessed at — the
// missing fact becomes a question for the customer or a task for the RM.
// ─────────────────────────────────────────────────────────────

export const INSIGHT_CONTRACTS = [
  { id: 'emergency', title: 'Emergency reserve', requires: ['bank.savingsBalance', 'cashflow.monthlySpend'] },
  { id: 'surplus', title: 'Idle surplus → SIP', requires: ['cashflow.monthlyIncome', 'cashflow.monthlySpend'] },
  { id: 'debt', title: 'Debt load (EMI / income)', requires: ['liabilities.loans', 'cashflow.monthlyIncome'] },
  { id: 'protection', title: 'Life-cover gap', requires: ['cashflow.monthlyIncome', 'insurance.termCover', 'household.dependents'] },
  { id: 'tax', title: 'Section 80C headroom', requires: ['tax.regime', 'tax.section80CUsed'] },
  { id: 'drift', title: 'Allocation vs risk profile', requires: ['portfolio.holdings', 'risk.profile'] },
  { id: 'fees', title: 'Regular-plan fee drag', requires: ['portfolio.fundFacts'] },
  { id: 'goals', title: 'Goals vs capacity', requires: ['goals', 'cashflow.monthlyIncome', 'cashflow.monthlySpend'] },
];

// Facts no connected source can supply, and who is asked for them. A bank
// statement shows the premium, not how many people depend on the income.
export const ASK = {
  'household.dependents': { who: 'customer', question: 'How many people depend on your income — partner, children, parents?' },
  'tax.regime': { who: 'customer', question: 'Do you file under the old or the new income-tax regime?' },
  'tax.section80CUsed': { who: 'customer', question: 'Roughly how much have you put into 80C this year outside IDBI — PF, PPF, insurance premiums?' },
  'insurance.termCover': { who: 'customer', question: 'Do you hold a term life policy? If so, for how much cover?' },
  'portfolio.holdings': { who: 'rm', question: 'Investments outside IDBI are not linked. Ask the customer to share a CAS statement.' },
  'portfolio.fundFacts': { who: 'rm', question: 'Fund plan (Regular / Direct) is unknown. Confirm from the CAS statement.' },
  goals: { who: 'mitra', question: 'No system holds goals. MITRA drafts starter goals from income for the customer to confirm in chat.' },
  'cashflow.monthlyIncome': { who: 'customer', question: 'No salary or business credits were recognisable. What is your usual monthly take-home?' },
  'cashflow.monthlySpend': { who: 'rm', question: 'The statement has no debits to measure spending from. Confirm monthly expenses with the customer.' },
  'risk.profile': { who: 'customer', question: 'Four quick questions to set your risk profile (MITRA’s onboarding quiz).' },
  'bank.savingsBalance': { who: 'rm', question: 'The savings balance could not be read. Check the account in core banking.' },
  'liabilities.loans': { who: 'rm', question: 'Loan records could not be fetched. Check the loan system before advising.' },
};

export function evaluateContracts(has) {
  return INSIGHT_CONTRACTS.map((c) => {
    const missing = c.requires.filter((field) => !has(field));
    return { ...c, missing, ready: missing.length === 0 };
  });
}
