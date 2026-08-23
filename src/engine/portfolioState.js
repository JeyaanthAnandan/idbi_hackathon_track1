// ─────────────────────────────────────────────────────────────
// Applied-advice state — makes the "advice → action" loop real.
// Every CTA MITRA offers (Start SIP, Enable Round-Up, Switch to Direct…)
// pushes an action here. The analytics engine reads it back, so accepting
// advice actually moves the surplus, health score, nudges and widgets —
// not just a toast. Money Rules toggles live here too.
// ─────────────────────────────────────────────────────────────
const KEY = 'mitra_applied_state';

const DEFAULT_RULES = { salary: true, sweep: false, dining: false, stepup: false };

// One-shot action types: applying twice has no further effect.
const ONE_SHOT = ['direct-switch', 'subs-cancel', 'emergency-fix'];

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw) return { actions: [], rules: { ...DEFAULT_RULES } };
    return { actions: raw.actions || [], rules: { ...DEFAULT_RULES, ...(raw.rules || {}) } };
  } catch {
    return { actions: [], rules: { ...DEFAULT_RULES } };
  }
}

let state = read();

function persist() {
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent('mitra-applied-state', { detail: state }));
}

export function getAppliedState() {
  return state;
}

// type: 'sip' | 'roundup' | 'direct-switch' | 'harvest' | 'prepay' | 'subs-cancel' | 'protection-fix' | 'emergency-fix'
export function applyAction(type, amount = 0, meta = {}) {
  if (ONE_SHOT.includes(type) && state.actions.some((a) => a.type === type)) return state;
  state = { ...state, actions: [...state.actions, { id: `${type}-${Date.now()}`, type, amount, ...meta }] };
  persist();
  return state;
}

export function hasAction(type, source) {
  return state.actions.some((a) => a.type === type && (source === undefined || a.source === source));
}

export function sumAction(type, source) {
  return state.actions
    .filter((a) => a.type === type && (source === undefined || a.source === source))
    .reduce((s, a) => s + (a.amount || 0), 0);
}

export function toggleRule(id) {
  state = { ...state, rules: { ...state.rules, [id]: !state.rules[id] } };
  persist();
  return state;
}

export function getRules() {
  return state.rules;
}

export function resetApplied() {
  state = { actions: [], rules: { ...DEFAULT_RULES } };
  persist();
}
