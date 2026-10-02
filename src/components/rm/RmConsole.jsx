import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../Icons.jsx';
import { BOOK, RM_PROFILE } from '../../data/rmBook.js';
import { PERSONAS } from '../../data/personas.js';
import { customerInsights, talkingPoints } from '../../engine/rmInsights.js';
import { getDesk, resetDesk, subscribeDesk } from '../../engine/rmDesk.js';
import RmHandoffs, { sortCases } from './RmHandoffs.jsx';
import RmCustomer360 from './RmCustomer360.jsx';
import RmReviews from './RmReviews.jsx';
import { RmAudit, RmCompliance } from './RmCompliance.jsx';
import { CopilotRail, HistoryRail, MirrorRail } from './MitraRail.jsx';
import { Avatar, Card, FlagPill, fmt, fmtL, timeAgo, useNow } from './ui.jsx';
import idbiLogo from '../../assets/idbi-logo.png';
import '../../rm.css';

// ─────────────────────────────────────────────────────────────
// MITRA for Bankers — the relationship manager's side of MITRA.
//
// Built on the customer web app's own shell: a slim icon rail, the work
// in the middle, and MITRA's dark rail on the right. On the banker side
// that rail is MITRA as the RM's copilot, a live mirror of a customer's
// chat while working their case, or the customer's MITRA history on the
// 360. Customers talk to MITRA; when they want a person, or MITRA proposes
// something policy says a person must check, it lands here.
// ─────────────────────────────────────────────────────────────

const NAV = [
  ['overview', 'home', 'Today'],
  ['handoffs', 'inbox', 'Queue'],
  ['reviews', 'check', 'Sign-off'],
  ['book', 'users', 'Book'],
  ['compliance', 'shield', 'Comply'],
  ['audit', 'lock', 'Audit'],
];

const SESSION_KEY = 'mitra_rm_session';

function useDesk() {
  const [desk, setDesk] = useState(getDesk);
  useEffect(() => subscribeDesk(() => setDesk(getDesk())), []);
  return desk;
}

function StaffSignIn({ onSignIn }) {
  const [id, setId] = useState(RM_PROFILE.employeeId);
  return (
    <div className="rm-signin">
      <form className="rm-signin-card" onSubmit={(e) => { e.preventDefault(); onSignIn(id); }}>
        <img src={idbiLogo} alt="IDBI Bank" className="rm-signin-logo" />
        <div className="rm-kicker">MITRA for Bankers</div>
        <h1>Relationship Manager console</h1>
        <p className="rm-sub">Staff access only. In production this is IDBI single sign-on with role-based access; the prototype signs you in as a demo RM over a synthetic book.</p>
        <label>Employee ID<input value={id} onChange={(e) => setId(e.target.value)} required /></label>
        <label>Role<select defaultValue="rm"><option value="rm">Relationship Manager · Wealth</option></select></label>
        <button className="rm-btn primary big" type="submit"><Icon name="lock" size={16} /> Sign in with IDBI SSO (sandbox)</button>
        <a className="rm-link" href="./">← Back to the customer app</a>
      </form>
    </div>
  );
}

function BookHealth({ score }) {
  const r = 14, circ = 2 * Math.PI * r, len = (score / 100) * circ;
  return (
    <div className="rm-health-chip" title="Average financial health score across the book">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r={r} fill="none" stroke="var(--chart-track)" strokeWidth="4" />
        <circle cx="17" cy="17" r={r} fill="none" stroke="var(--teal)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${len} ${circ - len}`} transform="rotate(-90 17 17)" />
        <circle cx="17" cy="3" r="2.6" fill="var(--orange)" />
      </svg>
      <div><strong>{score}</strong><span>Book health</span></div>
    </div>
  );
}

