// ─────────────────────────────────────────────────────────────
// Client-side auth for the prototype — no backend, so accounts and the
// active session live in localStorage. In a real IDBI build this whole
// module is replaced by the bank's identity/KYC service; nothing here
// (plain-text password storage) should be treated as secure.
// ─────────────────────────────────────────────────────────────
const USERS_KEY = 'mitra_users';
const SESSION_KEY = 'mitra_session';
const ONBOARDED_KEY = 'mitra_onboarded';

function loadUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

export function signUp({ name, email, password }) {
  const key = email.trim().toLowerCase();
  const users = loadUsers();
  if (users[key]) {
    return { ok: false, error: 'An account with this email already exists — try logging in instead.' };
  }
  users[key] = { name: name.trim(), email: key, password };
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  const session = { name: name.trim(), email: key };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { ok: true, session };
}

export function logIn({ email, password }) {
  const key = email.trim().toLowerCase();
  const user = loadUsers()[key];
  if (!user || user.password !== password) {
    return { ok: false, error: 'Incorrect email or password.' };
  }
  const session = { name: user.name, email: user.email };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { ok: true, session };
}

export function logOut() {
  localStorage.removeItem(SESSION_KEY);
}

export const isOnboarded = () => localStorage.getItem(ONBOARDED_KEY) === '1';
export const markOnboarded = () => localStorage.setItem(ONBOARDED_KEY, '1');
export const resetOnboarded = () => localStorage.removeItem(ONBOARDED_KEY);

const RISK_KEY = 'mitra_risk_profile';
export const getStoredRiskProfile = () => localStorage.getItem(RISK_KEY) || null;
export const setStoredRiskProfile = (profile) => localStorage.setItem(RISK_KEY, profile);
export const resetRiskProfile = () => localStorage.removeItem(RISK_KEY);
