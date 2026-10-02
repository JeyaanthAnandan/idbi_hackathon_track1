import React, { useEffect, useRef, useState } from 'react';
import Icon from '../Icons.jsx';
import { RM_PROFILE } from '../../data/rmBook.js';
import { talkingPoints } from '../../engine/rmInsights.js';
import { POLICY } from '../../data/policy.js';
import { fmt, fmtL, timeAgo } from './ui.jsx';

// ─────────────────────────────────────────────────────────────
// The right-hand MITRA rail of the RM console. It is the same dark rail
// the customer chats with in the web app, so the banker works next to the
// same MITRA, in three modes:
//   • CopilotRail   — MITRA for the RM: overnight triage and briefings
//   • MirrorRail    — a read-only copy of the customer's own chat for a case
//   • HistoryRail   — what a customer recently did with MITRA (shared with consent)
// Every answer is computed from the desk and the book; nothing is generated.
// ─────────────────────────────────────────────────────────────

export function MitraMark({ size = 46 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 50 50" aria-hidden="true">
      <circle cx="25" cy="25" r="23" fill="#0b2e29" stroke="rgba(234,243,241,0.2)" />
      <circle cx="25" cy="25" r="16" fill="none" stroke="#0f8c7e" strokeWidth="3" />
      <circle cx="25" cy="25" r="9.5" fill="none" stroke="#6bbdb2" strokeWidth="3" />
      <circle cx="25" cy="9" r="3" fill="#f2761d" />
    </svg>
  );
}

function RailHead({ title, sub, banner }) {
  return (
    <>
      {banner && <div className="mr-banner"><i />{banner}</div>}
      <div className="mr-head">
        <MitraMark />
        <div>
          <div className="mr-title">{title}</div>
          <div className="mr-eyebrow">{sub}</div>
        </div>
      </div>
    </>
  );
}

function Points({ points }) {
  return (
    <ol className="mr-points">
      {points.map((t) => <li key={t.title}><strong>{t.title}</strong> {t.text}</li>)}
    </ol>
  );
}

// ── Copilot ───────────────────────────────────────────────────
function briefFor(entry, desk) {
  const c = entry.persona.customer;
  const open = desk.cases.find((x) => x.customerId === c.id && x.status !== 'CLOSED');
  return {
    from: 'mitra',
    eyebrow: `${c.name}${open ? ` · ${open.id}` : ''} · computed`,
    points: talkingPoints(entry.persona, entry.ins),
    foot: POLICY.version,
    action: open ? { label: `Open ${open.id}`, caseId: open.id } : { label: 'Open Customer 360', customerId: c.id },
  };
}

function answer(text, { book, desk, now }) {
  const q = text.toLowerCase();
  const match = book.find((b) => {
    const n = b.persona.customer.name.toLowerCase().replace(/^dr\.\s*/, '');
    return q.includes(n.split(' ')[0]) || q.includes(n);
  });
  if (match) return briefFor(match, desk);
  if (/sign|review|approv|checker/.test(q)) {
    const pending = desk.reviews.filter((r) => r.status === 'PENDING');
    if (!pending.length) return { from: 'mitra', text: 'Nothing is waiting for your sign-off.' };
    return {
      from: 'mitra',
      eyebrow: `${pending.length} awaiting sign-off · ${desk.reviews[0] ? 'oldest first' : ''}`,
      list: pending.slice().sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
        .map((r) => `${r.customerName}: ${r.recommendation} (${r.trigger}, ${timeAgo(r.createdAt, now)})`),
      action: { label: 'Open sign-offs', view: 'reviews' },
    };
  }
  if (/call|contact|overdue|haven/.test(q)) {
    const stale = book
      .map((b) => ({ b, days: b.persona.relationship?.lastContact ? Math.round((now - Date.parse(b.persona.relationship.lastContact)) / 864e5) : null }))
      .filter((x) => x.days === null || x.days > 90)
      .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999));
    return {
      from: 'mitra',
      eyebrow: `${stale.length} not contacted in 90+ days`,
      list: stale.map(({ b, days }) => `${b.persona.customer.name}: ${days === null ? 'never contacted' : `${days} days`} · ${b.persona.relationship?.mitraSessions30d ?? 0} MITRA sessions in 30 days`),
    };
  }
  if (/sla|queue|handoff|case/.test(q)) {
    const open = desk.cases.filter((c) => c.status !== 'CLOSED');
    return {
      from: 'mitra',
      eyebrow: `${open.length} open handoff${open.length === 1 ? '' : 's'}`,
      list: open.map((c) => `${c.customerName} · ${c.id} · ${c.status.toLowerCase()} · ${c.status === 'SCHEDULED' ? 'booked' : `SLA ${Math.max(Math.round((Date.parse(c.slaDueAt) - now) / 60000), 0)} min`}`),
      action: { label: 'Open queue', view: 'handoffs' },
    };
  }
  return { from: 'mitra', text: 'I can brief you on any customer in your book, list your sign-offs, show the handoff queue, or find who is overdue for a call. Try a name, like "Brief me on Gurpreet".' };
}

