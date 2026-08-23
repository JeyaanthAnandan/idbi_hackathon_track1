// Wealth XP — lightweight gamification. Good financial behaviour earns XP;
// levels give customers a reason to come back (engagement = distribution).
const XP_KEY = 'mitra_xp';
const AWARDED_KEY = 'mitra_xp_awarded';

const LEVELS = [
  { at: 0, title: 'Beginner' },
  { at: 60, title: 'Smart Saver' },
  { at: 150, title: 'Investor' },
  { at: 280, title: 'Strategist' },
  { at: 450, title: 'Wealth Pro' },
];

export const getXP = () => parseInt(localStorage.getItem(XP_KEY) || '0', 10);

export function levelInfo(xp = getXP()) {
  let lvl = 1;
  let title = LEVELS[0].title;
  LEVELS.forEach((l, i) => {
    if (xp >= l.at) { lvl = i + 1; title = l.title; }
  });
  return { level: lvl, title, xp };
}

export function resetXP() {
  localStorage.removeItem(XP_KEY);
  localStorage.removeItem(AWARDED_KEY);
}

// Awards each `reason` only once, so demo actions don't farm XP.
export function awardXP(points, reason) {
  const awarded = JSON.parse(localStorage.getItem(AWARDED_KEY) || '[]');
  if (awarded.includes(reason)) return null;
  awarded.push(reason);
  localStorage.setItem(AWARDED_KEY, JSON.stringify(awarded));
  const total = getXP() + points;
  localStorage.setItem(XP_KEY, String(total));
  window.dispatchEvent(new CustomEvent('mitra-xp', { detail: { points, total } }));
  return total;
}
