import React, { useEffect, useState } from 'react';
import Icon from '../Icons.jsx';
import { findInBook, RM_PROFILE } from '../../data/rmBook.js';
import { acceptCase, addCaseNote, closeCase, reassignCase, scheduleCase } from '../../engine/rmDesk.js';
import { Avatar, Card, SlaBadge, StatusPill, dateTime, timeAgo } from './ui.jsx';

const CHANNELS = ['Phone call', 'Video call', 'Branch visit'];
const OUTCOMES = ['Advice given', 'Product application started', 'Referred to specialist', 'Customer not reachable', 'No action needed'];
const FILTERS = [['open', 'Open'], ['NEW', 'New'], ['SCHEDULED', 'Scheduled'], ['CLOSED', 'Closed'], ['all', 'All']];

// Default slot: next half hour, at least 30 minutes out, in local time for <input type=datetime-local>.
function defaultSlot() {
  const d = new Date(Date.now() + 60 * 60000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function RmHandoffs({ desk, now, selectedId, onSelect, onOpenCustomer, toast }) {
  const [filter, setFilter] = useState('open');
  const cases = desk.cases
    .filter((c) => filter === 'all' || (filter === 'open' ? c.status !== 'CLOSED' : c.status === filter))
    .sort((a, b) => (a.status === 'CLOSED') - (b.status === 'CLOSED') || (a.priority === 'High' ? -1 : 0) - (b.priority === 'High' ? -1 : 0) || Date.parse(a.slaDueAt) - Date.parse(b.slaDueAt));
  const selected = desk.cases.find((c) => c.id === selectedId) || cases[0] || null;

  return (
    <div className="rm-split">
      <div className="rm-list">
        <div className="rm-seg" role="tablist">
          {FILTERS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={filter === id} className={filter === id ? 'is-on' : ''} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        {cases.length === 0 && <div className="rm-empty">Nothing here. New MITRA handoffs land at the top of this list.</div>}
        {cases.map((c) => (
          <button key={c.id} className={`rm-list-item ${selected?.id === c.id ? 'is-on' : ''}`} onClick={() => onSelect(c.id)}>
            <div className="rm-list-top">
              <Avatar name={c.customerName} size={32} />
              <div className="rm-list-name">
                <strong>{c.customerName}</strong>
                <span>{c.id} · {timeAgo(c.createdAt, now)}</span>
              </div>
              {c.priority === 'High' && c.status !== 'CLOSED' && <span className="rm-dot-high" title="High priority" />}
            </div>
            <div className="rm-list-topic">{c.topic}</div>
            <div className="rm-list-tags"><StatusPill status={c.status} /><SlaBadge item={c} now={now} /><span className="rm-tag">{c.source}</span></div>
          </button>
        ))}
      </div>
      {selected ? <CaseDetail key={selected.id} c={selected} now={now} onOpenCustomer={onOpenCustomer} toast={toast} /> : <div className="rm-detail rm-empty">Select a case.</div>}
    </div>
  );
}

function CaseDetail({ c, now, onOpenCustomer, toast }) {
  const [mode, setMode] = useState(null); // 'schedule' | 'note' | 'close'
  const [slot, setSlot] = useState(defaultSlot());
  const [channel, setChannel] = useState(c.channel || CHANNELS[0]);
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState(OUTCOMES[0]);
  const [message, setMessage] = useState('');
  const inBook = findInBook(c.customerId);
  useEffect(() => setMode(null), [c.status]);

  const open = c.status !== 'CLOSED';

  return (
    <div className="rm-detail">
      <div className="rm-detail-head">
        <Avatar name={c.customerName} size={48} />
        <div style={{ minWidth: 0 }}>
          <h2>{c.customerName}</h2>
          <div className="rm-sub">
            {c.customerId} · {inBook ? `${inBook.customer.age} · ${inBook.customer.segment} · ${inBook.customer.city}` : c.snapshot ? `${c.snapshot.age ?? '—'} · ${c.snapshot.segment || 'New to book'} · ${c.snapshot.city || ''}` : 'New to book'}
          </div>
          <div className="rm-list-tags" style={{ marginTop: 8 }}>
            <StatusPill status={c.status} /><SlaBadge item={c} now={now} />
            <span className="rm-tag">{c.priority} priority</span><span className="rm-tag">{c.language}</span><span className="rm-tag">{c.riskProfile}</span>
          </div>
        </div>
        <button className="rm-btn ghost" onClick={() => onOpenCustomer(c.customerId)} style={{ marginLeft: 'auto', flexShrink: 0 }}>
          Customer 360 <Icon name="arrowUpRight" size={14} />
        </button>
      </div>

      <Card title="Why the customer asked" aside={<span className="rm-tag">via {c.source}</span>}>
        <p className="rm-topic">{c.topic}</p>
        <div className="rm-kicker">MITRA briefing · what you already know</div>
        <ul className="rm-brief">{c.brief.map((b, i) => <li key={i}>{b}</li>)}</ul>
        <div className="rm-meta-grid">
          <div><span>Preferred slot</span>{c.preferredSlot || '—'}</div>
          <div><span>Channel</span>{c.channel}</div>
          <div><span>Raised</span>{dateTime(c.createdAt)}</div>
          <div><span>SLA due</span>{dateTime(c.slaDueAt)}</div>
          <div><span>Assigned to</span>{c.assignedTo || 'Unassigned'}</div>
          <div><span>Booked for</span>{c.scheduledFor ? dateTime(c.scheduledFor) : '—'}</div>
        </div>
        <div className="rm-consent">
          <Icon name="lock" size={14} /> Consent recorded {dateTime(c.consent.at)} · contact {c.consent.contact ? '✓' : '✗'} · share MITRA context {c.consent.dataShare ? '✓' : '✗'}
        </div>
      </Card>

      {open && (
        <Card title="Actions">
          <div className="rm-actions">
            {c.status === 'NEW' && (
              <button className="rm-btn primary" onClick={() => { acceptCase(c.id); toast(`${c.id} accepted · customer notified in MITRA`); }}>
                <Icon name="check" size={15} /> Accept case
              </button>
            )}
            <button className={`rm-btn ${mode === 'schedule' ? 'is-on' : ''}`} onClick={() => setMode(mode === 'schedule' ? null : 'schedule')}><Icon name="clock" size={15} /> {c.scheduledFor ? 'Reschedule' : 'Schedule'}</button>
            <button className={`rm-btn ${mode === 'note' ? 'is-on' : ''}`} onClick={() => setMode(mode === 'note' ? null : 'note')}><Icon name="list" size={15} /> Add call note</button>
            <button className={`rm-btn ${mode === 'close' ? 'is-on' : ''}`} onClick={() => setMode(mode === 'close' ? null : 'close')}><Icon name="receipt" size={15} /> Close with outcome</button>
            {c.assignedTo !== RM_PROFILE.supervisor && (
              <button className="rm-btn ghost" onClick={() => { reassignCase(c.id, RM_PROFILE.supervisor); toast(`Escalated to ${RM_PROFILE.supervisor}`); }}>Escalate</button>
            )}
          </div>

          {mode === 'schedule' && (
            <form className="rm-form" onSubmit={(e) => { e.preventDefault(); scheduleCase(c.id, { when: new Date(slot).toISOString(), channel }); toast('Booked · confirmation sent to the customer through MITRA'); }}>
              <label>Date & time<input type="datetime-local" value={slot} onChange={(e) => setSlot(e.target.value)} required /></label>
              <label>Channel<select value={channel} onChange={(e) => setChannel(e.target.value)}>{CHANNELS.map((x) => <option key={x}>{x}</option>)}</select></label>
              <button className="rm-btn primary" type="submit">Confirm booking</button>
            </form>
          )}
          {mode === 'note' && (
            <form className="rm-form" onSubmit={(e) => { e.preventDefault(); if (!note.trim()) return; addCaseNote(c.id, note.trim()); setNote(''); setMode(null); toast('Note saved to case and CRM'); }}>
              <label className="wide">Call note (internal)<textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was discussed, what the customer decided, follow-ups…" required /></label>
              <button className="rm-btn primary" type="submit">Save note</button>
            </form>
          )}
          {mode === 'close' && (
            <form className="rm-form" onSubmit={(e) => { e.preventDefault(); closeCase(c.id, { outcome, message: message.trim() || null }); toast(`${c.id} closed · ${outcome}`); }}>
              <label>Outcome<select value={outcome} onChange={(e) => setOutcome(e.target.value)}>{OUTCOMES.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label className="wide">Summary sent to the customer in MITRA (optional)<textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. As discussed, we'll review your term cover options on Friday." /></label>
              <button className="rm-btn primary" type="submit">Close case</button>
            </form>
          )}
        </Card>
      )}

      {c.customerMessage && (
        <Card title="Latest update shown to the customer in MITRA">
          <div className="rm-customer-msg">“{c.customerMessage}”</div>
        </Card>
      )}

      <div className="rm-two">
        <Card title="Timeline">
          <ol className="rm-timeline">
            {c.timeline.slice().reverse().map((t, i) => (
              <li key={i}><span>{dateTime(t.at)} · {t.by}</span>{t.event}</li>
            ))}
          </ol>
        </Card>
        <Card title={`Notes (${c.notes.length})`}>
          {c.notes.length === 0 ? <div className="rm-empty small">No notes yet.</div> : c.notes.slice().reverse().map((n, i) => (
            <div className="rm-note" key={i}><span>{dateTime(n.at)} · {n.by}</span>{n.text}</div>
          ))}
          {c.outcome && <div className="rm-outcome">Outcome: <strong>{c.outcome}</strong></div>}
        </Card>
      </div>
    </div>
  );
}
