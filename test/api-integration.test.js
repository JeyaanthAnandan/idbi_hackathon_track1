import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildCustomPersona } from '../src/engine/personaBuilder.js';

test('API account, data and persistence journey', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mitra-api-test-'));
  let server, base;
  const start = async () => {
    server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, MITRA_DATA_DIR: dir, MITRA_API_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('API startup timed out')), 5000);
      server.stdout.on('data', (chunk) => { const url = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]; if (url) { clearTimeout(timer); resolve(`${url}/api`); } });
      server.once('error', reject);
    });
  };
  const stop = async () => { const done = once(server, 'exit'); server.kill(); await done; };
  t.after(async () => { if (server?.exitCode === null) await stop(); await rm(dir, { recursive: true }); });
  await start();
  const call = async (route, { method = 'GET', body, cookie } = {}) => {
    const r = await fetch(`${base}${route}`, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0], cookieHeader: r.headers.get('set-cookie') };
  };
  const a = { name: 'Audit Customer A', email: 'AUDIT-A@example.test', password: 'test-password-A-123' };
  let cookieA, cookieB, persona;
  await t.test('unauthenticated access is rejected, invalid signup does not create a user', async () => {
    assert.equal((await call('/state', { method: 'PUT', body: {} })).status, 401);
    assert.equal((await call('/auth/signup', { method: 'POST', body: { ...a, password: 'short' } })).status, 422);
    assert.equal((await call('/auth/signup', { method: 'POST', body: null })).status, 400);
    assert.equal((await call('/auth/signup', { method: 'POST', body: { ...a, name: 123 } })).status, 422);
  });
  await t.test('signup normalizes email, sets HttpOnly cookie and blocks duplicates', async () => {
    const result = await call('/auth/signup', { method: 'POST', body: a });
    assert.equal(result.status, 201);
    assert.equal(result.data.session.email, a.email.toLowerCase());
    assert.match(result.cookieHeader, /HttpOnly/);
    assert.match(result.cookieHeader, /SameSite=Strict/);
    cookieA = result.cookie;
    assert.equal((await call('/auth/signup', { method: 'POST', body: { ...a, email: 'audit-a@example.test' } })).status, 409);
    const boot = (await call('/bootstrap', { cookie: cookieA })).data;
    assert.equal(boot.profile, null); assert.equal(boot.onboarded, false);
    const db = JSON.parse(await readFile(path.join(dir, 'mitra.json'), 'utf8'));
    assert.ok(Object.values(db.users)[0].passwordHash);
    assert.ok(!JSON.stringify(db).includes(a.password));
  });
  await t.test('sandbox data is labelled and import rejects PDF, empty or malformed content', async () => {
    const sandbox = await call('/sandbox/connect', { method: 'POST', cookie: cookieA, body: { providerId: 'bank' } });
    assert.equal(sandbox.data.mode, 'SANDBOX_FIXTURE');
    assert.equal(sandbox.data.transactions.length, 15);
    const common = { method: 'POST', cookie: cookieA };
    assert.equal((await call('/statements/analyse', { ...common, body: { bankName: 'a.pdf' } })).status, 415);
    assert.equal((await call('/statements/analyse', { ...common, body: { bankName: 'a.csv', bankText: 'date,amount\nbad,100' } })).status, 422);
    assert.equal((await call('/statements/analyse', { ...common, body: { bankText: {} } })).status, 422);
    persona = buildCustomPersona({ name: a.name, age: 32, transactions: sandbox.data.transactions, sources: ['sandbox:bank'] }).persona;
    assert.equal(persona.customer.monthlyIncome, 95000);
    assert.equal(persona.monthlySummary[2].spend, 35149);
    assert.equal(persona.monthlySummary[2].invested, 8000);
  });
  await t.test('profile/state validation and customer isolation', async () => {
    assert.equal((await call('/profile', { method: 'PUT', cookie: cookieA, body: { persona: { customer: {}, holdings: [] } } })).status, 422);
    assert.equal((await call('/profile', { method: 'PUT', cookie: cookieA, body: { persona, riskProfile: 'Balanced', sources: ['sandbox:bank'] } })).status, 200);
    assert.equal((await call('/state', { method: 'PUT', cookie: cookieA, body: { chat: [{ from: 'system', text: 'bad' }] } })).status, 422);
    assert.equal((await call('/onboarding', { method: 'PUT', cookie: cookieA, body: { riskProfile: 'Unknown', onboarded: true } })).status, 422);
    await call('/state', { method: 'PUT', cookie: cookieA, body: { chat: [{ from: 'user', text: 'private A context' }], xp: { total: 50, awarded: ['onboarding'] } } });
    const b = await call('/auth/signup', { method: 'POST', body: { name: 'Audit Customer B', email: 'audit-b@example.test', password: 'test-password-B-123' } });
    cookieB = b.cookie;
    const bootB = (await call('/bootstrap', { cookie: cookieB })).data;
    assert.equal(bootB.profile, null); assert.deepEqual(bootB.chat, []); assert.equal(bootB.xp.total, 0);
    assert.ok(!JSON.stringify(bootB).includes('private A context'));
  });
  await t.test('logout invalidates cookie; login restores only that customer', async () => {
    await call('/auth/logout', { method: 'POST', cookie: cookieA });
    assert.equal((await call('/bootstrap', { cookie: cookieA })).data.session, null);
    assert.equal((await call('/auth/login', { method: 'POST', body: { email: a.email, password: 'wrong' } })).status, 401);
    const login = await call('/auth/login', { method: 'POST', body: a });
    assert.equal(login.status, 200); cookieA = login.cookie;
    const boot = (await call('/bootstrap', { cookie: cookieA })).data;
    assert.equal(boot.profile.persona.customer.name, a.name);
    assert.equal(boot.chat[0].text, 'private A context'); assert.equal(boot.xp.total, 50);
    assert.equal((await call('/bootstrap', { cookie: cookieB })).data.profile, null);
  });
  await t.test('server restart preserves accounts, session and context', async () => {
    await stop(); await start();
    const boot = (await call('/bootstrap', { cookie: cookieA })).data;
    assert.equal(boot.session.email, a.email.toLowerCase());
    assert.equal(boot.chat[0].text, 'private A context');
  });
});