export default function RmConsole() {
  const [signedIn, setSignedIn] = useState(() => { try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; } });
  const [view, setView] = useState('overview');
  const [caseId, setCaseId] = useState(null);
  const [customerId, setCustomerId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState('');
  const [toastMsg, setToastMsg] = useState(null);
  const desk = useDesk();
  const now = useNow();

  useEffect(() => { document.title = 'MITRA · RM Console'; }, []);

  // The book: eight synthetic relationships, plus any customer who built a
  // profile in this browser and has since asked MITRA for a human.
  const book = useMemo(() => {
    const entries = BOOK.map((persona) => ({ persona, ins: customerInsights(persona, persona.riskProfile) }));
    const custom = PERSONAS.custom;
    if (custom && desk.cases.some((c) => c.customerId === custom.customer.id) && !entries.some((e) => e.persona.customer.id === custom.customer.id)) {
      const lead = { ...custom, riskProfile: desk.cases.find((c) => c.customerId === custom.customer.id)?.riskProfile || 'Balanced', relationship: { language: 'English', mitraSessions30d: 1, lastMitraTopic: 'New via MITRA' }, mitraLog: [] };
      entries.push({ persona: lead, ins: customerInsights(lead, lead.riskProfile), isNew: true });
    }
    return entries.sort((a, b) => b.ins.priority - a.ins.priority);
  }, [desk.cases]);

  const toast = (m) => { setToastMsg(m); clearTimeout(toast.t); toast.t = setTimeout(() => setToastMsg(null), 3200); };

  if (!signedIn) return <StaffSignIn onSignIn={() => { try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* ignore */ } setSignedIn(true); }} />;

  const openCases = desk.cases.filter((c) => c.status !== 'CLOSED');
  const newCases = desk.cases.filter((c) => c.status === 'NEW');
  const pending = desk.reviews.filter((r) => r.status === 'PENDING');
  const go = (v) => { setView(v); setCustomerId(null); };
  const openCustomer = (id) => {
    if (!book.some((b) => b.persona.customer.id === id)) { toast('This customer is not in your book yet — work from the MITRA briefing on the case.'); return; }
    setCustomerId(id); setView('book');
  };
  const openCase = (id) => { setCaseId(id); setCustomerId(null); setView('handoffs'); };
  const entry = customerId ? book.find((b) => b.persona.customer.id === customerId) : null;
  const selectedCase = desk.cases.find((c) => c.id === caseId) || sortCases(desk.cases.filter((c) => c.status !== 'CLOSED'))[0] || desk.cases[0] || null;
  const badge = { handoffs: newCases.length, reviews: pending.length };
  const avgHealth = Math.round(book.reduce((s, b) => s + b.ins.hs.total, 0) / book.length);

  const search = (e) => {
    e.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;
    const kase = desk.cases.find((c) => c.id.toLowerCase() === q);
    if (kase) { openCase(kase.id); setQuery(''); return; }
    const hit = book.find((b) => `${b.persona.customer.name} ${b.persona.customer.id}`.toLowerCase().includes(q));
    if (hit) { openCustomer(hit.persona.customer.id); setQuery(''); return; }
    toast(`No customer or case matches “${query.trim()}”`);
  };

  const hour = new Date(now).getHours();
  const heads = {
    overview: [`${new Date(now).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })} · ${RM_PROFILE.branch}`, `Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${RM_PROFILE.name.split(' ')[0]}`],
    handoffs: ['Handoff queue · SLA high 2h · normal 8h', 'Customers who asked for a human'],
    book: entry ? [`${entry.persona.customer.id} · ${entry.persona.customer.segment}`, 'Customer 360'] : [`My book · ${book.length} relationships`, 'Every customer, scored by the engine they see'],
    reviews: ['Advice review · maker–checker', 'MITRA proposes. You check.'],
    compliance: ['Compliance & suitability', 'Flags across the book'],
    audit: ['Audit trail · hash-chained', 'Every human touch is on the record'],
  };
  const [eyebrow, title] = heads[view];

  const rail = view === 'handoffs'
    ? <MirrorRail c={selectedCase} draft={draft} />
    : view === 'book' && entry
      ? <HistoryRail entry={entry} />
      : <CopilotRail book={book} desk={desk} now={now} onOpenCase={openCase} onOpenCustomer={openCustomer} onGo={go} />;

  return (
    <div className="rm-app">
      <nav className="rm-rail" aria-label="RM console">
        <div className="rm-rail-logo"><img src={idbiLogo} alt="IDBI Bank" /></div>
        <div className="rm-rail-items">
          {NAV.map(([id, icon, label]) => (
            <button key={id} className={view === id ? 'is-on' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => go(id)}>
              <Icon name={icon} size={19} /><span>{label}</span>
              {badge[id] > 0 && <b className={`rm-badge ${id === 'reviews' ? 'dark' : ''}`}>{badge[id]}</b>}
            </button>
          ))}
        </div>
        <div className="rm-rail-foot">
          <button className="rm-rail-mini" title="Reset the demo desk" onClick={() => { if (window.confirm('Reset the demo desk to its starting cases?')) { resetDesk(); toast('Demo desk reset'); } }}><Icon name="clock" size={17} /><span>Reset</span></button>
          <button className="rm-rail-mini" title="Sign out" onClick={() => { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } setSignedIn(false); }}><Icon name="logout" size={17} /><span>Exit</span></button>
          <span className="rm-rail-avatar" title={`${RM_PROFILE.name} · ${RM_PROFILE.employeeId}`}>KM</span>
        </div>
      </nav>

      <main className="rm-main">
        <header className="rm-top">
          <div className="rm-top-title">
            <div className="rm-kicker">{eyebrow}</div>
            <h1>{title}</h1>
          </div>
          <BookHealth score={avgHealth} />
          <form className="rm-search" onSubmit={search} role="search">
            <Icon name="list" size={15} />
            <label className="sr-only" htmlFor="rm-q">Search customer, CIF or case ID</label>
            <input id="rm-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customer, CIF or case ID" />
          </form>
          <a className="rm-btn ghost small" href="./?demo=1&screen=mitra" target="_blank" rel="noreferrer">Customer app <Icon name="arrowUpRight" size={13} /></a>
        </header>

        {view === 'overview' && <Overview book={book} desk={desk} now={now} openCases={openCases} pending={pending} onOpenCase={openCase} onOpenCustomer={openCustomer} onGo={go} />}
        {view === 'handoffs' && <RmHandoffs desk={desk} book={book} now={now} selected={selectedCase} onSelect={setCaseId} onOpenCustomer={openCustomer} onDraft={setDraft} toast={toast} />}
        {view === 'book' && (entry
          ? <RmCustomer360 entry={entry} desk={desk} onBack={() => setCustomerId(null)} onOpenCase={openCase} toast={toast} />
          : <Book book={book} desk={desk} onOpenCustomer={openCustomer} />)}
        {view === 'reviews' && <RmReviews desk={desk} book={book} now={now} onOpenCustomer={openCustomer} toast={toast} />}
        {view === 'compliance' && <RmCompliance book={book} desk={desk} onOpenCustomer={openCustomer} />}
        {view === 'audit' && <RmAudit desk={desk} />}
      </main>

      {rail}

      {toastMsg && <div className="rm-toast" role="status">{toastMsg}</div>}
    </div>
  );
}

