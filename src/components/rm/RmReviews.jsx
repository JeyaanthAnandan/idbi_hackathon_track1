import React, { useState } from 'react';
import Icon from '../Icons.jsx';
import { decideReview, REVIEW_RULES } from '../../engine/rmDesk.js';
import { Avatar, Card, FlagPill, StatusPill, dateTime, fmt, fmtL, timeAgo } from './ui.jsx';

// Maker–checker: MITRA (maker) proposes, a licensed human (checker) signs
// off before anything above policy thresholds reaches the customer as a
// recommendation. Every decision is written to the audit chain.
export default function RmReviews({ desk, book, now, onOpenCustomer, toast }) {
  const [filter, setFilter] = useState('PENDING');
  const [selectedId, setSelectedId] = useState(null);
  const items = desk.reviews.filter((r) => filter === 'all' || (filter === 'PENDING' ? r.status === 'PENDING' : r.status !== 'PENDING'));
  const selected = desk.reviews.find((r) => r.id === selectedId) || items[0] || null;

  return (
    <div className="rm-split">
      <div className="rm-list">
        <div className="rm-seg">
          {[['PENDING', 'Pending'], ['done', 'Decided'], ['all', 'All']].map(([id, label]) => (
            <button key={id} className={filter === id ? 'is-on' : ''} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        <div className="rm-policy-note">
          Policy <span className="rm-mono">{REVIEW_RULES.version}</span>: SIP ≥ {fmt(REVIEW_RULES.sipMonthly)}/mo, lump sum ≥ {fmt(REVIEW_RULES.lumpSum)},
          any customer aged {REVIEW_RULES.seniorAge}+, or a protection gap with dependents needs a human checker.
        </div>
        {items.length === 0 && <div className="rm-empty">Queue is clear.</div>}
        {items.map((r) => (
          <button key={r.id} className={`rm-list-item ${selected?.id === r.id ? 'is-on' : ''}`} onClick={() => setSelectedId(r.id)}>
            <div className="rm-list-top">
              <Avatar name={r.customerName} size={32} />
              <div className="rm-list-name"><strong>{r.customerName}</strong><span>{r.id} · {timeAgo(r.createdAt, now)}</span></div>
            </div>
            <div className="rm-list-topic">{r.recommendation}</div>
            <div className="rm-list-tags"><StatusPill status={r.status} /><span className="rm-tag">{r.trigger}</span></div>
          </button>
        ))}
      </div>
      {selected ? <ReviewDetail key={selected.id} r={selected} entry={book.find((b) => b.persona.customer.id === selected.customerId)} onOpenCustomer={onOpenCustomer} toast={toast} /> : <div className="rm-detail rm-empty">Select a recommendation.</div>}
    </div>
  );
}

function ReviewDetail({ r, entry, onOpenCustomer, toast }) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const ins = entry?.ins;

  // Live suitability checks against the customer's current facts — the
  // checker sees whether the advice still fits, not just what MITRA said.
  const checks = ins ? [
    { ok: ins.hs.emergencyMonths >= 3 || r.type === 'protection', text: `Emergency cover ${ins.hs.emergencyMonths.toFixed(1)} months ${ins.hs.emergencyMonths >= 3 ? '≥' : '<'} 3 before new investment` },
    { ok: ins.emiRatio <= 35, text: `EMI burden ${ins.emiRatio.toFixed(0)}% of income (ceiling 35%)` },
    { ok: r.type !== 'sip' || r.amount <= Math.max(ins.cf.surplus, 0) + ins.cf.avgInvested, text: r.type === 'sip' ? `Amount ${fmt(r.amount)} vs capacity ${fmt(Math.max(ins.cf.surplus, 0) + ins.cf.avgInvested)}/mo` : 'Amount within capacity (n/a)' },
    { ok: !(ins.pg.available && ins.pg.termGap > 0 && (ins.pg.dependents || 0) >= 2) || r.type === 'protection', text: ins.pg.termGap > 0 ? `Life-cover gap ${fmtL(ins.pg.termGap)} with ${ins.pg.dependents ?? 0} dependents` : 'Life cover meets policy' },
    { ok: entry.persona.customer.age < 60 || r.type !== 'sip', text: `Age ${entry.persona.customer.age} vs product horizon` },
  ] : [];

  const decide = (status) => {
    if (status !== 'APPROVED' && !comment.trim()) { setError(status === 'REJECTED' ? 'A reason is required to reject.' : 'Describe the change you made.'); return; }
    decideReview(r.id, { status, comment: comment.trim() });
    toast(`${r.id} ${status === 'APPROVED' ? 'approved' : status === 'MODIFIED' ? 'approved with changes' : 'rejected'} · logged to audit chain`);
  };

  return (
    <div className="rm-detail">
      <div className="rm-detail-head">
        <Avatar name={r.customerName} size={48} />
        <div>
          <h2>{r.customerName}</h2>
          <div className="rm-sub">{r.customerId} · raised {dateTime(r.createdAt)} by MITRA</div>
          <div className="rm-list-tags" style={{ marginTop: 8 }}><StatusPill status={r.status} /><span className="rm-tag">Trigger: {r.trigger}</span></div>
        </div>
        {entry && <button className="rm-btn ghost" style={{ marginLeft: 'auto' }} onClick={() => onOpenCustomer(r.customerId)}>Customer 360 <Icon name="arrowUpRight" size={14} /></button>}
      </div>

      <Card title="MITRA recommendation">
        <p className="rm-topic">{r.recommendation}</p>
        {r.amount > 0 && <div className="rm-sub">Amount: {fmt(r.amount)}{r.type === 'sip' ? '/month' : ''}</div>}
      </Card>

      <div className="rm-two">
        <Card title="Advice Passport" aside={<span className="rm-tag">{r.passport.engineMode}</span>}>
          <div className="rm-meta-grid">
            <div><span>Policy</span><span className="rm-mono">{r.passport.policyVersion}</span></div>
            <div><span>Confidence</span>{Math.round(r.passport.confidence * 100)}%</div>
          </div>
          <div className="rm-kicker" style={{ marginTop: 12 }}>Formula</div>
          <div className="rm-sub">{r.passport.formula}</div>
          <div className="rm-kicker" style={{ marginTop: 12 }}>Evidence</div>
          <table className="rm-table compact">
            <tbody>{r.passport.evidence.map(([k, v]) => <tr key={k}><td className="rm-mono">{k}</td><td style={{ textAlign: 'right' }}>{v}</td></tr>)}</tbody>
          </table>
        </Card>
        <Card title="Suitability check · live data">
          {!ins && <div className="rm-empty small">Customer is new to the book — verify suitability manually.</div>}
          {checks.map((x, i) => (
            <div className="rm-flag" key={i}><FlagPill level={x.ok ? 'low' : 'high'}>{x.ok ? 'PASS' : 'CHECK'}</FlagPill><span>{x.text}</span></div>
          ))}
        </Card>
      </div>

      {r.status === 'PENDING' ? (
        <Card title="Checker decision">
          <textarea className="rm-textarea" rows={3} value={comment} onChange={(e) => { setComment(e.target.value); setError(''); }} placeholder="Comment (required to modify or reject) — e.g. reduce SIP to ₹40,000 until term cover is in place" />
          {error && <div className="rm-error">{error}</div>}
          <div className="rm-actions" style={{ marginTop: 10 }}>
            <button className="rm-btn primary" onClick={() => decide('APPROVED')}><Icon name="check" size={15} /> Approve</button>
            <button className="rm-btn" onClick={() => decide('MODIFIED')}>Approve with changes</button>
            <button className="rm-btn danger" onClick={() => decide('REJECTED')}>Reject</button>
          </div>
        </Card>
      ) : (
        <Card title="Decision">
          <div className="rm-note"><span>{dateTime(r.decision.at)} · {r.decision.by}</span><StatusPill status={r.status} /> {r.decision.comment || 'No comment'}</div>
        </Card>
      )}
    </div>
  );
}
