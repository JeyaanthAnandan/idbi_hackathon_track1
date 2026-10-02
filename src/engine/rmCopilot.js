// ─────────────────────────────────────────────────────────────
// MITRA for the relationship manager — the AI side of the RM console's
// copilot rail (components/rm/MitraRail.jsx).
//
// Same contract as the customer composer (engine/composer.js): the RM's book
// and desk are rendered into a fact sheet with every figure already computed
// by engine/rmInsights.js and engine/rmDesk.js; DeepSeek thinks about the
// RM's actual question and writes the answer from that sheet; any figure not
// in the sheet triggers one rewrite and is otherwise rejected, so the rail
// falls back to its built-in briefings.
// ─────────────────────────────────────────────────────────────
import { RM_PROFILE } from '../data/rmBook.js';
import { POLICY } from '../data/policy.js';
import { talkingPoints } from './rmInsights.js';
import { REVIEW_RULES } from './rmDesk.js';
import { composeGrounded, cleanFollowups } from './composer.js';
import { validateAdvisorResponse } from './advisorTools.js';
import { complete } from './deepseek.js';

export const RM_COPILOT_PROMPT_VERSION = 'mitra-rm-copilot-2026-10-02.1';

const fmtR = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const fmtL = (n) => {
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2).replace(/\.00$/, '') + ' Cr';
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1).replace(/\.0$/, '') + ' L';
  return fmtR(n);
};
const DAY = 864e5;
const clock = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const ago = (iso, now) => {
  const mins = Math.max(Math.round((now - Date.parse(iso)) / 60000), 0);
  return mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} days ago`;
};

export const VIEWS = { overview: 'Today', handoffs: 'Handoff queue', reviews: 'Sign-offs', book: 'Book', compliance: 'Compliance', audit: 'Audit trail' };

export function buildRmFactSheet({ book, desk, now = Date.now() }) {
  const lines = [];
  lines.push(`RM: ${RM_PROFILE.name}, ${RM_PROFILE.role}, ${RM_PROFILE.branch}; ARN ${RM_PROFILE.arnCode}; supervisor ${RM_PROFILE.supervisor}`);
  lines.push(`Today: ${new Date(now).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${clock(new Date(now).toISOString())}`);
  lines.push(`Sign-off rules (${REVIEW_RULES.version}): SIP of ${fmtR(REVIEW_RULES.sipMonthly)}/month or more, lump sum of ${fmtR(REVIEW_RULES.lumpSum)} or more, or any customer aged ${REVIEW_RULES.seniorAge}+ needs RM approval`);
  lines.push(`Policy ${POLICY.version}: emergency reserve ${POLICY.emergency.targetMonths} months of spend; term cover ${POLICY.insurance.termIncomeMultiple}× annual income; Section 80C limit ${fmtR(POLICY.tax.section80CLimit)}; EMI ceiling 35% of income`);

  const open = desk.cases.filter((c) => c.status !== 'CLOSED');
  lines.push('', `OPEN HANDOFF CASES (${open.length}):`);
  for (const c of open) {
    const due = Date.parse(c.slaDueAt);
    const sla = c.status === 'SCHEDULED' ? `booked${c.scheduledFor ? ` for ${new Date(c.scheduledFor).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}`
      : due < now ? `SLA breached ${ago(c.slaDueAt, now).replace(' ago', '')} ago` : `SLA due ${clock(c.slaDueAt)} (in ${Math.round((due - now) / 60000)} min)`;
    lines.push(`- ${c.id} · ${c.customerName} (${c.customerId}) · ${c.status} · ${c.priority} priority · ${c.language} · via ${c.source} · ${c.channel || 'channel not chosen'} · raised ${ago(c.createdAt, now)} · ${sla}${c.preferredSlot ? ` · prefers ${c.preferredSlot}` : ''}`);
    if (c.topic) lines.push(`  Topic: ${c.topic}`);
    if (c.question) lines.push(`  Customer asked: "${c.question}"`);
  }
  const closed = desk.cases.filter((c) => c.status === 'CLOSED').slice(0, 3);
  if (closed.length) lines.push(`Recently closed: ${closed.map((c) => `${c.id} ${c.customerName}${c.outcome ? ` (${c.outcome})` : ''}`).join('; ')}`);

  const pending = desk.reviews.filter((r) => r.status === 'PENDING');
  lines.push('', `SIGN-OFFS WAITING FOR THE RM (${pending.length}):`);
  for (const r of pending) lines.push(`- ${r.id} · ${r.customerName} (${r.customerId}) · ${r.recommendation} · trigger: ${r.trigger} · raised ${ago(r.createdAt, now)}`);

  lines.push('', `BOOK (${book.length} customers, highest attention first):`);
  for (const { persona: p, ins } of book) {
    const c = p.customer;
    const rel = p.relationship || {};
    const lastContactDays = rel.lastContact ? Math.round((now - Date.parse(rel.lastContact)) / DAY) : null;
    const reserveGap = Math.max(Math.round(ins.cf.avgSpend * POLICY.emergency.targetMonths) - c.savingsBalance, 0);
    lines.push(`## ${c.name} (${c.id}), ${c.age}, ${c.segment}, ${c.city}; customer since ${c.relationshipSince}; ${ins.riskProfile} risk profile; KYC risk ${c.kycRisk}; speaks ${rel.language || 'English'}`);
    lines.push(`  Contact: ${lastContactDays === null ? 'never contacted by the RM' : `last contacted ${lastContactDays} days ago`}; next review ${rel.nextReview || 'not set'}; ${rel.mitraSessions30d ?? 0} MITRA sessions in 30 days; last MITRA topic: ${rel.lastMitraTopic || 'none'}`);
    lines.push(`  Money: holdings ${fmtL(ins.aum)}; health score ${ins.hs.total}/100 (${ins.hs.grade}); income ${fmtR(ins.cf.avgIncome)}/month; spend ${fmtR(ins.cf.avgSpend)}/month; surplus ${fmtR(Math.max(ins.cf.surplus, 0))}/month; emergency cover ${ins.hs.emergencyMonths.toFixed(1)} months (reserve gap ${fmtL(reserveGap)}); EMI ${ins.emiRatio.toFixed(0)}% of income`);
    const extras = [
      ins.tg.available ? `80C unused ${fmtL(ins.tg.gap)} (saves ${fmtR(ins.tg.estSaving)})` : '80C not applicable or unconfirmed',
      ins.pg.available ? `life cover gap ${fmtL(ins.pg.termGap)} with ${ins.pg.dependents ?? 0} dependents; health cover gap ${fmtL(ins.pg.healthGap)}` : 'insurance data not available',
      ins.goals.length ? `goals need ${fmtR(ins.goalNeed)}/month vs capacity ${fmtR(ins.capacity)}/month` : 'no goals recorded',
      (p.loans || []).map((l) => `${l.name} ${fmtL(l.balance)} at ${l.rate}%`).join(', ') || 'no loans',
    ];
    lines.push(`  Position: ${extras.join('; ')}`);
    if (ins.flags.length) lines.push(`  Flags: ${ins.flags.map((f) => `[${f.level}] ${f.text}`).join('; ')}`);
    if (ins.opportunities.length) lines.push(`  Opportunities (suitability order): ${ins.opportunities.map((o) => `${o.product} — ${o.detail}${o.value ? ` (${fmtL(o.value)})` : ''}`).join('; ')}`);
    const points = talkingPoints(p, ins);
    if (points.length) lines.push(`  Talking points: ${points.map((t) => `${t.title} ${t.text}`).join(' ')}`);
    for (const l of (p.mitraLog || []).slice(0, 2)) lines.push(`  MITRA log (${l.when}, ${l.lang}): asked "${l.q}" — ${l.a}${l.tip ? ` Tip for RM: ${l.tip}` : ''}`);
  }
  return lines.join('\n');
}

