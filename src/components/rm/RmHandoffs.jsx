import React, { useEffect, useState } from 'react';
import Icon from '../Icons.jsx';
import { findInBook, RM_PROFILE } from '../../data/rmBook.js';
import { talkingPoints } from '../../engine/rmInsights.js';
import {
  acceptCase, addCaseNote, closeCase, defaultBookingMessage, reassignCase, scheduleCase,
} from '../../engine/rmDesk.js';
import { Avatar, Card, SlaBadge, StatusPill, dateTime, timeAgo } from './ui.jsx';

const CHANNELS = ['Phone call', 'Video call', 'Branch visit'];
const LANGUAGES = ['English', 'Hindi', 'Marathi', 'Tamil', 'Telugu', 'Bengali', 'Gujarati', 'Kannada', 'Malayalam', 'Punjabi'];
const OUTCOMES = ['Advice given', 'Product application started', 'Referred to specialist', 'Customer not reachable', 'No action needed'];
const FILTERS = [['open', 'Open'], ['NEW', 'New'], ['SCHEDULED', 'Booked'], ['CLOSED', 'Closed']];

export const sortCases = (cases) => cases.slice().sort((a, b) =>
  (a.status === 'CLOSED') - (b.status === 'CLOSED')
  || (a.priority === 'High' ? -1 : 0) - (b.priority === 'High' ? -1 : 0)
  || Date.parse(a.slaDueAt) - Date.parse(b.slaDueAt));

