// ─────────────────────────────────────────────────────────────
// The RM desk — the shared queue between the customer app and the
// banker console.
//
// The customer side writes here when someone asks MITRA for a human
// (handoff cases) or accepts a recommendation that policy says a person
// must check (advice reviews). The RM console reads the same records,
// works them, and writes status and messages back, which the customer's
// chat picks up live.
//
// In production this is a CRM / case-management service behind the bank's
// API gateway. In the prototype it is browser storage on the same origin,
// so the two surfaces sync across tabs with no server — which also keeps
// the hosted static demo working. Every RM action is appended to a
// hash-chained audit log.
// ─────────────────────────────────────────────────────────────
import { RM_PROFILE } from '../data/rmBook.js';

const KEY = 'mitra_rm_desk_v1';
const EVENT = 'mitra-rm-desk';
const HOUR = 3600 * 1000;

// Policy thresholds that route MITRA output to a human checker.
export const REVIEW_RULES = {
  sipMonthly: 25000,
  lumpSum: 500000,
  seniorAge: 60,
  version: 'rm-review-policy@2026.09',
};

export const SLA_HOURS = { High: 2, Normal: 8 };

// cyrb53 — small, synchronous, good enough to make edits to the prototype
// audit log visible. Production would sign entries server-side.
function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

const storage = () => {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
};

let memory = null; // fallback when storage is blocked

function load() {
  const s = storage();
  let raw = null;
  try { raw = s ? JSON.parse(s.getItem(KEY) || 'null') : memory; } catch { raw = null; }
  if (!raw || !Array.isArray(raw.cases)) {
    raw = seed();
    save(raw, false);
  }
  return raw;
}

function save(desk, notify = true) {
  const s = storage();
  memory = desk;
  try { s?.setItem(KEY, JSON.stringify(desk)); } catch { /* quota / blocked */ }
  if (notify && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT));
}

function mutate(fn) {
  const desk = load();
  const result = fn(desk);
  save(desk);
  return result;
}

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const nextId = (prefix, list) => `${prefix}-${String(1400 + list.length + 1).padStart(4, '0')}`;

function appendAudit(desk, actor, action, ref, detail = '') {
  const prev = desk.audit.at(-1)?.hash || 'GENESIS';
  const entry = { id: `AUD-${desk.audit.length + 1}`, at: iso(), actor, action, ref, detail };
  entry.prev = prev;
  entry.hash = hash(prev + JSON.stringify([entry.at, actor, action, ref, detail]));
  desk.audit.push(entry);
}

export function verifyAuditChain(audit = load().audit) {
  let prev = 'GENESIS';
  for (const e of audit) {
    if (e.prev !== prev || e.hash !== hash(prev + JSON.stringify([e.at, e.actor, e.action, e.ref, e.detail]))) return { valid: false, brokenAt: e.id };
    prev = e.hash;
  }
  return { valid: true, length: audit.length };
}

