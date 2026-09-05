let boot = { available: false, session: null, profile: null, onboarded: false, riskProfile: null, appState: null, chat: [], xp: null };

async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.title || `Request failed (${response.status})`);
  return data;
}

export async function initializeApi() {
  try { boot = await request('/bootstrap'); }
  catch { boot = { ...boot, available: false }; }
  return boot;
}

export const getBootstrap = () => boot;
export const setBootstrapSession = (session) => { boot = { ...boot, session, available: true }; };

export async function apiSignUp(input) {
  const result = await request('/auth/signup', { method: 'POST', body: JSON.stringify(input) });
  setBootstrapSession(result.session);
  return result;
}

export async function apiLogIn(input) {
  const result = await request('/auth/login', { method: 'POST', body: JSON.stringify(input) });
  setBootstrapSession(result.session);
  return result;
}

export async function apiLogOut() { await request('/auth/logout', { method: 'POST' }); boot = { ...boot, session: null }; }
export const analyseStatements = (input) => request('/statements/analyse', { method: 'POST', body: JSON.stringify(input) });
export const connectSandbox = (providerId) => request('/sandbox/connect', { method: 'POST', body: JSON.stringify({ providerId }) });
export const saveServerProfile = (input) => request('/profile', { method: 'PUT', body: JSON.stringify(input) });
export const saveOnboarding = (riskProfile, onboarded = true) => request('/onboarding', { method: 'PUT', body: JSON.stringify({ riskProfile, onboarded }) });
export const saveServerState = (input) => request('/state', { method: 'PUT', body: JSON.stringify(input) });
export const createAdviceReceipt = (passport) => request('/advice/receipts', { method: 'POST', body: JSON.stringify(passport) });
export const listAdviceReceipts = () => request('/advice/receipts');
