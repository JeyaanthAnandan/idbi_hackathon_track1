import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMonthlySummary, buildSpendByCategory, parseBankStatementCSV, totalIncome,
} from '../src/engine/statementImport.js';
import { buildCustomPersona } from '../src/engine/personaBuilder.js';
import {
  POLICY, healthCoverTarget, monthsRemainingInFinancialYear, returnScenario,
} from '../src/data/policy.js';
import { buildMoneyPersona } from '../src/engine/analytics.js';
import { PERSONAS } from '../src/data/personas.js';
import {
  figuresPreserved, validateAdvisorResponse, validateAdvisorToolCall, validateGoalDraft, validateOfferAnalysis,
} from '../src/engine/advisorTools.js';
import {
  issueAdviceReceipt, normalizeAdvicePassport, verifyAdviceReceiptChain,
} from '../server/adviceReceipts.mjs';

const statement = `date,description,amount,type
2026-05-01,Salary Credit,100000,credit
2026-05-02,Rent,30000,debit
2026-05-03,SIP Mutual Fund,10000,debit
2026-06-01,Salary Credit,100000,credit
2026-06-02,Rent,30000,debit
2026-06-03,SIP Mutual Fund,10000,debit
2026-06-04,Shopping,12000,debit
2026-06-05,Shopping refund,5000,credit`;

test('uploaded statement keeps investments separate from consumption', () => {
  const rows = buildMonthlySummary(parseBankStatementCSV(statement));
  assert.deepEqual(rows, [
    { month: 'May', income: 100000, spend: 30000, invested: 10000 },
    { month: 'Jun', income: 100000, spend: 42000, invested: 10000 },
  ]);
});

test('income estimate ignores refunds and uses recurring salary credits', () => {
  assert.equal(totalIncome(parseBankStatementCSV(statement)), 100000);
});

test('spending comparison uses latest month against prior observed months', () => {
  const categories = buildSpendByCategory(parseBankStatementCSV(statement));
  assert.deepEqual(categories.find((row) => row.category === 'Shopping'), {
    category: 'Shopping', amount: 12000, avg3m: 0, essential: false,
  });
  assert.deepEqual(categories.find((row) => row.category === 'Rent & Utilities'), {
    category: 'Rent & Utilities', amount: 30000, avg3m: 30000, essential: true,
  });
});

test('custom persona does not fabricate holdings, tax, insurance, or loans', () => {
  const { persona } = buildCustomPersona({
    name: 'Uploaded Customer', age: 36, city: 'Mumbai',
    transactions: parseBankStatementCSV(statement), holdings: [], sources: ['upload:test.csv'],
  });
  assert.deepEqual(persona.holdings, []);
  assert.deepEqual(persona.loans, []);
  assert.equal(persona.fundFacts, null);
  assert.equal(persona.tax.dataAvailable, false);
  assert.equal(persona.insurance.dataAvailable, false);
  assert.equal(persona.customer.monthlyIncome, 100000);
});

test('money persona changes with both customers instead of leaking Priya copy to Arjun', () => {
  const derive = (persona) => {
    const months = persona.monthlySummary;
    const avgIncome = months.reduce((sum, item) => sum + item.income, 0) / months.length;
    const avgSpend = months.reduce((sum, item) => sum + item.spend, 0) / months.length;
    return buildMoneyPersona({
      observedMonths: months.length,
      investedMonths: months.filter((item) => item.invested > 0).length,
      savingsRate: ((avgIncome - avgSpend) / avgIncome) * 100,
      largestAnomaly: null,
      protection: null,
    });
  };
  assert.equal(derive(PERSONAS.priya).title, 'The Disciplined Dreamer');
  assert.equal(derive(PERSONAS.arjun).title, 'The Resilient Rebuilder');
});

test('dated policy is the single source for FY, cover, and return assumptions', () => {
  assert.equal(monthsRemainingInFinancialYear(POLICY.asOf), 7);
  assert.equal(healthCoverTarget('Mumbai'), POLICY.insurance.metroHealthCover);
  assert.equal(healthCoverTarget('Mysuru'), POLICY.insurance.nonMetroHealthCover);
  assert.equal(returnScenario('Balanced').base, 11);
  assert.match(POLICY.version, /2026\.09\.04/);
});

test('advisor tool and extraction schemas reject malformed payloads', () => {
  assert.equal(validateAdvisorToolCall({ name: 'buy_stock', arguments: {} }).ok, false);
  assert.equal(validateAdvisorToolCall({ name: 'show_portfolio', arguments: { ticker: 'XYZ' } }).ok, false);
  assert.equal(validateAdvisorResponse({ text: 'Do it', cta: { type: 'wire-money', amount: 1 } }).ok, false);
  assert.equal(validateGoalDraft({ ok: true, name: 'Impossible', target: -1, years: 2 }), null);
  assert.equal(validateOfferAnalysis({ verdict: 'safe', score: 120 }), null);
});

test('policy filter blocks unsupported execution and guaranteed-return claims', () => {
  assert.equal(validateAdvisorResponse({ text: 'Your order was placed.' }).ok, false);
  assert.equal(validateAdvisorResponse({ text: 'This will definitely double your money.' }).ok, false);
  assert.equal(validateAdvisorResponse({ text: 'This 11% scenario is market-linked and not guaranteed.' }).ok, true);
  assert.equal(figuresPreserved('Invest ₹12,500 for 10 years at 11%.', '₹12,500 को 10 साल के लिए 11% पर निवेश करें।'), true);
  assert.equal(figuresPreserved('Invest ₹12,500 for 10 years.', '₹15,000 को 10 साल के लिए निवेश करें।'), false);
});

test('advice receipts are append-only, linked, and tamper evident', () => {
  const db = { adviceReceipts: [] };
  const passport = normalizeAdvicePassport({
    question: 'How should I invest?', summary: 'Use the balanced base scenario.',
    confidence: 0.92, policyVersion: POLICY.version, dataAsOf: '2026-08-31',
    sources: ['upload:statement.csv'], formula: 'surplus × scenario return',
    evidence: [{ field: 'surplus', value: '₹20,000', source: 'statement', asOf: '2026-08-31' }],
    action: { type: 'sip-setup', status: 'PENDING_CONFIRMATION' },
  });
  const first = issueAdviceReceipt(db, 'usr_test', passport, '2026-09-04T10:00:00.000Z');
  const second = issueAdviceReceipt(db, 'usr_test', passport, '2026-09-04T10:01:00.000Z');
  assert.equal(second.previousHash, first.receiptHash);
  assert.equal(verifyAdviceReceiptChain(db.adviceReceipts, 'usr_test'), true);
  db.adviceReceipts[0].summary = 'tampered';
  assert.equal(verifyAdviceReceiptChain(db.adviceReceipts, 'usr_test'), false);
});

test('receipt API normalization refuses an executed action claim', () => {
  const normalized = normalizeAdvicePassport({
    question: 'Buy it', summary: 'Done', confidence: 0.8,
    policyVersion: POLICY.version, dataAsOf: '2026-08-31',
    action: { type: 'trade', status: 'EXECUTED' },
  });
  assert.equal(normalized, null);
});