// ── Seed: a believable morning on the desk ───────────────────
function seed() {
  const desk = { cases: [], reviews: [], audit: [], seededAt: iso() };
  const rm = RM_PROFILE.name;
  const mk = (c) => {
    const createdAt = iso(-c.ageH * HOUR);
    const item = {
      id: nextId('HND', desk.cases), source: 'MITRA chat', channel: 'Phone call', language: 'English',
      consent: { contact: true, dataShare: true, at: createdAt }, assignedTo: null, scheduledFor: null,
      notes: [], outcome: null, customerMessage: null, ...c,
      createdAt, slaDueAt: new Date(Date.parse(createdAt) + SLA_HOURS[c.priority] * HOUR).toISOString(),
      timeline: [{ at: createdAt, by: 'MITRA', event: `Handoff raised from ${c.source || 'MITRA chat'} with customer consent` }],
    };
    delete item.ageH;
    desk.cases.push(item);
    return item;
  };

  mk({
    ageH: 0.7, customerId: 'CUST-77031', customerName: 'Arjun Mehta', priority: 'High', status: 'NEW', language: 'Marathi', source: 'MITRA live call',
    topic: 'Loan is squeezing savings — wants help on prepay vs protection',
    riskProfile: 'Conservative',
    brief: [
      'Asked MITRA "should I prepay my business loan or buy insurance first?" twice this week',
      'EMI ₹11,200 on ₹4.2 L at 15.5% · emergency cover 0.6 months',
      'Life cover ₹5 L against ₹1.22 Cr need · 3 dependents',
      'Prefers a call after 7 pm, in Marathi',
    ],
    preferredSlot: 'Today, after 7:00 pm',
  });
  const lakshmi = mk({
    ageH: 5, customerId: 'CUST-61402', customerName: 'Lakshmi Iyer', priority: 'Normal', status: 'SCHEDULED', language: 'Tamil', channel: 'Branch visit',
    topic: '₹12 L FD matures on 14 Oct — wants to discuss reinvestment',
    riskProfile: 'Conservative',
    brief: [
      'FD of ₹12 L maturing 14 Oct 2026 · pension ₹48K/mo covers expenses',
      'Asked MITRA about Senior Citizen Savings Scheme vs FD renewal',
      'Senior citizen — enhanced suitability applies, no equity-heavy products',
    ],
    preferredSlot: 'Weekday mornings',
    assignedTo: rm, scheduledFor: '2026-10-06T10:30:00+05:30',
  });
  lakshmi.timeline.push({ at: iso(-4.5 * HOUR), by: rm, event: 'Accepted' }, { at: iso(-4.4 * HOUR), by: rm, event: 'Branch meeting booked · 6 Oct, 10:30 am' });
  lakshmi.customerMessage = 'Kavita from IDBI will meet you at the Nariman Point branch on 6 Oct at 10:30 am. Please bring your FD receipt.';
  const fatima = mk({
    ageH: 26, customerId: 'CUST-55871', customerName: 'Dr. Fatima Shaikh', priority: 'Normal', status: 'CLOSED', channel: 'Video call',
    topic: 'Portfolio X-Ray flagged Regular-plan ELSS fees',
    riskProfile: 'Balanced',
    brief: ['ELSS in Regular plan at 1.74% vs 0.68% Direct', 'Wants to understand switching and the exit-load / lock-in rules'],
    preferredSlot: 'Lunch hour', assignedTo: rm, scheduledFor: iso(-22 * HOUR),
  });
  fatima.outcome = 'Advice given';
  fatima.notes.push({ at: iso(-21 * HOUR), by: rm, text: 'Explained 3-year ELSS lock-in per tranche; only unlocked units can move. Customer will start new SIPs in Direct plan from Nov. No switch executed.' });
  fatima.timeline.push({ at: iso(-25 * HOUR), by: rm, event: 'Accepted' }, { at: iso(-21 * HOUR), by: rm, event: 'Closed · Advice given' });
  fatima.customerMessage = 'Summary of our call: future ELSS SIPs move to the Direct plan from November; locked units stay put until their 3-year lock-in ends.';

  const mkReview = (r) => {
    const item = { id: nextId('ADV', desk.reviews), status: 'PENDING', decision: null, createdAt: iso(-r.ageH * HOUR), ...r };
    delete item.ageH;
    desk.reviews.push(item);
  };
  mkReview({
    ageH: 1.5, customerId: 'CUST-90318', customerName: 'Rohan Deshpande', type: 'sip', amount: 60000,
    recommendation: 'Start ₹60,000/mo SIP into Aggressive model portfolio (Flexi Cap 50% · Mid Cap 30% · Gold 10% · Liquid 10%)',
    trigger: `SIP above ₹${REVIEW_RULES.sipMonthly.toLocaleString('en-IN')}/mo`,
    passport: {
      engineMode: 'DETERMINISTIC', policyVersion: 'wealth-policy@2026.09.04', confidence: 0.92,
      formula: 'monthly SIP future-value formula using the displayed scenario rate',
      evidence: [['cashflow.monthlySurplus', '₹85,800'], ['risk.profile', 'Aggressive (quiz 2026-07-02)'], ['emergency.months', '7.0 of 6'], ['goal.home.gap', '₹34 L in 4 yrs']],
    },
  });
  mkReview({
    ageH: 3, customerId: 'CUST-61402', customerName: 'Lakshmi Iyer', type: 'reallocation', amount: 300000,
    recommendation: 'Move ₹3 L of maturing FD into a Balanced Advantage Fund for inflation protection',
    trigger: `Customer age ≥ ${REVIEW_RULES.seniorAge} · equity exposure increase`,
    passport: {
      engineMode: 'DETERMINISTIC', policyVersion: 'wealth-policy@2026.09.04', confidence: 0.81,
      formula: 'current connected allocation compared with risk-profile target',
      evidence: [['allocation.equity', '6% vs 20% Conservative target'], ['fd.maturity', '₹12 L on 14 Oct'], ['pension.monthly', '₹48,000'], ['customer.age', '63']],
    },
  });
  mkReview({
    ageH: 8, customerId: 'CUST-38044', customerName: 'Gurpreet Singh', type: 'protection', amount: 0,
    recommendation: 'Raise term cover to ₹2.52 Cr (gap ₹2.27 Cr) before any new investment',
    trigger: 'Protection gap with 4 dependents · EMI > 35% of income',
    passport: {
      engineMode: 'DETERMINISTIC', policyVersion: 'wealth-policy@2026.09.04', confidence: 0.88,
      formula: 'term-cover multiple and city health-cover policy',
      evidence: [['protection.termGap', '₹2.27 Cr'], ['loans.emi', '₹51,300/mo'], ['dependents', '4'], ['savings.months', '1.7']],
    },
  });

  appendAudit(desk, 'system', 'desk.opened', RM_PROFILE.employeeId, `Book of 8 · ${RM_PROFILE.branch}`);
  appendAudit(desk, rm, 'case.accepted', lakshmi.id, 'Lakshmi Iyer');
  appendAudit(desk, rm, 'case.scheduled', lakshmi.id, 'Branch visit · 6 Oct 10:30');
  appendAudit(desk, rm, 'case.closed', fatima.id, 'Outcome: Advice given');
  return desk;
}