const SYSTEM = `You are MITRA, the AI copilot for an IDBI Bank wealth relationship manager (${RM_COPILOT_PROMPT_VERSION}). You are talking to the RM, not to a customer.

Answer the RM's actual question directly, like a sharp, trusted colleague who knows every file on the desk.
- Think first about what the RM needs to do next: who to call, what to say, what to approve, what is at risk.
- Use ONLY RM_FACTS for anything about customers, cases, sign-offs and rules. Name the customer and case/sign-off ID when you refer to one.
- Copy every ₹ amount, percentage, score, count and time EXACTLY as written in RM_FACTS. Never calculate, round, add or convert a number. If an answer needs a number that is not there, say what it depends on.
- Follow MITRA's order for every customer: cash buffer, then protection, then tax, then invest. Respect suitability, the risk profile, the 35% EMI ceiling and the sign-off rules.
- You may give general Indian banking and regulatory knowledge (SEBI, RBI, IRDAI, KYC, suitability) without numbers that are not in the facts.
- Never promise returns, never claim a transaction, mandate, approval or call has already happened unless RM_FACTS says so, and never suggest bypassing the sign-off rules.
- If asked to draft a message for a customer, write it ready to send, in plain English; mention the customer's preferred language so the RM can send it in that language.
- Style: plain English, 2–5 short sentences, or a one-line intro plus up to 5 short "• " bullet points. No markdown headings, no bold, no emoji.

Return ONLY JSON:
{"reply": "<your answer>", "open": {"type": "case" | "customer" | "view", "id": "<case ID like HND-1401, customer ID like CUST-77031, or view id>"} or null, "followups": ["<up to 3 short next questions the RM might ask, max 6 words each>"]}
Views: ${Object.entries(VIEWS).map(([id, label]) => `${id} (${label})`).join(', ')}. Choose "open" only when one case, customer or view is clearly the next place to go.`;

