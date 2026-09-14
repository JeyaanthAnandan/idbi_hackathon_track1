import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPresenterScene, presenterIntent, presentationForWidget } from '../src/engine/presenter.js';

test('presenter keeps gains, losses and narration tied to recorded holding cost', () => {
  const scene = buildPresenterScene({ topic: 'portfolio', holdings: [
    { label: 'Index fund', value: 15000, cost: 10000 },
    { label: 'Equity fund', value: 8000, cost: 10000 },
    { label: 'Unknown cost', value: 100000 },
    { label: 'Invalid value', value: Infinity, cost: 4000 },
    { label: 'Zero cost', value: 1000, cost: 0 },
  ] });
  assert.deepEqual(scene.bars.map((b) => [b.label, b.value]), [['Index fund', 5000], ['Equity fund', -2000], ['Zero cost', 1000]]);
  assert.equal(scene.stats[2].value, 4000);
  assert.match(scene.note, /2 holding\(s\) excluded/);
  assert.match(scene.steps[2].text, /loss of ₹2,000/);
  assert.equal(scene.steps[2].target, scene.bars[1].id);
});

test('spending explains missing and zero comparison averages without inventing figures', () => {
  const scene = buildPresenterScene({ topic: 'spending', spending: [
    { category: 'Dining', amount: 2000, avg3m: 1500 },
    { category: 'New expense', amount: 500, avg3m: 0 },
    { category: 'Rent', amount: 10000 },
    { category: 'Broken', amount: NaN },
  ] });
  assert.equal(scene.stats[0].value, 12500);
  assert.match(scene.steps[1].text, /₹500 above/);
  assert.match(scene.steps[2].text, /average is ₹0/);
  assert.match(scene.steps[3].text, /not available/);
});

test('projection separates contributions from projected growth using supplied calculation', () => {
  const scene = buildPresenterScene({ topic: 'growth', monthly: 1000, years: 10, rate: 8, series: [{ year: 10, value: 184000 }] });
  assert.deepEqual(scene.bars.map((b) => b.value), [120000, 64000, 184000]);
  assert.match(scene.steps[2].text, /₹64,000/);
  assert.match(scene.note, /not guaranteed/);
  const zero = buildPresenterScene({ topic: 'growth', monthly: 0, years: 1, rate: 0, series: [{ year: 1, value: 0 }] });
  assert.deepEqual(zero.bars.map((b) => b.value), [0, 0, 0]);
});

test('empty portfolios never claim a known zero profit', () => {
  const scene = buildPresenterScene({ topic: 'portfolio', holdings: [{ value: 1000 }] });
  assert.equal(scene.bars.length, 0);
  assert.match(scene.steps[0].text, /not available/);
  assert.ok(scene.stats.every((stat) => stat.text === 'Unavailable'));
});

test('presenter commands support interruption and decline unsupported questions', () => {
  assert.equal(presenterIntent('wait, show spending'), 'pause');
  assert.equal(presenterIntent('show my profits'), 'portfolio');
  assert.equal(presenterIntent('show SIP growth'), 'growth');
  assert.equal(presenterIntent('explain expenses'), 'spending');
  assert.equal(presenterIntent('continue'), 'next');
  assert.equal(presenterIntent('repeat that'), 'repeat');
  assert.equal(presenterIntent('what is my mortgage interest rate?'), null);
});

test('chat projections preserve their exact scenario when opened in the main UI', () => {
  const request = presentationForWidget({ type: 'sip', data: { monthly: 75000, years: 12.5, rate: 8.25, fv: 1000000 } });
  assert.equal(request.topic, 'growth');
  assert.deepEqual(request.scenario, { monthly: 75000, years: 12.5, rate: 8.25 });
  assert.equal(presentationForWidget({ type: 'sip', data: { monthly: NaN, years: 10, rate: 8 } }), null);
  assert.equal(presentationForWidget({ type: 'sip', data: { monthly: 5000, years: -2, rate: 8 } }), null);
  assert.equal(presentationForWidget({ type: 'goals', data: {} }), null);
});

test('spending walkthrough uses the categories on the selected chat message', () => {
  const categories = [{ category: 'Rent', amount: 17000, avg3m: 16000 }];
  const request = presentationForWidget({ type: 'spending', data: { categories } });
  assert.equal(request.spending, categories);
  assert.equal(request.topic, 'spending');
  assert.equal(presentationForWidget({ type: 'allocation', data: {} }).label, 'Explain investment gains');
});
