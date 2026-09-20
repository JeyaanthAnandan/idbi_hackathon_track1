import http from 'node:http';
import { parseBankStatementCSV, parseHoldingsCSV } from '../src/engine/statementImport.js';
import { buildCustomPersona } from '../src/engine/personaBuilder.js';
import { validPersona, validRisk, validState } from './validation.mjs';
import { issueAdviceReceipt, normalizeAdvicePassport, verifyAdviceReceiptChain } from './adviceReceipts.mjs';
import { fetchIdbiConsentSnapshot, fetchIdbiDirectSnapshot, idbiEnabled, requestIdbiConsent } from './idbi.mjs';
import {
  audit, hashPassword, newId, newToken, passwordMatches, publicSession,
  readStore, tokenHash, updateStore,
} from './store.mjs';

const PORT = Number(process.env.MITRA_API_PORT || 8787);
const COOKIE = 'mitra_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_APP_STATE = { actions: [], rules: { salary: true, sweep: false, dining: false, stepup: false } };

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function problem(res, status, title, detail = title) {
  json(res, status, { type: 'about:blank', title, status, detail });
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 6_000_000) throw Object.assign(new Error('Request is too large'), { status: 413 });
  }
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid body');
    return value;
  }
  catch { throw Object.assign(new Error('Request body must be valid JSON'), { status: 400 }); }
}

function cookies(req) {
  try { return Object.fromEntries((req.headers.cookie || '').split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter(([key]) => key)); }
  catch { return {}; }
}

async function currentUser(req) {
  const token = cookies(req)[COOKIE];
  if (!token) return null;
  return readStore((db) => {
    const session = db.sessions[tokenHash(token)];
    if (!session || Date.parse(session.expiresAt) <= Date.now()) return null;
    return db.users[session.userId] || null;
  });
}

function sessionCookie(token, maxAge = Math.floor(SESSION_MS / 1000)) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}

function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }

async function createSession(db, user, res) {
  const token = newToken();
  db.sessions[tokenHash(token)] = { userId: user.id, expiresAt: new Date(Date.now() + SESSION_MS).toISOString() };
  res.setHeader('set-cookie', sessionCookie(token));
}

function bootstrap(user) {
  return {
    available: true,
    connectors: { idbi: { enabled: idbiEnabled(), mode: 'SANDBOX' } },
    session: user ? publicSession(user) : null,
    profile: user?.profile || null,
    onboarded: Boolean(user?.onboarded),
    riskProfile: user?.riskProfile || null,
    appState: user?.appState || DEFAULT_APP_STATE,
    chat: user?.chat || [],
    xp: user?.xp || { total: 0, awarded: [] },
  };
}

