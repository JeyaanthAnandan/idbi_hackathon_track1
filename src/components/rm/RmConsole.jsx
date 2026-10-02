import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../Icons.jsx';
import { BOOK, RM_PROFILE } from '../../data/rmBook.js';
import { PERSONAS } from '../../data/personas.js';
import { customerInsights } from '../../engine/rmInsights.js';
import { getDesk, resetDesk, subscribeDesk } from '../../engine/rmDesk.js';
import RmHandoffs from './RmHandoffs.jsx';
import RmCustomer360 from './RmCustomer360.jsx';
import RmReviews from './RmReviews.jsx';
import { RmAudit, RmCompliance } from './RmCompliance.jsx';
import { Avatar, Card, FlagPill, Kpi, SlaBadge, StatusPill, fmtL, timeAgo, useNow } from './ui.jsx';
import idbiLogo from '../../assets/idbi-logo.png';
import '../../rm.css';

// ─────────────────────────────────────────────────────────────
// MITRA for Bankers — the relationship manager's side of MITRA.
//
// Customers talk to MITRA; when they want a person, or MITRA proposes
// something policy says a person must check, it lands here. The RM works
// the queue, sees the same computed facts MITRA used, and every action
// flows back to the customer's chat and into a hash-chained audit log.
// ─────────────────────────────────────────────────────────────

const NAV = [
  ['overview', 'home', 'Overview'],
  ['handoffs', 'inbox', 'Handoffs'],
  ['book', 'users', 'My book'],
  ['reviews', 'check', 'Advice review'],
  ['compliance', 'shield', 'Compliance'],
  ['audit', 'lock', 'Audit trail'],
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

export default function RmConsole() {
  const [signedIn, setSignedIn] = useState(() => { try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; } });
  const [view, setView] = useState('overview');
  const [caseId, setCaseId] = useState(null);
  const [customerId, setCustomerId] = useState(null);
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
      const lead = { ...custom, riskProfile: desk.cases.find((c) => c.customerId === custom.customer.id)?.riskProfile || 'Balanced', relationship: { language: 'English', mitraSessions30d: 1, lastMitraTopic: 'New via MITRA' } };
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
  const badge = { handoffs: newCases.length, reviews: pending.length };
  const titles = { overview: `Good ${new Date(now).getHours() < 12 ? 'morning' : new Date(now).getHours() < 17 ? 'afternoon' : 'evening'}, ${RM_PROFILE.name.split(' ')[0]}`, handoffs: 'Handoff queue', book: entry ? 'Customer 360' : 'My book', reviews: 'Advice review · maker–checker', compliance: 'Compliance & suitability', audit: 'Audit trail' };

  return (
    <div className="rm-app">
      <aside className="rm-rail">
        <div className="rm-brand"><img src={idbiLogo} alt="IDBI Bank" /><div><strong>MITRA</strong><span>for Bankers</span></div></div>
        <nav>
          {NAV.map(([id, icon, label]) => (
            <button key={id} className={view === id ? 'is-on' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => go(id)}>
              <Icon name={icon} size={18} /><span>{label}</span>
              {badge[id] > 0 && <b className="rm-badge">{badge[id]}</b>}
            </button>
          ))}
        </nav>
        <div className="rm-rail-foot">
          <Avatar name={RM_PROFILE.name} size={34} />
          <div><strong>{RM_PROFILE.name}</strong><span>{RM_PROFILE.employeeId}</span></div>
        </div>
      </aside>

      <main className="rm-main">
        <header className="rm-top">
          <div>
            <div className="rm-kicker">{RM_PROFILE.branch} · {RM_PROFILE.role}</div>
            <h1>{titles[view]}</h1>
          </div>
          <div className="rm-top-actions">
            <span className="rm-pill is-info" title="All customers and data on this console are synthetic">Sandbox · synthetic book</span>
            <a className="rm-btn ghost" href="./?demo=1&screen=mitra" target="_blank" rel="noreferrer">Open customer app <Icon name="arrowUpRight" size={14} /></a>
            <button className="rm-btn ghost" onClick={() => { if (window.confirm('Reset the demo desk to its starting cases?')) { resetDesk(); toast('Demo desk reset'); } }}>Reset demo</button>
            <button className="rm-btn ghost" onClick={() => { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } setSignedIn(false); }}><Icon name="logout" size={14} /> Sign out</button>
          </div>
        </header>

        {view === 'overview' && <Overview book={book} desk={desk} now={now} openCases={openCases} pending={pending} onOpenCase={openCase} onOpenCustomer={openCustomer} onGo={go} />}
        {view === 'handoffs' && <RmHandoffs desk={desk} now={now} selectedId={caseId} onSelect={setCaseId} onOpenCustomer={openCustomer} toast={toast} />}
        {view === 'book' && (entry
          ? <RmCustomer360 entry={entry} desk={desk} onBack={() => setCustomerId(null)} onOpenCase={openCase} toast={toast} />
          : <Book book={book} desk={desk} onOpenCustomer={openCustomer} />)}
        {view === 'reviews' && <RmReviews desk={desk} book={book} now={now} onOpenCustomer={openCustomer} toast={toast} />}
        {view === 'compliance' && <RmCompliance book={book} desk={desk} onOpenCustomer={openCustomer} />}
        {view === 'audit' && <RmAudit desk={desk} />}
      </main>

      {toastMsg && <div className="rm-toast" role="status">{toastMsg}</div>}
    </div>
  );
}

