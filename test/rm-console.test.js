import test from 'node:test';
import assert from 'node:assert/strict';

import { PERSONAS } from '../src/data/personas.js';
import { BOOK, findInBook } from '../src/data/rmBook.js';
import { cashflow, healthScore, protectionGap, taxGap, drift } from '../src/engine/analytics.js';
import { customerInsights } from '../src/engine/rmInsights.js';

test('RM insights match the customer-app engine for the active demo customer', () => {
  const ins = customerInsights(PERSONAS.priya, 'Balanced');
  assert.equal(ins.hs.total, healthScore().total);
  assert.equal(Math.round(ins.cf.surplus), Math.round(cashflow().surplus));
  assert.equal(ins.tg.gap, taxGap().gap);
  assert.equal(ins.pg.termGap, protectionGap().termGap);
  assert.equal(ins.dr.biggest.name, drift('Balanced').biggestGap.name);
});

test('book is synthetic, unique and every customer computes', () => {
  const ids = BOOK.map((p) => p.customer.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(BOOK.length >= 8);
  for (const p of BOOK) {
    const ins = customerInsights(p, p.riskProfile);
    assert.ok(Number.isFinite(ins.hs.total) && ins.hs.total >= 0 && ins.hs.total <= 100, p.customer.name);
    assert.ok(Number.isFinite(ins.aum));
  }
});

test('policy-driven flags: debt, seniors and new-regime 80C', () => {
  const gurpreet = customerInsights(findInBook('CUST-38044'), 'Balanced');
  assert.ok(gurpreet.flags.some((f) => f.code === 'DEBT' && f.level === 'high'));
  const lakshmi = customerInsights(findInBook('CUST-61402'), 'Conservative');
  assert.ok(lakshmi.flags.some((f) => f.code === 'SENIOR'));
  const ananya = customerInsights(findInBook('CUST-97215'), 'Aggressive');
  assert.equal(ananya.tg.available, false, '80C does not apply under the new regime');
  assert.ok(!ananya.opportunities.some((o) => o.id === 'elss'));
});

test('customer handoff reaches the RM desk and RM actions flow back with an intact audit chain', async () => {
  const memory = new Map();
  globalThis.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };
  try {
    const desk = await import('../src/engine/rmDesk.js');
    const seeded = desk.getDesk();
    assert.ok(seeded.cases.length > 0 && seeded.reviews.length > 0);

    const c = desk.submitHandoff({
      customer: PERSONAS.priya.customer, riskProfile: 'Balanced', brief: ['Health score 61/100'], topic: 'Wants a human review',
    });
    assert.equal(desk.getDesk().cases[0].id, c.id);
    assert.equal(c.status, 'NEW');
    assert.equal(c.consent.contact, true);

    desk.acceptCase(c.id);
    desk.scheduleCase(c.id, { when: '2026-10-05T10:30:00+05:30', channel: 'Video call' });
    assert.equal(desk.getCase(c.id).status, 'SCHEDULED');
    assert.match(desk.getCase(c.id).customerMessage, /video call/);
    desk.closeCase(c.id, { outcome: 'Advice given', message: 'Summary sent.' });
    assert.equal(desk.getCase(c.id).customerMessage, 'Summary sent.');

    assert.equal(desk.needsHumanReview({ customer: { age: 30 }, type: 'sip', amount: 10000 }), null);
    assert.ok(desk.needsHumanReview({ customer: { age: 30 }, type: 'sip', amount: 30000 }));
    assert.ok(desk.needsHumanReview({ customer: { age: 65 }, type: 'sip', amount: 5000 }));

    const pending = desk.getDesk().reviews.find((r) => r.status === 'PENDING');
    desk.decideReview(pending.id, { status: 'REJECTED', comment: 'Protection first' });
    assert.equal(desk.getDesk().reviews.find((r) => r.id === pending.id).status, 'REJECTED');

    assert.equal(desk.verifyAuditChain().valid, true);
    const tampered = structuredClone(desk.getDesk().audit);
    tampered[2].detail = 'edited';
    assert.equal(desk.verifyAuditChain(tampered).valid, false);
  } finally {
    delete globalThis.localStorage;
  }
});