// Default slot: an hour out, on the half hour, as <input type=datetime-local> wants it.
function defaultSlot() {
  const d = new Date(Date.now() + 60 * 60000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function RmHandoffs({ desk, now, selected, onSelect, onOpenCustomer, onDraft, toast }) {
  const [filter, setFilter] = useState('open');
  const cases = sortCases(desk.cases.filter((c) => (filter === 'open' ? c.status !== 'CLOSED' : c.status === filter)));

  return (
    <div className="rm-split">
      <div className="rm-list">
        <div className="rm-seg" role="tablist" aria-label="Filter cases">
          {FILTERS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={filter === id} className={filter === id ? 'is-on' : ''} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        {cases.length === 0 && <div className="rm-empty">Nothing here. New MITRA handoffs land at the top.</div>}
        {cases.map((c) => (
          <button key={c.id} className={`rm-list-item ${selected?.id === c.id ? 'is-on' : ''}`} onClick={() => onSelect(c.id)}>
            <div className="rm-list-top">
              <Avatar name={c.customerName} size={32} tone={c.priority === 'High' && c.status !== 'CLOSED' ? 'high' : undefined} />
              <div className="rm-list-name">
                <strong>{c.customerName}</strong>
                <span>{c.id} · {timeAgo(c.createdAt, now)}</span>
              </div>
              {c.priority === 'High' && c.status !== 'CLOSED' && <span className="rm-dot-high" title="High priority" />}
            </div>
            <div className="rm-list-topic">{c.topic}</div>
            <div className="rm-list-tags"><StatusPill status={c.status} /><SlaBadge item={c} now={now} /></div>
          </button>
        ))}
      </div>
      {selected
        ? <CaseDetail key={selected.id} c={selected} now={now} onOpenCustomer={onOpenCustomer} onDraft={onDraft} toast={toast} />
        : <div className="rm-detail rm-empty">Select a case.</div>}
    </div>
  );
}

function CaseDetail({ c, now, onOpenCustomer, onDraft, toast }) {
  const [mode, setMode] = useState(null); // 'note' | 'close'
  const [slot, setSlot] = useState(defaultSlot());
  const [channel, setChannel] = useState(c.channel || CHANNELS[0]);
  const [language, setLanguage] = useState(LANGUAGES.includes(c.language) ? c.language : 'English');
  const [message, setMessage] = useState('');
  const [edited, setEdited] = useState(false);
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState(OUTCOMES[0]);
  const [summary, setSummary] = useState('');
  const inBook = findInBook(c.customerId);
  const points = inBook ? talkingPoints(inBook) : [];
  const open = c.status !== 'CLOSED';
  const first = c.customerName.replace(/^Dr\.\s*/, '').split(' ')[0];

  // Until the RM types their own words, the message follows the booking fields.
  const auto = slot ? defaultBookingMessage({ when: new Date(slot).toISOString(), channel, language }) : '';
  const text = edited ? message : auto;
  const draft = mode === 'close' ? summary.trim() : open ? text : '';
  useEffect(() => { onDraft(draft || null); }, [draft]);
  useEffect(() => () => onDraft(null), []);
  useEffect(() => setMode(null), [c.status]);

  const meta = inBook ? `${inBook.customer.age} · ${inBook.customer.segment} · ${inBook.customer.city}` : c.snapshot ? `${c.snapshot.age ?? '—'} · ${c.snapshot.segment || 'New to book'} · ${c.snapshot.city || ''}` : 'New to book';

  return (
    <div className="rm-detail">
      <div className="rm-detail-head">
        <Avatar name={c.customerName} size={48} tone={c.priority === 'High' && open ? 'high' : undefined} />
        <div style={{ minWidth: 0 }}>
          <h2>{c.customerName}</h2>
          <div className="rm-sub">{c.customerId} · {meta}</div>
        </div>
        <div className="rm-detail-head-right">
          <SlaBadge item={c} now={now} />
          <button className="rm-pillbtn outline" onClick={() => onOpenCustomer(c.customerId)}>Customer 360 <Icon name="arrowUpRight" size={13} /></button>
        </div>
      </div>

      <section className="rm-hero quote">
        <div className="rm-hero-arc a" />
        <div className="rm-kicker on-night">In {first}'s words · {c.language}{c.language !== 'English' ? ', translated by MITRA' : ''} · {c.source}</div>
        <p className="rm-quote">“{c.question || c.topic}”</p>
        <div className="rm-list-tags">
          <span className="rm-night-tag">{c.riskProfile}</span>
          <span className="rm-night-tag">{c.priority} priority</span>
          {c.preferredSlot && <span className="rm-night-tag">Prefers {c.preferredSlot.toLowerCase()}</span>}
          <span className="rm-night-tag ok">Consent: contact {c.consent.contact ? '✓' : '✗'} · share context {c.consent.dataShare ? '✓' : '✗'}</span>
        </div>
      </section>

      <div className="rm-two">
        <Card title="What MITRA already knows">
          <ul className="rm-brief">{c.brief.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </Card>
        <Card title={<span className="rm-kicker orange">● Talking points · computed by MITRA</span>}>
          {points.length === 0 && <div className="rm-empty small">New to your book — use the MITRA briefing.</div>}
          <ol className="rm-points">
            {points.slice(0, 3).map((t, i) => <li key={t.title}><b>{i + 1}</b><span><strong>{t.title}</strong> {t.text}</span></li>)}
          </ol>
        </Card>
      </div>

      {open && (
        <Card title={c.status === 'SCHEDULED' ? 'Reschedule or follow up' : 'Book the call'} aside={<span className="rm-sub">Every action joins the audit chain and appears in {first}'s MITRA chat</span>}>
          <div className="rm-actions">
            {c.status === 'NEW' && (
              <button className="rm-pillbtn primary solid" onClick={() => { acceptCase(c.id); toast(`${c.id} accepted · ${first} sees it in MITRA`); }}>
                <Icon name="check" size={15} /> Accept case
              </button>
            )}
            <button className={`rm-pillbtn outline ${mode === 'note' ? 'is-on' : ''}`} onClick={() => setMode(mode === 'note' ? null : 'note')}>Add note</button>
            <button className={`rm-pillbtn outline ${mode === 'close' ? 'is-on' : ''}`} onClick={() => setMode(mode === 'close' ? null : 'close')}>Close with outcome</button>
            {c.assignedTo !== RM_PROFILE.supervisor && (
              <button className="rm-pillbtn outline" onClick={() => { reassignCase(c.id, RM_PROFILE.supervisor); toast(`Escalated to ${RM_PROFILE.supervisor}`); }}>Escalate</button>
            )}
          </div>

          {mode === null && (
            <form className="rm-form" onSubmit={(e) => {
              e.preventDefault();
              scheduleCase(c.id, { when: new Date(slot).toISOString(), channel, language, message: text });
              setEdited(false);
              toast(`Booked · ${first} sees the confirmation in MITRA`);
            }}>
              <div className="rm-form-row">
                <label>Date &amp; time<input type="datetime-local" value={slot} onChange={(e) => setSlot(e.target.value)} required /></label>
                <label>Channel<select value={channel} onChange={(e) => setChannel(e.target.value)}>{CHANNELS.map((x) => <option key={x}>{x}</option>)}</select></label>
                <label>Language<select value={language} onChange={(e) => setLanguage(e.target.value)}>{LANGUAGES.map((x) => <option key={x}>{x}</option>)}</select></label>
              </div>
              <label className="wide">Message {first} will see in MITRA
                <textarea rows={3} value={text} onChange={(e) => { setEdited(true); setMessage(e.target.value); }} required />
              </label>
              <div className="rm-form-foot">
                <button className="rm-pillbtn night" type="submit">Confirm and send to MITRA →</button>
                {edited && <button type="button" className="rm-link" onClick={() => setEdited(false)}>Reset message</button>}
                <span className="rm-sub">Preview on the right is exactly what {first} will see.</span>
              </div>
            </form>
          )}
          {mode === 'note' && (
            <form className="rm-form" onSubmit={(e) => { e.preventDefault(); if (!note.trim()) return; addCaseNote(c.id, note.trim()); setNote(''); setMode(null); toast('Note saved to case and CRM'); }}>
              <label className="wide">Call note (internal — never shown to the customer)<textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was discussed, what the customer decided, follow-ups…" required /></label>
              <div className="rm-form-foot"><button className="rm-pillbtn primary solid" type="submit">Save note</button></div>
            </form>
          )}
          {mode === 'close' && (
            <form className="rm-form" onSubmit={(e) => { e.preventDefault(); closeCase(c.id, { outcome, message: summary.trim() || null }); toast(`${c.id} closed · ${outcome}`); }}>
              <div className="rm-form-row"><label>Outcome<select value={outcome} onChange={(e) => setOutcome(e.target.value)}>{OUTCOMES.map((x) => <option key={x}>{x}</option>)}</select></label></div>
              <label className="wide">Summary sent to {first} in MITRA (optional)<textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. As discussed, we'll review your term cover options on Friday." /></label>
              <div className="rm-form-foot"><button className="rm-pillbtn primary solid" type="submit">Close case</button></div>
            </form>
          )}
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
        <Card title={`Notes (${c.notes.length})`} aside={<span className="rm-kicker">Internal · synced to CRM</span>}>
          {c.notes.length === 0 ? <div className="rm-empty small">No notes yet. Only the message above reaches the customer.</div> : c.notes.slice().reverse().map((n, i) => (
            <div className="rm-note" key={i}><span>{dateTime(n.at)} · {n.by}</span>{n.text}</div>
          ))}
          {c.outcome && <div className="rm-outcome">Outcome: <strong>{c.outcome}</strong> <StatusPill status={c.status} /></div>}
        </Card>
      </div>
    </div>
  );
}
