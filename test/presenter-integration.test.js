import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('chart explanations render inside the original desktop and phone interfaces', async () => {
  const previous = { window: globalThis.window, localStorage: globalThis.localStorage };
  globalThis.window = { location: { search: '?demo=1&presenter=1' } };
  globalThis.localStorage = { getItem: () => null };
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: WebApp } = await vite.ssrLoadModule('/src/components/WebApp.jsx');
    const desktop = renderToStaticMarkup(React.createElement(WebApp, { riskProfile: 'Balanced', tab: 'home', onTab() {} }));
    assert.match(desktop, /class="web-rail"/);
    assert.match(desktop, /class="web-topbar"/);
    assert.match(desktop, /class="web-chat"/);
    assert.match(desktop, /presenter-integrated/);
    assert.doesNotMatch(desktop, /class="presenter-header"/);
    assert.doesNotMatch(desktop, /presenter-overlay/);

    const { default: AvatarChat } = await vite.ssrLoadModule('/src/components/AvatarChat.jsx');
    const phone = renderToStaticMarkup(React.createElement(AvatarChat, { riskProfile: 'Balanced' }));
    assert.match(phone, /class="chat-header"/);
    assert.match(phone, /presenter-compact/);
    assert.match(phone, /Back to chat/);
    assert.doesNotMatch(phone, /class="chat-input"/); // one composer, owned by the active view

    const { default: PresenterStudio } = await vite.ssrLoadModule('/src/components/PresenterStudio.jsx');
    const scenario = renderToStaticMarkup(React.createElement(PresenterStudio, {
      embedded: true, onClose() {}, initialTopic: 'growth', initialScenario: { monthly: 75000, years: 12.5, rate: 8.25 },
    }));
    assert.match(scenario, /₹75,000/);
    assert.match(scenario, /12.5 years/);
    assert.match(scenario, /8.25%/);
    assert.match(scenario, /max="75000"/);
    assert.match(scenario, /Choose your animated guide" hidden/);

    const { default: FullScreenCall } = await vite.ssrLoadModule('/src/components/FullScreenCall.jsx');
    const fullAnswer = 'A complete answer with multiple paragraphs.\n'.repeat(60) + 'The final sentence stays readable.';
    const call = renderToStaticMarkup(React.createElement(FullScreenCall, {
      messages: [{ id: 1, from: 'user', text: 'Can you explain my SIP?' }, { id: 2, from: 'mitra', text: fullAnswer,
        widget: { type: 'sip', data: { monthly: 7200, years: 12.5, rate: 8.25, fv: 1900000 } } }],
      interim: 'Show my projected growth', secs: 75, voiceOn: true, micLevel: 0,
    }));
    assert.match(call, /aria-modal="true"/);
    assert.ok(call.includes(fullAnswer));
    assert.match(call, /Show my projected growth/);
    assert.match(call, /Can you explain my SIP\?/);
    assert.match(call, /data-guide-target="call-chart"/);
    assert.match(call, /data-guide-target="call-bar-growth"/);
    assert.match(call, /₹7,200/);
    assert.match(call, /01:15/);
    assert.doesNotMatch(call, /class="call-caption"/);

    const { default: MitraCompanion } = await vite.ssrLoadModule('/src/components/MitraCompanion.jsx');
    const pet = renderToStaticMarkup(React.createElement(MitraCompanion, { onNavigate() {}, onAsk() {} }));
    assert.match(pet, /What would you like to do today/);
    assert.match(pet, /Show me around/);
    assert.match(pet, /Choose your companion/);
    assert.equal(renderToStaticMarkup(React.createElement(MitraCompanion, { enabled: false })), '');

    const { default: WealthDashboard } = await vite.ssrLoadModule('/src/components/WealthDashboard.jsx');
    const wealth = renderToStaticMarkup(React.createElement(WealthDashboard, { riskProfile: 'Balanced' }));
    for (const target of ['wealth-allocation', 'wealth-health', 'wealth-cashflow']) assert.ok(wealth.includes(`data-guide-target="${target}"`));
  } finally {
    await vite.close();
    globalThis.window = previous.window;
    globalThis.localStorage = previous.localStorage;
  }
});