const STEP_ORDER = [
  ['emergency', '1 · Emergency reserve'],
  ['term', '2 · Term cover gap'],
  ['elss', '3 · 80C headroom'],
  ['sip', '4 · Idle surplus → SIP'],
  ['direct', '5 · Regular → Direct'],
];

function Overview({ book, desk, now, openCases, pending, onOpenCase, onOpenCustomer, onGo }) {
  const aum = book.reduce((s, b) => s + b.ins.aum, 0);
  const sessions = book.reduce((s, b) => s + (b.persona.relationship?.mitraSessions30d || 0), 0);
  const languages = new Set(book.map((b) => b.persona.relationship?.language).filter(Boolean)).size;
  const urgent = openCases.filter((c) => c.status === 'NEW').sort((a, b) => Date.parse(a.slaDueAt) - Date.parse(b.slaDueAt));
  const breached = openCases.filter((c) => c.status !== 'SCHEDULED' && Date.parse(c.slaDueAt) < now).length;
  const oldestReview = pending.slice().sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0];

  const counts = STEP_ORDER.map(([id, label]) => ({ id, label, count: book.filter((b) => b.ins.opportunities.some((o) => o.id === id)).length }));
  const maxCount = Math.max(...counts.map((c) => c.count), 1);
  const topNeed = counts.slice().sort((a, b) => b.count - a.count)[0];

  // MITRA's one insight for the morning: the top-priority customer and the
  // first thing to say to them.
  const lead = book[0];
  const leadFirst = lead.persona.customer.name.replace(/^Dr\.\s*/, '').split(' ')[0];
  const leadPoints = talkingPoints(lead.persona, lead.ins);
  const due = lead.persona.relationship?.nextReview;
  const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const dueDays = due ? Math.round((dayStart(`${due}T00:00:00`) - dayStart(now)) / 864e5) : null;
  const dueText = dueDays === null ? 'needs you' : dueDays <= 0 ? 'is due for review today' : dueDays === 1 ? "has a review tomorrow" : `has a review in ${dueDays} days`;
  const leadWith = leadPoints[0]?.title.replace(/\.$/, '').replace(/ (first|next)$/i, '').toLowerCase();

  return (
    <div className="rm-stack">
      <section className="rm-hero">
        <div className="rm-hero-arc a" /><div className="rm-hero-arc b" />
        <div className="rm-hero-main">
          <div className="rm-kicker on-night">Book under advice · {book.length} relationships</div>
          <div className="rm-hero-figure">{fmtL(aum)}</div>
          <div className="rm-hero-actions">
            <button className="rm-pillbtn primary" onClick={() => onGo('handoffs')}>Open queue</button>
            <button className="rm-pillbtn" onClick={() => onGo('reviews')}>Sign-offs</button>
            <button className="rm-pillbtn" onClick={() => onGo('book')}>My book</button>
          </div>
        </div>
        <div className="rm-hero-stats">
          <div><span className="rm-kicker on-night">Open handoffs</span><strong>{openCases.length}</strong><small>{breached ? `${breached} past SLA` : urgent[0] ? `next SLA ${new Date(urgent[0].slaDueAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : 'all within SLA'}</small></div>
          <div className="accent"><span className="rm-kicker on-night">Awaiting sign-off</span><strong>{pending.length}</strong><small>{oldestReview ? `oldest ${timeAgo(oldestReview.createdAt, now).replace(' ago', '')}` : 'queue clear'}</small></div>
          <div><span className="rm-kicker on-night">MITRA sessions · 30d</span><strong>{sessions}</strong><small>in {languages} languages</small></div>
        </div>
      </section>

      <div className="rm-two">
        <section className="rm-card rm-insight">
          <Avatar name={lead.persona.customer.name} size={58} ring />
          <div>
            <div className="rm-kicker orange">● MITRA found something</div>
            <h2>{leadFirst} {dueText}.{leadWith ? ` Lead with ${leadWith}.` : ''}</h2>
            <p>{leadPoints.slice(0, 2).map((t) => t.text).join(' ')}</p>
            <button className="rm-pillbtn primary solid" onClick={() => onOpenCustomer(lead.persona.customer.id)}>Prepare with MITRA →</button>
          </div>
        </section>
        <section className="rm-card rm-insight col">
          <div className="rm-kicker orange">◉ Book comparison</div>
          <h2>{topNeed.label.replace(/^\d · /, '')} is the top need in {topNeed.count} of {book.length} relationships</h2>
          <p>MITRA's order for every customer: cash buffer, then protection, then tax, then invest.</p>
          <div className="rm-steps-bars">
            {counts.map((c) => (
              <div key={c.id} className="rm-pipe">
                <span className="name">{c.label}</span>
                <div className="rm-meter"><i style={{ width: `${(c.count / maxCount) * 100}%`, background: c.id === 'sip' ? 'var(--orange)' : undefined }} /></div>
                <span className="count">{c.count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <Card title="Needs you today" aside={<span className="rm-kicker">Ranked by risk, not revenue</span>} className="rm-needs">
        {book.slice(0, 5).map(({ persona: p, ins }) => {
          const open = desk.cases.find((c) => c.customerId === p.customer.id && c.status !== 'CLOSED');
          const flags = ins.flags.slice().sort((a, b) => ['high', 'medium', 'low'].indexOf(a.level) - ['high', 'medium', 'low'].indexOf(b.level)).slice(0, 2);
          return (
            <div className="rm-need" key={p.customer.id}>
              <Avatar name={p.customer.name} size={40} tone={flags[0]?.level} />
              <div className="grow">
                <div className="rm-need-name">{p.customer.name} <span>· {p.customer.age} · {p.customer.city} · {p.relationship?.language}</span></div>
                <div className="rm-list-tags">
                  {open && <FlagPill level="high">{open.status === 'NEW' ? `Asked for you · ${open.id}` : `${open.id} · ${open.status.toLowerCase()}`}</FlagPill>}
                  {flags.map((f) => <FlagPill key={f.code} level={f.level}>{f.text}</FlagPill>)}
                </div>
              </div>
              <div className="rm-need-pri"><span className="rm-kicker">Priority</span><strong className={ins.priority >= 80 ? 'hot' : ''}>{ins.priority}</strong></div>
              {open
                ? <button className="rm-pillbtn primary solid" onClick={() => onOpenCase(open.id)}>Open case</button>
                : <button className="rm-pillbtn outline" onClick={() => onOpenCustomer(p.customer.id)}>Open 360</button>}
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function Book({ book, desk, onOpenCustomer }) {
  const [q, setQ] = useState('');
  const [flag, setFlag] = useState('all');
  const segments = [['all', 'All'], ['Salaried', 'Salaried'], ['Self-Employed', 'Self-employed'], ['Retired', 'Retired'], ['high', 'High flags']];
  const rows = book.filter((b) => {
    const c = b.persona.customer;
    const text = `${c.name} ${c.id} ${c.segment} ${c.city}`.toLowerCase();
    const seg = flag === 'all' || (flag === 'high' ? b.ins.flags.some((f) => f.level === 'high') : c.segment.startsWith(flag));
    return (!q || text.includes(q.toLowerCase())) && seg;
  });
  const surplus = book.reduce((s, b) => s + Math.max(b.ins.cf.surplus, 0), 0);
  const stale = book.filter((b) => !b.persona.relationship?.lastContact || Date.now() - Date.parse(b.persona.relationship.lastContact) > 90 * 864e5).length;
  const termGap = book.filter((b) => b.ins.opportunities.some((o) => o.id === 'term')).reduce((s, b) => s + b.ins.pg.termGap, 0);
  return (
    <div className="rm-stack">
      <div className="rm-kpis">
        <div className="rm-kpi"><div className="rm-kpi-label">Not contacted in 90+ days</div><div className="rm-kpi-value">{stale}</div><div className="rm-kpi-sub">still active in MITRA</div></div>
        <div className="rm-kpi is-orange"><div className="rm-kpi-label">Idle surplus in book</div><div className="rm-kpi-value">{fmtL(surplus)}/mo</div><div className="rm-kpi-sub">{book.filter((b) => b.ins.cf.surplus > 5000).length} customers</div></div>
        <div className="rm-kpi"><div className="rm-kpi-label">Protection gap</div><div className="rm-kpi-value">{fmtL(termGap)}</div><div className="rm-kpi-sub">term cover, where suitable</div></div>
        <div className="rm-kpi"><div className="rm-kpi-label">Avg surplus / customer</div><div className="rm-kpi-value">{fmt(surplus / book.length)}</div><div className="rm-kpi-sub">per month</div></div>
      </div>
      <Card>
        <div className="rm-filters">
          {segments.map(([id, label]) => (
            <button key={id} className={`rm-chipbtn ${flag === id ? 'is-on' : ''}`} onClick={() => setFlag(id)}>{label}</button>
          ))}
          <input className="rm-search-inline" placeholder="Filter by name, ID, city…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter book" />
        </div>
        <BookTable book={rows} desk={desk} onOpenCustomer={onOpenCustomer} />
      </Card>
    </div>
  );
}

function BookTable({ book, desk, onOpenCustomer }) {
  return (
    <div className="rm-table-wrap">
      <table className="rm-table rm-book">
        <thead>
          <tr><th>Customer</th><th>Segment</th><th>Risk</th><th style={{ textAlign: 'right' }}>AUM</th><th>Health</th><th>Top flag</th><th>Last RM contact</th><th>MITRA 30d</th><th style={{ textAlign: 'right' }}>Priority</th></tr>
        </thead>
        <tbody>
          {book.map(({ persona: p, ins, isNew }) => {
            const top = ins.flags.slice().sort((a, b) => ['high', 'medium', 'low'].indexOf(a.level) - ['high', 'medium', 'low'].indexOf(b.level))[0];
            const last = p.relationship?.lastContact;
            const days = last ? Math.round((Date.now() - Date.parse(last)) / 864e5) : null;
            const open = desk.cases.some((c) => c.customerId === p.customer.id && c.status !== 'CLOSED');
            return (
              <tr key={p.customer.id} onClick={() => onOpenCustomer(p.customer.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpenCustomer(p.customer.id)}>
                <td><div className="rm-cust"><Avatar name={p.customer.name} size={32} tone={top?.level} /><div><strong>{p.customer.name}</strong>{isNew && <span className="rm-pill is-info" style={{ marginLeft: 6 }}>New via MITRA</span>}{open && <span className="rm-pill is-warn" style={{ marginLeft: 6 }}>Open case</span>}<span>{p.customer.id} · {p.relationship?.language}</span></div></div></td>
                <td>{p.customer.segment}</td>
                <td>{ins.riskProfile}</td>
                <td style={{ textAlign: 'right' }}>{fmtL(ins.aum)}</td>
                <td><span className={`rm-score ${ins.hs.total < 40 ? 'low' : ins.hs.total < 60 ? 'mid' : ''}`}>{ins.hs.total}</span></td>
                <td>{top ? <FlagPill level={top.level}>{top.code}</FlagPill> : '—'}</td>
                <td className={days === null || days > 90 ? 'rm-neg' : ''}>{days === null ? 'Never' : `${new Date(last).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${days}d`}</td>
                <td>{p.relationship?.mitraSessions30d ?? 0}</td>
                <td style={{ textAlign: 'right' }} className="rm-mono">{ins.priority}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