// ── Reads ─────────────────────────────────────────────────────
export const getDesk = () => load();
export const getCase = (id) => load().cases.find((c) => c.id === id) || null;

export function subscribeDesk(fn) {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e) => { if (e.key === KEY || e.key === null) fn(); };
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(EVENT, fn); window.removeEventListener('storage', onStorage); };
}

// ── Customer side ─────────────────────────────────────────────
export function submitHandoff({ customer, riskProfile, brief, topic, language = 'English', source = 'MITRA chat', preferredSlot = 'Any time today', channel = 'Phone call' }) {
  return mutate((desk) => {
    const priority = customer.age >= REVIEW_RULES.seniorAge || /fraud|scam|loan|emi/i.test(`${topic} ${brief.join(' ')}`) ? 'High' : 'Normal';
    const createdAt = iso();
    const item = {
      id: nextId('HND', desk.cases), customerId: customer.id, customerName: customer.name,
      snapshot: { age: customer.age, segment: customer.segment, city: customer.city },
      source, channel, language, topic, brief, riskProfile, priority, status: 'NEW', preferredSlot,
      consent: { contact: true, dataShare: true, at: createdAt },
      createdAt, slaDueAt: new Date(Date.now() + SLA_HOURS[priority] * HOUR).toISOString(),
      assignedTo: null, scheduledFor: null, notes: [], outcome: null, customerMessage: null,
      timeline: [{ at: createdAt, by: 'MITRA', event: `Handoff raised from ${source} with customer consent` }],
    };
    desk.cases.unshift(item);
    appendAudit(desk, `customer:${customer.id}`, 'case.raised', item.id, topic);
    return item;
  });
}

