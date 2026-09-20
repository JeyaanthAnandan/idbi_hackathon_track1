import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApi, apiLogIn, getBootstrap, saveServerState } from '../src/engine/api.js';
import { loadChatHistory } from '../src/engine/chatHistory.js';
import { getSession, logOut, isOnboarded, getStoredRiskProfile } from '../src/engine/auth.js';

test('client auth refreshes profile and empty history never revives another account', async () => {
  const oldFetch = globalThis.fetch;
  const memory = new Map([['mitra_session', '{"name":"Old customer"}'], ['mitra_chat_history', '[{"from":"user","text":"Old private chat"}]'], ['mitra_risk_profile', 'Aggressive'], ['mitra_onboarded', '1']]);
  globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: (key) => memory.delete(key) };
  let signedIn = false;
  const session = { id: 'b', name: 'Customer B' };
  globalThis.fetch = async (url) => {
    let value = {};
    if (url.endsWith('/auth/login')) { signedIn = true; value = { session }; }
    if (url.endsWith('/auth/logout')) signedIn = false;
    if (url.endsWith('/bootstrap')) value = { available: true, session: signedIn ? session : null, profile: signedIn ? { persona: { customer: { name: 'Customer B' } } } : null, onboarded: false, riskProfile: 'Conservative', chat: [], xp: { total: 0, awarded: [] } };
    return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
  };
  try {
    await initializeApi();
    assert.equal(getSession(), null);
    await apiLogIn({ email: 'b@example.test', password: 'fake-test' });
    assert.equal(getBootstrap().profile.persona.customer.name, 'Customer B');
    assert.equal(isOnboarded(), false);
    assert.equal(getStoredRiskProfile(), 'Conservative');
    assert.deepEqual(loadChatHistory(), []);
    await saveServerState({ kind: 'chat', chat: [{ from: 'user', text: 'New context' }] });
    assert.equal(loadChatHistory()[0].text, 'New context');
    await saveServerState({ kind: 'chat', chat: [] });
    assert.deepEqual(loadChatHistory(), []);
    await logOut();
    assert.equal(getSession(), null);
    assert.equal(getBootstrap().profile, null);
    assert.equal(memory.has('mitra_chat_history'), false);
    globalThis.fetch = async () => { throw new Error('offline'); };
    await initializeApi();
    assert.equal(getSession(), null);
    assert.equal(getBootstrap().available, false);
  } finally { globalThis.fetch = oldFetch; delete globalThis.localStorage; }
});