// A reproducible sandbox fixture proves the consent -> provider -> profile API
// boundary without impersonating a licensed Account Aggregator connection.
async function sandboxProviderData(providerId) {
  if (providerId === 'bank' && idbiEnabled()) return fetchIdbiDirectSnapshot();
  if (providerId === 'bank') {
    const csv = [
      'date,description,amount,type',
      '2026-06-01,Salary Credit,95000,credit', '2026-06-03,Rent - Landlord NEFT,28000,debit',
      '2026-06-08,BigBasket,6200,debit', '2026-06-14,Netflix,649,debit', '2026-06-20,SIP Mutual Fund,8000,debit',
      '2026-07-01,Salary Credit,95000,credit', '2026-07-03,Rent - Landlord NEFT,28000,debit',
      '2026-07-08,BigBasket,5900,debit', '2026-07-14,Netflix,649,debit', '2026-07-20,SIP Mutual Fund,8000,debit',
      '2026-08-01,Salary Credit,95000,credit', '2026-08-03,Rent - Landlord NEFT,28000,debit',
      '2026-08-08,BigBasket,6500,debit', '2026-08-14,Netflix,649,debit', '2026-08-20,SIP Mutual Fund,8000,debit',
    ].join('\n');
    return { transactions: parseBankStatementCSV(csv) };
  }
  const fixtures = {
    zerodha: [{ type: 'Mutual Fund', label: 'Nifty 50 Index Fund', value: 86400, cost: 58000, growth: 12.4, liquid: true }],
    upstox: [{ type: 'Stocks', label: 'HDFC Bank Ltd', value: 62000, cost: 49000, growth: 13.1, liquid: true }],
    groww: [{ type: 'Mutual Fund', label: 'ELSS Tax Saver Fund', value: 45000, cost: 26000, growth: 14.2, liquid: false }],
    indmoney: [{ type: 'Fixed Deposit', label: 'IDBI FD', value: 200000, cost: 200000, growth: 7.1, liquid: false }],
  };
  return { holdings: fixtures[providerId] || [] };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { status: 'ok', service: 'mitra-api' });

    if (req.method === 'GET' && url.pathname === '/api/bootstrap') return json(res, 200, bootstrap(await currentUser(req)));

    if (req.method === 'POST' && url.pathname === '/api/auth/signup') {
      const input = await body(req);
      const email = normalizeEmail(input.email);
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120 || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email) || typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 256) {
        return problem(res, 422, 'Invalid account details', 'Use a name, valid email, and a password of at least 8 characters.');
      }
      const result = await updateStore(async (db) => {
        if (Object.values(db.users).some((u) => u.email === email)) return null;
        const credentials = hashPassword(input.password);
        const user = { id: newId('usr'), name: input.name.trim(), email, passwordSalt: credentials.salt, passwordHash: credentials.hash, createdAt: new Date().toISOString(), onboarded: false, riskProfile: null, profile: null, appState: structuredClone(DEFAULT_APP_STATE), chat: [], xp: { total: 0, awarded: [] } };
        db.users[user.id] = user;
        await createSession(db, user, res);
        audit(db, user.id, 'auth.signup');
        return publicSession(user);
      });
      if (!result) return problem(res, 409, 'Account already exists');
      return json(res, 201, { session: result });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const input = await body(req);
      const email = normalizeEmail(input.email);
      if (typeof input.password !== 'string' || input.password.length > 256) return problem(res, 422, 'Invalid login details');
      const result = await updateStore(async (db) => {
        const user = Object.values(db.users).find((u) => u.email === email);
        if (!user || !passwordMatches(String(input.password || ''), user)) return null;
        await createSession(db, user, res);
        audit(db, user.id, 'auth.login');
        return publicSession(user);
      });
      if (!result) return problem(res, 401, 'Incorrect email or password');
      return json(res, 200, { session: result });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      const token = cookies(req)[COOKIE];
      if (token) await updateStore((db) => { delete db.sessions[tokenHash(token)]; });
      res.setHeader('set-cookie', sessionCookie('', 0));
      return json(res, 200, { ok: true });
    }

    const user = await currentUser(req);
    if (!user) return problem(res, 401, 'Authentication required');

    if (req.method === 'POST' && url.pathname === '/api/statements/analyse') {
      const input = await body(req);
      if (input.bankName && !/\.csv$/i.test(input.bankName)) return problem(res, 415, 'PDF extraction is not configured', 'Upload a CSV statement for this local prototype.');
      if (input.holdingsName && !/\.csv$/i.test(input.holdingsName)) return problem(res, 415, 'Only holdings CSV is supported');
      if ([input.bankText, input.holdingsText].some((v) => v !== undefined && typeof v !== 'string')) return problem(res, 422, 'Statement content must be text');
      const transactions = input.bankText ? parseBankStatementCSV(input.bankText) : [];
      const holdings = input.holdingsText ? parseHoldingsCSV(input.holdingsText) : [];
      if (!transactions.length && !holdings.length) return problem(res, 422, 'No valid rows found', 'Check the CSV columns, dates and amounts. No customer profile has been created.');
      await updateStore((db) => audit(db, user.id, 'statement.analysed', { transactions: transactions.length, holdings: holdings.length, files: [input.bankName, input.holdingsName].filter(Boolean) }));
      return json(res, 200, { transactions, holdings, rejected: { bank: input.bankText ? Math.max(input.bankText.trim().split(/\r?\n/).length - 1 - transactions.length, 0) : 0, holdings: input.holdingsText ? Math.max(input.holdingsText.trim().split(/\r?\n/).length - 1 - holdings.length, 0) : 0 } });
    }

    if (req.method === 'POST' && url.pathname === '/api/sandbox/connect') {
      const input = await body(req);
      const allowed = new Set(['bank', 'zerodha', 'upstox', 'groww', 'indmoney']);
      if (!allowed.has(input.providerId)) return problem(res, 422, 'Unknown sandbox provider');
      const data = await sandboxProviderData(input.providerId);
      await updateStore((db) => audit(db, user.id, 'sandbox.connected', { providerId: input.providerId }));
      const live = input.providerId === 'bank' && idbiEnabled();
      return json(res, 200, {
        ...data,
        mode: data.mode || 'SANDBOX_FIXTURE',
        providerId: input.providerId,
        ...(live ? {} : { consentId: newId('cns'), dataAsOf: '2026-08-28' }),
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/idbi/consent/request') {
      if (!idbiEnabled()) return problem(res, 409, 'IDBI sandbox mode is disabled', 'Set IDBI_LIVE_SANDBOX=true on the server.');
      const input = await body(req);
      const consent = await requestIdbiConsent();
      await updateStore((db) => {
        db.users[user.id].idbiConsentHandle = consent.consentHandle;
        audit(db, user.id, 'idbi.consent.requested', { consentHandle: consent.consentHandle, status: consent.status });
      });
      return json(res, 201, consent);
    }

    if (req.method === 'POST' && url.pathname === '/api/idbi/snapshot') {
      if (!idbiEnabled()) return problem(res, 409, 'IDBI sandbox connection is disabled', 'The server must enable the IDBI sandbox connector. No local fixture was substituted.');
      const snapshot = await fetchIdbiDirectSnapshot();
      snapshot.fetchedAt = new Date().toISOString();
      await updateStore((db) => audit(db, user.id, 'idbi.snapshot.fetched', { transactionCount: snapshot.transactions.length, dataAsOf: snapshot.dataAsOf }));
      return json(res, 200, snapshot);
    }

    if (req.method === 'POST' && url.pathname === '/api/idbi/consent/snapshot') {
      if (!idbiEnabled()) return problem(res, 409, 'IDBI sandbox mode is disabled', 'Set IDBI_LIVE_SANDBOX=true on the server.');
      const input = await body(req);
      if (!user.idbiConsentHandle || (input.consentHandle && input.consentHandle !== user.idbiConsentHandle)) return problem(res, 409, 'Start a consent request for this session before fetching data.');
      const snapshot = await fetchIdbiConsentSnapshot({ consentHandle: user.idbiConsentHandle });
      await updateStore((db) => audit(db, user.id, 'idbi.consent.snapshot', { consentId: snapshot.consent.consentId, transactionCount: snapshot.transactions.length }));
      return json(res, 200, snapshot);
    }

    if (req.method === 'PUT' && url.pathname === '/api/profile') {
      const input = await body(req);
      if (!validPersona(input.persona) || !validRisk(input.riskProfile)) return problem(res, 422, 'Invalid profile');
      await updateStore((db) => {
        const target = db.users[user.id];
        target.profile = { persona: input.persona, sources: input.sources || [], savedAt: new Date().toISOString() };
        target.riskProfile = input.riskProfile;
        target.onboarded = true;
        target.chat = [];
        target.appState = structuredClone(DEFAULT_APP_STATE);
        target.xp = { total: 0, awarded: [] };
        audit(db, user.id, 'profile.saved', { sources: input.sources || [] });
      });
      return json(res, 200, { ok: true });
    }

    if (req.method === 'PUT' && url.pathname === '/api/onboarding') {
      const input = await body(req);
      if (!validRisk(input.riskProfile) || typeof input.onboarded !== 'boolean') return problem(res, 422, 'Invalid onboarding details');
      await updateStore((db) => { const target = db.users[user.id]; target.onboarded = Boolean(input.onboarded); target.riskProfile = input.riskProfile || target.riskProfile; audit(db, user.id, 'onboarding.updated', { onboarded: target.onboarded, riskProfile: target.riskProfile }); });
      return json(res, 200, { ok: true });
    }

    if (req.method === 'PUT' && url.pathname === '/api/state') {
      const input = await body(req);
      if (!validState(input)) return problem(res, 422, 'Invalid application state');
      await updateStore((db) => {
        const target = db.users[user.id];
        if (input.appState) target.appState = input.appState;
        if (Array.isArray(input.chat)) target.chat = input.chat.slice(-40);
        if (input.xp) target.xp = input.xp;
        audit(db, user.id, 'state.updated', { kind: input.kind || 'unknown' });
      });
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/advice/receipts') {
      const passport = normalizeAdvicePassport(await body(req));
      if (!passport) return problem(res, 422, 'Invalid Advice Passport');
      const receipt = await updateStore((db) => {
        const item = issueAdviceReceipt(db, user.id, passport);
        const { receiptHash } = item;
        audit(db, user.id, 'advice.receipt.issued', { receiptId: item.id, receiptHash, policyVersion: item.policyVersion });
        return item;
      });
      return json(res, 201, { receipt });
    }

    if (req.method === 'GET' && url.pathname === '/api/advice/receipts') {
      const result = await readStore((db) => {
        const all = db.adviceReceipts || [];
        return {
          chainValid: verifyAdviceReceiptChain(all, user.id),
          items: all.filter((item) => item.userId === user.id).slice(-100).reverse(),
        };
      });
      return json(res, 200, result);
    }

    if (req.method === 'GET' && url.pathname === '/api/audit') {
      return json(res, 200, { items: await readStore((db) => db.audit.filter((item) => item.userId === user.id).slice(-100).reverse()) });
    }

    return problem(res, 404, 'Not found');
  } catch (error) {
    console.error(error);
    return problem(res, error.status || 500, error.status ? error.message : 'Internal server error');
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`MITRA API listening on http://127.0.0.1:${server.address().port}`));