// The link the reply offers, only if it points at something that exists.
function validOpen(open, { book, desk }) {
  if (!open || typeof open !== 'object' || typeof open.id !== 'string') return null;
  if (open.type === 'case' && desk.cases.some((c) => c.id === open.id)) return { type: 'case', id: open.id };
  if (open.type === 'customer' && book.some((b) => b.persona.customer.id === open.id)) return { type: 'customer', id: open.id };
  if (open.type === 'view' && Object.hasOwn(VIEWS, open.id)) return { type: 'view', id: open.id };
  return null;
}

export async function composeRmAnswer({ text, history = [], book, desk, now = Date.now(), signal, completeFn = complete }) {
  const facts = buildRmFactSheet({ book, desk, now });
  const turns = history.filter((m) => ['rm', 'mitra'].includes(m.from) && typeof m.text === 'string' && m.text).slice(-6);
  const transcript = turns.length
    ? `\n\nRECENT_CONVERSATION (oldest first; resolve "he", "she", "that case" from here):\n${turns.map((m) => `${m.from === 'rm' ? 'RM' : 'MITRA'}: ${m.text.slice(0, 1200)}`).join('\n')}`
    : '';
  const user = `RM_FACTS:\n${facts}${transcript}\n\nRM QUESTION: ${String(text).slice(0, 2000)}`;
  const out = await composeGrounded({ system: SYSTEM, user, sources: [facts, text, ...turns.map((m) => m.text)], signal, completeFn });
  if (out.rejected) return out;
  const response = {
    from: 'mitra',
    text: out.reply,
    open: validOpen(out.parsed.open, { book, desk }),
    followups: cleanFollowups(out.parsed.followups, []),
    ai: true,
  };
  const checked = validateAdvisorResponse(response);
  return checked.ok ? { response: checked.value } : { rejected: checked.error };
}
