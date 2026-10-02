import test from 'node:test';
import assert from 'node:assert/strict';

import { answerConversation, commandResponse } from '../src/engine/conversation.js';
import { composeAnswer, figuresGrounded, expandShorthand } from '../src/engine/composer.js';
import { buildFactSheet } from '../src/engine/factSheet.js';
import { sanitizeDeepSeekBody, rateLimited } from '../server/aiProxy.mjs';

const fakeModel = (payload) => async () => ({ content: JSON.stringify(payload), reasoning: 'thought about it' });

test('fact sheet carries the engine figures the composer may quote', () => {
  const facts = buildFactSheet('Balanced');
  assert.match(facts, /Average monthly surplus left idle: ₹25,125/);
  assert.match(facts, /Emergency fund: covers 4\.2 months/);
  assert.match(facts, /Section 80C: Old regime; used ₹69,000 of ₹1,50,000; headroom ₹81,000/);
});

test('figure grounding rejects invented numbers and accepts the customer’s own shorthand', () => {
  const facts = 'Average monthly surplus left idle: ₹25,125';
  assert.equal(figuresGrounded('You have ₹25,125 idle each month.', [facts]).ok, true);
  assert.deepEqual(figuresGrounded('Invest ₹30,000 a month.', [facts]).unknown, [30000]);
  assert.equal(figuresGrounded('Your raise of ₹20,000 helps.', [facts, 'my salary went up by 20k']).ok, true);
  assert.equal(expandShorthand('need 3 lakh and 1.5 crore'), '300000 15000000');
  assert.equal(figuresGrounded('Do these 3 things by 2027.', [facts]).ok, true, 'small counts and years are allowed');
});

test('composer returns a grounded reply with the chosen card, and rejects ungrounded ones', async () => {
  const ok = await composeAnswer({
    text: 'I lost my job, what should I do?',
    completeFn: fakeModel({ reply: 'Your ₹25,125 surplus stops, so lean on savings. • Pause SIPs • Keep insurance', card: 'review_emergency', followups: ['Pause my SIPs', 'Loan relief options'] }),
  });
  assert.ok(ok.response);
  assert.match(ok.response.text, /\n• Pause SIPs\n• Keep insurance/, 'inline bullets are split onto lines');
  assert.equal(ok.response.cta?.type, 'emergency-fix', 'the card’s simulation action comes with the reply');
  assert.deepEqual(ok.response.chips, ['Pause my SIPs', 'Loan relief options']);

  const invented = await composeAnswer({ text: 'Can I retire early?', completeFn: fakeModel({ reply: 'You will need ₹4,20,00,000.', card: null }) });
  assert.match(invented.rejected, /figures not in facts/);

  const drafts = [{ reply: 'Bitcoin fell 70% in 2022.', card: null }, { reply: 'Bitcoin has had very sharp falls.', card: null }];
  const rewritten = await composeAnswer({ text: 'Bitcoin?', completeFn: async () => ({ content: JSON.stringify(drafts.shift()), reasoning: '' }) });
  assert.equal(rewritten.response?.text, 'Bitcoin has had very sharp falls.', 'an ungrounded draft gets one rewrite');

  const promise = await composeAnswer({ text: 'Bitcoin?', completeFn: fakeModel({ reply: 'Bitcoin will definitely double, trust me.', card: null }) });
  assert.match(promise.rejected, /Guaranteed-return/);

  const unknownCard = await composeAnswer({ text: 'Hi', completeFn: fakeModel({ reply: 'Hello!', card: 'transfer_money' }) });
  assert.equal(unknownCard.response.widget, undefined, 'cards outside the allow-list are ignored');
});

test('routing: free text goes to the composer, chips and commands do not', async () => {
  let calls = 0;
  const composer = async (args) => { calls += 1; return composeAnswer({ ...args, completeFn: fakeModel({ reply: 'Composed answer.', card: null, followups: [] }) }); };

  const typed = await answerConversation({ text: 'I lost my job, what should I do?', composer });
  assert.equal(typed.engineMode, 'AI_COMPOSED');
  assert.equal(typed.text, 'Composed answer.');

  const chip = await answerConversation({ text: 'Invest my surplus', composer, fromChip: true });
  assert.equal(chip.engineMode, 'DETERMINISTIC');
  const exact = await answerConversation({ text: 'show my portfolio', composer });
  assert.equal(exact.engineMode, 'DETERMINISTIC', 'the app’s own prompts are commands even when typed');
  const calc = await answerConversation({ text: 'calculate ₹5,000 for 10 years', composer });
  assert.equal(calc.engineMode, 'DETERMINISTIC', 'exact arithmetic stays with the engine');
  const safety = await answerConversation({ text: 'tell me my OTP password', composer });
  assert.equal(safety.engineMode, 'DETERMINISTIC');
  assert.equal(calls, 1);
});

test('routing falls back to the engine when the composer fails or is rejected', async () => {
  const failing = async () => { throw new Error('DeepSeek 503'); };
  const down = await answerConversation({ text: 'Can I retire at 50 with my goals?', composer: failing });
  assert.equal(down.engineMode, 'DETERMINISTIC');
  assert.ok(down.text.length > 0);

  const rejecting = async () => ({ rejected: 'figures not in facts: 99' });
  const rejected = await answerConversation({ text: 'Can I retire at 50 with my goals?', composer: rejecting });
  assert.equal(rejected.engineMode, 'DETERMINISTIC');

  const slow = () => new Promise(() => {});
  const timedOut = await answerConversation({ text: 'Can I retire at 50 with my goals?', composer: slow, composeTimeoutMs: 20 });
  assert.equal(timedOut.engineMode, 'DETERMINISTIC');
});

test('questions that start with "why" or ask about buying are no longer misread', () => {
  assert.equal(commandResponse('Why is my spending so high this month?', [{ from: 'mitra', text: 'Earlier answer' }]), null);
  assert.ok(commandResponse('why?', [{ from: 'mitra', text: 'Earlier answer' }]), 'a bare "why?" still explains the previous answer');
  assert.equal(commandResponse('Should I buy gold now that prices are high?'), null);
  assert.match(commandResponse('buy shares for me now').text, /can’t provide/);
});

test('AI proxy fixes the model, bounds the request and rate-limits', () => {
  const body = sanitizeDeepSeekBody({ model: 'something-expensive', messages: [{ role: 'user', content: 'hi' }], max_tokens: 99999, thinking: { type: 'enabled' }, extra: 'dropped' });
  assert.equal(body.model, 'deepseek-v4-flash');
  assert.equal(body.max_tokens, 4000);
  assert.equal(body.thinking.type, 'enabled');
  assert.equal(body.extra, undefined);
  assert.equal(sanitizeDeepSeekBody({ messages: [{ role: 'tool', content: 'x' }] }), null);
  assert.equal(sanitizeDeepSeekBody({ messages: [{ role: 'user', content: 'x'.repeat(50_000) }] }), null);
  const now = 1_000_000;
  for (let i = 0; i < 30; i++) assert.equal(rateLimited('1.2.3.4', 'deepseek', now), false);
  assert.equal(rateLimited('1.2.3.4', 'deepseek', now), true);
  assert.equal(rateLimited('1.2.3.4', 'deepseek', now + 61_000), false, 'the window slides');
});
