import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };

const { BOOK } = await import('../src/data/rmBook.js');
const { customerInsights } = await import('../src/engine/rmInsights.js');
const { getDesk } = await import('../src/engine/rmDesk.js');
const { buildRmFactSheet, composeRmAnswer } = await import('../src/engine/rmCopilot.js');

const book = BOOK.map((persona) => ({ persona, ins: customerInsights(persona, persona.riskProfile) }));
const desk = getDesk();
const fake = (payload) => async () => ({ content: JSON.stringify(payload), reasoning: '' });

test('the RM fact sheet carries the desk and every customer in the book', () => {
  const facts = buildRmFactSheet({ book, desk });
  for (const c of desk.cases.filter((x) => x.status !== 'CLOSED')) assert.ok(facts.includes(c.id), c.id);
  for (const r of desk.reviews.filter((x) => x.status === 'PENDING')) assert.ok(facts.includes(r.id), r.id);
  for (const { persona } of book) assert.ok(facts.includes(persona.customer.id), persona.customer.name);
  assert.match(facts, /SIP of ₹25,000\/month or more/);
  assert.match(facts, /Talking points: /);
});

test('the copilot keeps a grounded reply and only links to things that exist', async () => {
  const caseId = desk.cases.find((c) => c.status !== 'CLOSED').id;
  const ok = await composeRmAnswer({ text: 'Who first?', book, desk, completeFn: fake({ reply: `Call them first about ${caseId}.`, open: { type: 'case', id: caseId }, followups: ['Prep the call'] }) });
  assert.equal(ok.response.text, `Call them first about ${caseId}.`);
  assert.deepEqual(ok.response.open, { type: 'case', id: caseId });
  assert.deepEqual(ok.response.followups, ['Prep the call']);

  const ghost = await composeRmAnswer({ text: 'x', book, desk, completeFn: fake({ reply: 'See the case.', open: { type: 'case', id: 'HND-9999' } }) });
  assert.equal(ghost.response.open, null, 'a case that does not exist is not linked');
  const view = await composeRmAnswer({ text: 'x', book, desk, completeFn: fake({ reply: 'Open sign-offs.', open: { type: 'view', id: 'reviews' } }) });
  assert.deepEqual(view.response.open, { type: 'view', id: 'reviews' });

  const invented = await composeRmAnswer({ text: 'How much?', book, desk, completeFn: fake({ reply: 'Rohan can invest ₹7,77,777 more.', open: null }) });
  assert.match(invented.rejected, /figures not in facts/);
  const claim = await composeRmAnswer({ text: 'Status?', book, desk, completeFn: fake({ reply: 'The SIP will definitely double his money.', open: null }) });
  assert.match(claim.rejected, /Guaranteed-return/);
});
