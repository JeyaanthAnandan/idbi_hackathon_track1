import test from 'node:test';
import assert from 'node:assert/strict';
import { availableTargets, validateDirection, fallbackDirection, planAvatarDirection, DIRECTOR_PROMPT } from '../src/engine/avatarDirector.js';
import { callSceneForWidget, callChartTargets } from '../src/engine/presenter.js';

const choice = (...steps) => ({ name: 'guide_ui', arguments: { steps } });
test('director permits only supported actions on targets that exist on this surface', () => {
  const context = { surface: 'call', hasChart: true, chartTargets: [{ id: 'call-bar-growth', label: 'Projected growth' }] };
  const steps = [{ action: 'open_chart', target: 'call-chart' }, { action: 'point', target: 'call-bar-growth' }, { action: 'gesture', target: 'thumbs-up' }];
  assert.deepEqual(validateDirection(choice(...steps), context), steps);
  for (const step of [
    { action: 'navigate', target: 'wealth-allocation' },
    { action: 'point', target: '#bank-transfer' },
    { action: 'point', target: 'call-bar-missing' },
    { action: 'open_chart', target: 'call-bar-growth' },
    { action: 'point', target: 'call-chart', selector: 'body' },
    { action: 'transfer', target: 'call-chart' },
  ]) assert.equal(validateDirection(choice(step), context), null);
  assert.equal(validateDirection(choice({ action: 'open_chart', target: 'call-chart' }), { surface: 'call' }), null);
  assert.equal(validateDirection(choice(...Array(5).fill(steps[0])), context), null);
  assert.equal(validateDirection(choice(), context), null);
  assert.ok(!availableTargets('call', false, context.chartTargets).includes('call-bar-growth'));
});
test('local guide selects the requested section and can resolve a named bar', () => {
  assert.equal(fallbackDirection({ question: 'Where is my spending?' })[0].target, 'wealth-cashflow');
  assert.equal(fallbackDirection({ question: 'Show future projections' })[0].target, 'simulator-chart');
  assert.equal(fallbackDirection({ surface: 'call', hasChart: false })[0].target, 'call-response');
  assert.equal(fallbackDirection({ surface: 'call', hasChart: true, question: 'Explain Projected growth', chartTargets: [{ id: 'call-bar-growth', label: 'Projected growth' }] })[1].target, 'call-bar-growth');
});
test('model directions use a dedicated system prompt and invalid output falls through', async () => {
  let calls = 0;
  const plan = await planAvatarDirection({ question: 'Show my allocation', surface: 'page', routers: [
    async () => choice({ action: 'navigate', target: 'https://example.com' }),
    async (args) => {
      calls++; assert.equal(args.system, DIRECTOR_PROMPT);
      assert.equal(args.tools[0].function.name, 'guide_ui');
      const input = JSON.parse(args.messages[0].content);
      assert.equal(input.question, 'Show my allocation');
      assert.ok(input.availableTargets.includes('wealth-allocation'));
      return choice({ action: 'navigate', target: 'wealth-allocation' }, { action: 'point', target: 'wealth-allocation' });
    },
  ] });
  assert.equal(calls, 1); assert.equal(plan.source, 'model');
});
test('offline, timed out and cancelled planning always settles without an unsafe action', async () => {
  const context = { question: 'health score', surface: 'page' };
  assert.equal((await planAvatarDirection(context)).source, 'local');
  let providerSignal;
  const timeout = await planAvatarDirection({ ...context, timeoutMs: 15, routers: [({ signal }) => { providerSignal = signal; return new Promise(() => {}); }] });
  assert.equal(timeout.source, 'local'); assert.equal(providerSignal.aborted, true);
  const controller = new AbortController();
  const pending = planAvatarDirection({ ...context, signal: controller.signal, routers: [() => new Promise(() => {})] });
  controller.abort();
  assert.equal((await pending).source, 'local');
  let called = false;
  await planAvatarDirection({ ...context, signal: controller.signal, routers: [() => { called = true; }] });
  assert.equal(called, false);
});
test('call charts preserve the current response scenario and target only rendered bars', () => {
  const widget = { type: 'sip', data: { monthly: 7200, years: 12.5, rate: 8.25, fv: 1900000 } };
  const scene = callSceneForWidget(widget);
  assert.equal(scene.bars[0].value, 7200 * 12.5 * 12);
  assert.equal(scene.bars[2].value, widget.data.fv);
  assert.equal(scene.bars[1].value, widget.data.fv - scene.bars[0].value);
  assert.deepEqual(callChartTargets(widget).map((target) => target.id), scene.bars.map((bar) => `call-bar-${bar.id}`));
  assert.equal(callSceneForWidget({ type: 'goals', data: {} }), null);
  assert.equal(callSceneForWidget({ type: 'sip', data: { monthly: 100, years: 10, rate: 8 } }), null);
  const portfolio = callSceneForWidget({ type: 'allocation', data: {} }, [{ label: 'Fund A', value: 80, cost: 100 }, { label: 'Unknown', value: 100 }]);
  assert.equal(portfolio.bars.length, 1); assert.equal(portfolio.bars[0].value, -20);
});