export function CopilotRail({ book, desk, now, onOpenCase, onOpenCustomer, onGo }) {
  const openCases = desk.cases.filter((c) => c.status !== 'CLOSED');
  const urgent = openCases.filter((c) => c.status === 'NEW').sort((a, b) => Date.parse(a.slaDueAt) - Date.parse(b.slaDueAt))[0];
  const pending = desk.reviews.filter((r) => r.status === 'PENDING');
  const top = urgent ? book.find((b) => b.persona.customer.id === urgent.customerId) : book[0];
  const [thread, setThread] = useState([]);
  const [draft, setDraft] = useState('');
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' }); }, [thread.length]);

  const ask = (text) => {
    if (!text.trim()) return;
    setThread((t) => [...t, { from: 'rm', text }, answer(text, { book, desk, now })]);
    setDraft('');
  };
  const firstName = top?.persona.customer.name.replace(/^Dr\.\s*/, '').split(' ')[0];
  const chips = [
    firstName && `Brief me on ${firstName}`,
    pending.length ? 'Start with sign-offs' : null,
    "Who haven't I called?",
  ].filter(Boolean);

  const intro = urgent
    ? `${urgent.customerName.split(' ')[0]} asked for you ${timeAgo(urgent.createdAt, now)} on ${urgent.source.replace('MITRA ', 'a ')}${urgent.language !== 'English' ? ` in ${urgent.language}` : ''}. The SLA ends at ${new Date(urgent.slaDueAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}.`
    : 'No handoff is waiting on you right now.';

  return (
    <aside className="mr" aria-label={`MITRA for ${RM_PROFILE.name.split(' ')[0]}`}>
      <RailHead title={<>MITRA<sup>®</sup></>} sub={`for ${RM_PROFILE.name.split(' ')[0]} · RM copilot`} />
      <div className="mr-body">
        <div className="mr-bubble">
          <div className="mr-eyebrow">Overnight triage · {book.length} customers</div>
          <p>
            Morning, {RM_PROFILE.name.split(' ')[0]}. {intro}
            {pending.length ? ` ${pending.length} recommendation${pending.length === 1 ? ' is' : 's are'} waiting for your sign-off.` : ''}
          </p>
        </div>
        <div className="mr-chips">
          {chips.map((c) => <button key={c} type="button" className="mr-chip" onClick={() => ask(c)}>{c}</button>)}
        </div>
        {thread.map((m, i) => m.from === 'rm'
          ? <div key={i} className="mr-user">{m.text}</div>
          : (
            <div key={i} className="mr-bubble">
              {m.eyebrow && <div className="mr-eyebrow">{m.eyebrow}</div>}
              {m.text && <p>{m.text}</p>}
              {m.points && <Points points={m.points} />}
              {m.list && <ul className="mr-list">{m.list.map((x) => <li key={x}>{x}</li>)}</ul>}
              {(m.foot || m.action) && (
                <div className="mr-foot">
                  {m.foot && <span className="mr-eyebrow orange">Advice Passport · {m.foot}</span>}
                  {m.action && (
                    <button type="button" className="mr-link" onClick={() => (m.action.caseId ? onOpenCase(m.action.caseId) : m.action.customerId ? onOpenCustomer(m.action.customerId) : onGo(m.action.view))}>
                      {m.action.label} →
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        <div ref={endRef} />
      </div>
      <form className="mr-compose" onSubmit={(e) => { e.preventDefault(); ask(draft); }}>
        <label className="mr-input">
          <span className="sr-only">Ask MITRA</span>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about a customer, case or rule…" />
        </label>
        <button type="submit" className="mr-send" aria-label="Send"><Icon name="send" size={18} /></button>
      </form>
    </aside>
  );
}

// ── Mirror: the customer's own chat for one case ─────────────
const STEPS = [['NEW', 'Sent'], ['ACCEPTED', 'Picked up'], ['SCHEDULED', 'Booked'], ['CLOSED', 'Done']];

export function MirrorRail({ c, draft }) {
  if (!c) return <CopilotEmpty />;
  const first = c.customerName.replace(/^Dr\.\s*/, '').split(' ')[0];
  const reached = STEPS.findIndex(([s]) => s === c.status);
  return (
    <aside className="mr" aria-label={`${first}'s MITRA chat, live`}>
      <RailHead
        banner={`Live mirror · what ${first} sees right now`}
        title={<>MITRA<sup>®</sup></>}
        sub={`${c.language} · ${c.source}`}
      />
      <div className="mr-body">
        <div className="mr-user">{c.question || 'I want to talk to a human advisor'}</div>
        <div className="mr-bubble"><p>I've shared the briefing with your IDBI relationship manager as case {c.id}, with your consent. You'll see their reply right here.</p></div>
        <div className="mr-bubble">
          <div className="mr-eyebrow">Your request · {c.id}</div>
          <div className="mr-steps">
            {STEPS.map(([s, label], i) => (
              <div key={s} className={i <= reached ? 'on' : ''}><i />{label}</div>
            ))}
          </div>
        </div>
        {c.customerMessage && (
          <div className="mr-bubble">
            <p>{c.customerMessage}</p>
            <div className="mr-sig">— {c.assignedTo || 'IDBI Wealth RM desk'}</div>
          </div>
        )}
        {draft && draft !== c.customerMessage && c.status !== 'CLOSED' && (
          <div className="mr-bubble is-draft">
            <div className="mr-eyebrow orange">Appears when you confirm</div>
            <p>{draft}</p>
            <div className="mr-sig">— {RM_PROFILE.name}, your IDBI RM</div>
          </div>
        )}
      </div>
      <div className="mr-note">Read-only. You see the same chat, in the same components, so nothing is lost between MITRA and you.</div>
    </aside>
  );
}

function CopilotEmpty() {
  return (
    <aside className="mr">
      <RailHead title={<>MITRA<sup>®</sup></>} sub="Live mirror" />
      <div className="mr-body"><div className="mr-bubble"><p>Pick a case to see the customer's chat as they see it.</p></div></div>
    </aside>
  );
}

// ── History: what the customer did with MITRA ────────────────
export function HistoryRail({ entry }) {
  const p = entry.persona;
  const first = p.customer.name.replace(/^Dr\.\s*/, '').split(' ')[0];
  const log = p.mitraLog || [];
  const tips = log.filter((l) => l.tip);
  return (
    <aside className="mr" aria-label={`${first}'s MITRA conversations`}>
      <RailHead title={`${first}'s MITRA`} sub={`${p.relationship?.mitraSessions30d ?? 0} sessions · 30d · shared with consent`} />
      <div className="mr-body">
        {log.length === 0 && <div className="mr-bubble"><p>No MITRA conversations shared yet.</p></div>}
        {log.map((l, i) => (
          <React.Fragment key={i}>
            <div className="mr-eyebrow">{l.when} · {l.tool} · {l.lang}</div>
            <div className="mr-user">{l.q}</div>
            <div className="mr-bubble">
              {l.verdict && <span className="mr-verdict">{l.verdict}</span>}
              <p>{l.a}</p>
            </div>
          </React.Fragment>
        ))}
        {tips.map((l, i) => (
          <div key={`t${i}`} className="mr-bubble is-tip">
            <div className="mr-eyebrow orange">MITRA for {RM_PROFILE.name.split(' ')[0]} · tip</div>
            <p>{l.tip}</p>
          </div>
        ))}
        {entry.ins.opportunities[0] && (
          <div className="mr-bubble is-tip">
            <div className="mr-eyebrow orange">Lead with</div>
            <p>{entry.ins.opportunities[0].product}: {entry.ins.opportunities[0].detail}.{entry.ins.opportunities[0].value ? ` ${fmtL(entry.ins.opportunities[0].value)}.` : ''}</p>
          </div>
        )}
      </div>
      <div className="mr-note">Summaries of sessions the customer agreed to share. Surplus today: {fmt(Math.max(entry.ins.cf.surplus, 0))}/mo.</div>
    </aside>
  );
}