export function needsHumanReview({ customer, type, amount = 0 }) {
  if (type === 'sip' && amount >= REVIEW_RULES.sipMonthly) return `SIP above ₹${REVIEW_RULES.sipMonthly.toLocaleString('en-IN')}/mo`;
  if (amount >= REVIEW_RULES.lumpSum) return `Lump sum above ₹${REVIEW_RULES.lumpSum.toLocaleString('en-IN')}`;
  if (customer.age >= REVIEW_RULES.seniorAge && ['sip', 'reallocation'].includes(type)) return `Customer age ≥ ${REVIEW_RULES.seniorAge}`;
  return null;
}

export function queueAdviceReview({ customer, type, amount, recommendation, trigger, passport }) {
  return mutate((desk) => {
    const item = { id: nextId('ADV', desk.reviews), customerId: customer.id, customerName: customer.name, type, amount, recommendation, trigger, passport, status: 'PENDING', decision: null, createdAt: iso() };
    desk.reviews.unshift(item);
    appendAudit(desk, 'MITRA', 'advice.queued', item.id, trigger);
    return item;
  });
}

// ── RM side ───────────────────────────────────────────────────
function updateCase(id, fn, action, detail) {
  return mutate((desk) => {
    const item = desk.cases.find((c) => c.id === id);
    if (!item) return null;
    fn(item);
    appendAudit(desk, RM_PROFILE.name, action, id, detail);
    return item;
  });
}

const stamp = (item, event) => item.timeline.push({ at: iso(), by: RM_PROFILE.name, event });

export const acceptCase = (id) => updateCase(id, (c) => {
  c.status = 'ACCEPTED'; c.assignedTo = RM_PROFILE.name; c.acceptedAt = iso(); stamp(c, 'Accepted');
  c.customerMessage = `${RM_PROFILE.name.split(' ')[0]}, your IDBI relationship manager, has picked up your request and will confirm a time shortly.`;
}, 'case.accepted', '');

export const scheduleCase = (id, { when, channel }) => updateCase(id, (c) => {
  c.status = 'SCHEDULED'; c.scheduledFor = when; c.channel = channel; c.assignedTo ||= RM_PROFILE.name;
  const label = new Date(when).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  stamp(c, `${channel} booked · ${label}`);
  c.customerMessage = `${RM_PROFILE.name.split(' ')[0]} from IDBI has booked a ${channel.toLowerCase()} with you on ${label}.`;
}, 'case.scheduled', `${channel} · ${when}`);

export const addCaseNote = (id, text) => updateCase(id, (c) => {
  c.notes.push({ at: iso(), by: RM_PROFILE.name, text }); stamp(c, 'Note added');
}, 'case.note', text.slice(0, 80));

export const closeCase = (id, { outcome, message }) => updateCase(id, (c) => {
  c.status = 'CLOSED'; c.outcome = outcome; c.closedAt = iso(); stamp(c, `Closed · ${outcome}`);
  if (message) c.customerMessage = message;
}, 'case.closed', `Outcome: ${outcome}`);

export const reassignCase = (id, to) => updateCase(id, (c) => {
  c.assignedTo = to; stamp(c, `Escalated to ${to}`);
}, 'case.escalated', to);

export function decideReview(id, { status, comment }) {
  return mutate((desk) => {
    const item = desk.reviews.find((r) => r.id === id);
    if (!item) return null;
    item.status = status;
    item.decision = { by: RM_PROFILE.name, at: iso(), comment };
    appendAudit(desk, RM_PROFILE.name, `advice.${status.toLowerCase()}`, id, comment || '');
    return item;
  });
}

export function logRmAction(action, ref, detail) {
  mutate((desk) => appendAudit(desk, RM_PROFILE.name, action, ref, detail));
}

export function resetDesk() {
  const desk = seed();
  save(desk);
  return desk;
}