function Overview({ book, desk, now, openCases, pending, onOpenCase, onOpenCustomer, onGo }) {
  const aum = book.reduce((s, b) => s + b.ins.aum, 0);
  const engaged = book.filter((b) => (b.persona.relationship?.mitraSessions30d || 0) >= 3).length;
  const breached = openCases.filter((c) => c.status !== 'SCHEDULED' && Date.parse(c.slaDueAt) < now).length;
  const atRisk = book.filter((b) => b.ins.flags.some((f) => f.level === 'high')).length;
  const products = {};
  book.forEach((b) => b.ins.opportunities.forEach((o) => {
    const k = o.id;
    products[k] ||= { name: o.product.replace(/ \(.*\)$/, ''), count: 0, value: 0 };
    products[k].count += 1; products[k].value += o.value;
  }));
  const pipeline = Object.values(products).sort((a, b) => b.count - a.count);
  const maxCount = Math.max(...pipeline.map((p) => p.count), 1);
  const reviewsDue = book.filter((b) => b.persona.relationship?.nextReview && Date.parse(b.persona.relationship.nextReview) - now < 7 * 864e5);

  return (
    <div className="rm-stack">
      <div className="rm-kpis">
        <Kpi label="Book AUM" value={fmtL(aum)} sub={`${book.length} relationships`} />
        <Kpi label="Active on MITRA" value={`${engaged}/${book.length}`} sub="3+ sessions in 30 days" />
        <Kpi label="Open handoffs" value={openCases.length} sub={breached ? `${breached} past SLA` : 'all within SLA'} tone={breached ? 'bad' : undefined} />
        <Kpi label="Awaiting your sign-off" value={pending.length} sub="maker–checker queue" tone={pending.length ? 'orange' : undefined} />
        <Kpi label="High-risk customers" value={atRisk} sub="liquidity / debt flags" tone={atRisk ? 'bad' : undefined} />
      </div>

      <div className="rm-two">
        <Card title="Today's priorities" aside={<button className="rm-link" onClick={() => onGo('handoffs')}>All handoffs →</button>}>
          {openCases.length === 0 && pending.length === 0 && <div className="rm-empty small">All caught up.</div>}
          {openCases.slice().sort((a, b) => (a.priority === 'High' ? -1 : 1) - (b.priority === 'High' ? -1 : 1) || Date.parse(a.slaDueAt) - Date.parse(b.slaDueAt)).map((c) => (
            <button className="rm-history" key={c.id} onClick={() => onOpenCase(c.id)}>
              <Avatar name={c.customerName} size={30} />
              <span className="grow"><strong>{c.customerName}</strong> — {c.topic}<br /><span className="rm-sub">{c.id} · {c.source} · {timeAgo(c.createdAt, now)}</span></span>
              <StatusPill status={c.status} /><SlaBadge item={c} now={now} />
            </button>
          ))}
          {pending.map((r) => (
            <button className="rm-history" key={r.id} onClick={() => onGo('reviews')}>
              <Avatar name={r.customerName} size={30} />
              <span className="grow"><strong>{r.customerName}</strong> — sign off: {r.recommendation}<br /><span className="rm-sub">{r.id} · {r.trigger}</span></span>
              <StatusPill status={r.status} />
            </button>
          ))}
        </Card>

        <div className="rm-stack">
          <Card title="Opportunity pipeline" aside={<span className="rm-tag">computed from customer data</span>}>
            {pipeline.map((p) => (
              <div key={p.name} className="rm-pipe">
                <span className="name">{p.name}</span>
                <div className="rm-meter"><i style={{ width: `${(p.count / maxCount) * 100}%` }} /></div>
                <span className="count">{p.count}</span>
              </div>
            ))}
          </Card>
          <Card title="Reviews due this week">
            {reviewsDue.length === 0 && <div className="rm-empty small">None.</div>}
            {reviewsDue.map((b) => (
              <button className="rm-history" key={b.persona.customer.id} onClick={() => onOpenCustomer(b.persona.customer.id)}>
                <Avatar name={b.persona.customer.name} size={26} /><span className="grow">{b.persona.customer.name}</span>
                <span className="rm-sub">{new Date(b.persona.relationship.nextReview).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
              </button>
            ))}
          </Card>
        </div>
      </div>

      <Card title="Who needs attention" aside={<button className="rm-link" onClick={() => onGo('book')}>Full book →</button>}>
        <BookTable book={book.slice(0, 5)} desk={desk} onOpenCustomer={onOpenCustomer} />
      </Card>
    </div>
  );
}

function Book({ book, desk, onOpenCustomer }) {
  const [q, setQ] = useState('');
  const [flag, setFlag] = useState('all');
  const rows = book.filter((b) => {
    const c = b.persona.customer;
    const text = `${c.name} ${c.id} ${c.segment} ${c.city}`.toLowerCase();
    return (!q || text.includes(q.toLowerCase())) && (flag === 'all' || b.ins.flags.some((f) => f.code === flag));
  });
  return (
    <Card>
      <div className="rm-filters">
        <input className="rm-search" placeholder="Search name, ID, segment, city…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={flag} onChange={(e) => setFlag(e.target.value)}>
          <option value="all">All customers</option>
          {['LIQUIDITY', 'DEBT', 'PROTECTION', 'SUITABILITY', 'INCOME', 'KYC', 'SENIOR', 'GOALS'].map((x) => <option key={x} value={x}>Flag: {x}</option>)}
        </select>
        <span className="rm-sub">Sorted by attention needed</span>
      </div>
      <BookTable book={rows} desk={desk} onOpenCustomer={onOpenCustomer} />
    </Card>
  );
}

function BookTable({ book, desk, onOpenCustomer }) {
  return (
    <div className="rm-table-wrap">
      <table className="rm-table rm-book">
        <thead>
          <tr><th>Customer</th><th>Segment</th><th>Risk</th><th style={{ textAlign: 'right' }}>AUM</th><th>Health</th><th>Top flag</th><th>Top opportunity</th><th>MITRA 30d</th><th>Open</th></tr>
        </thead>
        <tbody>
          {book.map(({ persona: p, ins, isNew }) => {
            const open = desk.cases.filter((c) => c.customerId === p.customer.id && c.status !== 'CLOSED').length
              + desk.reviews.filter((r) => r.customerId === p.customer.id && r.status === 'PENDING').length;
            const top = ins.flags.slice().sort((a, b) => ['high', 'medium', 'low'].indexOf(a.level) - ['high', 'medium', 'low'].indexOf(b.level))[0];
            return (
              <tr key={p.customer.id} onClick={() => onOpenCustomer(p.customer.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpenCustomer(p.customer.id)}>
                <td><div className="rm-cust"><Avatar name={p.customer.name} size={30} /><div><strong>{p.customer.name}</strong>{isNew && <span className="rm-pill is-info" style={{ marginLeft: 6 }}>New via MITRA</span>}<span>{p.customer.id} · {p.customer.age} · {p.customer.city}</span></div></div></td>
                <td>{p.customer.segment}</td>
                <td>{ins.riskProfile}</td>
                <td style={{ textAlign: 'right' }}>{fmtL(ins.aum)}</td>
                <td><span className={`rm-score ${ins.hs.total < 40 ? 'low' : ins.hs.total < 60 ? 'mid' : ''}`}>{ins.hs.total}</span></td>
                <td>{top ? <FlagPill level={top.level}>{top.code}</FlagPill> : '—'}</td>
                <td>{ins.opportunities[0]?.product || '—'}</td>
                <td>{p.relationship?.mitraSessions30d ?? 0}</td>
                <td>{open ? <b className="rm-badge inline">{open}</b> : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
