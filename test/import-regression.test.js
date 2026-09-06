import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBankStatementCSV, parseHoldingsCSV, detectSubscriptions } from '../src/engine/statementImport.js';

test('Indian day-first dates normalize consistently and invalid dates are rejected', () => {
  const rows = parseBankStatementCSV('date,description,amount,type\n05/06/2026,Rent,30000,debit\n31/02/2026,Invalid,100,debit\n2026-13-01,Invalid,100,debit\n01-07-26,Salary,60000,credit');
  assert.deepEqual(rows.map((r) => r.date), ['2026-06-05', '2026-07-01']);
});
test('malformed and infinite amounts do not become financial data', () => {
  assert.deepEqual(parseBankStatementCSV('date,description,amount\n2026-06-01,Bad,Infinity\n2026-06-01,Bad,120oops'), []);
  assert.deepEqual(parseHoldingsCSV('name,value\nBad,Infinity\nBad,120oops\nBad,-100'), []);
});
test('recurring rent and investments are not subscriptions; usage remains unknown', () => {
  const rows = [6, 7].flatMap((month) => ['Rent', 'SIP Mutual Fund', 'Netflix'].map((description) => ({ date: `2026-0${month}-01`, description, amount: 1000, type: 'debit' })));
  const subscriptions = detectSubscriptions(rows);
  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0].name, 'Netflix');
  assert.equal(subscriptions[0].lastUsed, 'unknown');
});
