// ─────────────────────────────────────────────────────────────
// Browser-facing session adapter. Authentication is handled by the local
// MITRA API with scrypt password hashes and an HttpOnly session cookie.
// ─────────────────────────────────────────────────────────────
import { apiLogIn, apiLogOut, apiSignUp, getBootstrap, saveOnboarding } from './api.js';

const SESSION_KEY = 'mitra_session';
const ONBOARDED_KEY = 'mitra_onboarded';

export function getSession() {
  return getBootstrap().session;
}

export async function signUp({ name, email, password }) {
  try {
    const { session } = await apiSignUp({ name, email, password });
    return { ok: true, session };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export async function logIn({ email, password }) {
  try {
    const { session } = await apiLogIn({ email, password });
    return { ok: true, session };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export async function logOut() {
  await apiLogOut();
  localStorage.removeItem(SESSION_KEY);
}

export const isOnboarded = () => getBootstrap().session ? getBootstrap().onboarded : localStorage.getItem(ONBOARDED_KEY) === '1';
export const markOnboarded = () => {
  localStorage.setItem(ONBOARDED_KEY, '1');
  void saveOnboarding(getStoredRiskProfile(), true).catch(() => {});
};
export const resetOnboarded = () => localStorage.removeItem(ONBOARDED_KEY);

const RISK_KEY = 'mitra_risk_profile';
export const getStoredRiskProfile = () => localStorage.getItem(RISK_KEY) || getBootstrap().riskProfile || null;
export const setStoredRiskProfile = (profile) => {
  localStorage.setItem(RISK_KEY, profile);
  void saveOnboarding(profile, isOnboarded()).catch(() => {});
};
export const resetRiskProfile = () => localStorage.removeItem(RISK_KEY);
