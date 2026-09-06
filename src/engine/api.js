const emptyBoot = () => ({ available: false, session: null, profile: null, onboarded: false, riskProfile: null, appState: null, chat: [], xp: null });
let boot = emptyBoot();
let stateWriteQueue = Promise.resolve();
const CUSTOMER_KEYS = ['mitra_session', 'mitra_onboarded', 'mitra_risk_profile', 'mitra_custom_persona', 'mitra_persona', 'mitra_chat_history', 'mitra_applied_state', 'mitra_xp', 'mitra_xp_awarded'];

function clearCustomerCache() {
  try {
    const demoPersona = localStorage.getItem('mitra_persona');
    CUSTOMER_KEYS.forEach((key) => localStorage.removeItem(key));
    if (['priya', 'arjun'].includes(demoPersona)) localStorage.setItem('mitra_persona', demoPersona);
  } catch { /* storage unavailable */ }
}

async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    signal: AbortSignal.timeout(10000),
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('MITRA API is unavailable. Start the API server and try again.');
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || data.title || `Request failed (${response.status})`);
  return data;
}

export async function initializeApi() {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1') {
    clearCustomerCache();
    boot = emptyBoot();
    return boot;
  }
  try {
    boot = await request('/bootstrap');
    clearCustomerCache();
  }
  catch { boot = emptyBoot(); clearCustomerCache(); }
  return boot;
}

export const getBootstrap = () => boot;
export const setBootstrapSession = (session) => { boot = { ...emptyBoot(), session, available: true }; };

export async function apiSignUp(input) {
  const result = await request('/auth/signup', { method: 'POST', body: JSON.stringify(input) });
  clearCustomerCache();
  boot = await request('/bootstrap');
  return result;
}

export async function apiLogIn(input) {
  const result = await request('/auth/login', { method: 'POST', body: JSON.stringify(input) });
  clearCustomerCache();
  boot = await request('/bootstrap');
  return result;
}

export async function apiLogOut() {
  await request('/auth/logout', { method: 'POST' });
  boot = emptyBoot();
  clearCustomerCache();
}
export const analyseStatements = (input) => request('/statements/analyse', { method: 'POST', body: JSON.stringify(input) });
export const connectSandbox = (providerId) => request('/sandbox/connect', { method: 'POST', body: JSON.stringify({ providerId }) });
export const saveServerProfile = (input) => request('/profile', { method: 'PUT', body: JSON.stringify(input) });
export const saveOnboarding = (riskProfile, onboarded = true) => {
  boot = { ...boot, riskProfile, onboarded };
  return boot.session ? request('/onboarding', { method: 'PUT', body: JSON.stringify({ riskProfile, onboarded }) }) : Promise.resolve();
};
export const saveServerState = (input) => {
  const { kind, ...state } = input;
  boot = { ...boot, ...state };
  if (!boot.session) return Promise.resolve();
  const owner = boot.session.id;
  const payload = JSON.stringify(input);
  const operation = stateWriteQueue.then(async () => {
    if (boot.session?.id !== owner) return;
    try {
      const result = await request('/state', { method: 'PUT', body: payload });
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('mitra-sync', { detail: { ok: true } }));
      return result;
    } catch (error) {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('mitra-sync', { detail: { ok: false } }));
      throw error;
    }
  });
  stateWriteQueue = operation.catch(() => {});
  return operation;
};
export const createAdviceReceipt = (passport) => request('/advice/receipts', { method: 'POST', body: JSON.stringify(passport) });
export const listAdviceReceipts = () => request('/advice/receipts');
