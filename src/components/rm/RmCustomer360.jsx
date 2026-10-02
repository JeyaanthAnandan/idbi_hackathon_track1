import React, { useState } from 'react';
import Icon from '../Icons.jsx';
import { ScoreRing } from '../charts.jsx';
import { logRmAction } from '../../engine/rmDesk.js';
import { POLICY } from '../../data/policy.js';
import {
  Avatar, Card, FlagPill, Meter, StatusPill, dateOnly, dateTime, fmt, fmtL,
} from './ui.jsx';

// One customer on one screen, laid out like the customer's own MITRA
// Home: the same hero figure, the same "MITRA found something" cards, the
// same goals. "Banker view" adds the layers only the bank sees — risk
// flags, loans, the rule behind each opportunity, relationship history —
// each marked with a Banker layer tag. "What they see" hides them.
export default function RmCustomer360({ entry, desk, onBack, onOpenCase, toast }) {
  const [banker, setBanker] = useState(true);
  const { persona: p, ins } = entry;
  const c = p.customer;
  const rel = p.relationship || {};
  const first = c.name.replace(/^Dr\.\s*/, '').split(' ')[0];
  const cases = desk.cases.filter((x) => x.customerId === c.id);
  const reviews = desk.reviews.filter((x) => x.customerId === c.id);
  const loans = p.loans || [];
  const loanTotal = loans.reduce((s, l) => s + l.balance, 0);
  const maxIncome = Math.max(...p.monthlySummary.map((m) => m.income), 1);
  const lastDays = rel.lastContact ? Math.round((Date.now() - Date.parse(rel.lastContact)) / 864e5) : null;

  const printBrief = () => { logRmAction('brief.printed', c.id, 'Meeting brief'); window.print(); };
  const layer = banker ? <span className="rm-layer">Banker layer</span> : null;

  return (
    <div className="rm-360">
      <div className="rm-360-head">
        <button className="rm-pillbtn outline" onClick={onBack}>← Book</button>
        <Avatar name={c.name} size={52} tone={ins.flags.some((f) => f.level === 'high') ? 'high' : undefined} />
        <div className="rm-360-id">
          <h2>{c.name}</h2>
          <div className="rm-sub">{c.age} · {c.city} · {rel.language || 'English'} · customer since {c.relationshipSince}{banker && rel.phone ? ` · ${rel.phone}` : ''}</div>
          {banker && (
            <div className="rm-list-tags" style={{ marginTop: 8 }}>
              <span className="rm-pill is-bad">Priority {ins.priority}</span>
              <span className="rm-tag">{ins.riskProfile} risk profile</span>
              <span className="rm-tag">KYC risk {c.kycRisk}</span>
              <span className={`rm-tag ${lastDays === null || lastDays > 90 ? 'warn' : ''}`}>Last RM contact {rel.lastContact ? `${dateOnly(rel.lastContact)} · ${lastDays}d` : 'never'}</span>
              {rel.nextReview && <span className="rm-tag ok">Review due {dateOnly(rel.nextReview)}</span>}
            </div>
          )}
        </div>
        <div className="rm-360-actions no-print">
          <div className="rm-toggle" role="group" aria-label="View">
            <button type="button" aria-pressed={!banker} className={!banker ? 'is-on' : ''} onClick={() => setBanker(false)}>What {first} sees</button>
            <button type="button" aria-pressed={banker} className={banker ? 'is-on' : ''} onClick={() => setBanker(true)}>Banker view</button>
          </div>
          <button className="rm-pillbtn primary solid" onClick={() => { logRmAction('customer.call', c.id, rel.language || 'English'); toast(`Calling ${first} in ${rel.language || 'English'} · logged to the audit chain`); }}>
            <Icon name="phone" size={15} /> Call in {rel.language || 'English'}
          </button>
          <button className="rm-pillbtn outline" onClick={printBrief}><Icon name="receipt" size={15} /> Review pack</button>
        </div>
      </div>

      <section className="rm-hero">
        <div className="rm-hero-arc a" />
        <div className="rm-hero-main">
          <div className="rm-kicker on-night">Assets with IDBI · the same figure {first} sees in MITRA</div>
          <div className="rm-hero-figure">{fmt(ins.aum)}</div>
          {banker && loanTotal > 0 && <div className="rm-hero-sub">Loans outstanding {fmt(loanTotal)} <span className="rm-layer warm">Banker layer</span></div>}
        </div>
        <div className="rm-hero-stats">
          <div><span className="rm-kicker on-night">Health</span><strong>{ins.hs.total}</strong><small>{ins.hs.grade}</small></div>
          <div className="accent"><span className="rm-kicker on-night">Surplus / mo</span><strong>{fmt(Math.max(ins.cf.surplus, 0))}</strong><small>{ins.cf.incomeVolatility > 12 ? `swings ±${ins.cf.incomeVolatility.toFixed(0)}%` : `saves ${ins.cf.savingsRate.toFixed(0)}%`}</small></div>
          {banker && ins.emi > 0
            ? <div className={ins.emiRatio > 35 ? 'bad' : ''}><span className="rm-kicker on-night">EMI load</span><strong>{ins.emiRatio.toFixed(0)}%</strong><small>ceiling 35%</small></div>
            : <div><span className="rm-kicker on-night">Emergency</span><strong>{ins.hs.emergencyMonths.toFixed(1)}</strong><small>of {POLICY.emergency.targetMonths} months</small></div>}
        </div>
      </section>

      <div className="rm-two">
        {ins.opportunities.slice(0, banker ? 1 : 2).map((o) => (
          <section className="rm-card rm-insight col" key={o.id}>
            <div className="rm-kicker orange">● MITRA found something · shown to {first}</div>
            <h2>{o.product}{o.value ? `: ${fmtL(o.value)}` : ''}</h2>
            <p>{o.detail}</p>
            {banker && (
              <>
                <div className="rm-actions no-print">
                  <button className="rm-pillbtn primary solid" onClick={() => { logRmAction('opportunity.nudge', c.id, o.product); toast(`MITRA will raise "${o.product}" with ${first} next session`); }}>Nudge via MITRA</button>
                  <button className="rm-pillbtn outline" onClick={() => { logRmAction('opportunity.discussed', c.id, o.product); toast('Logged as discussed'); }}>Discussed</button>
                </div>
                <div className="rm-rule">Rule · {o.rule} · {POLICY.version}</div>
              </>
            )}
          </section>
        ))}
        {banker && (
          <Card title="Risk & compliance" aside={layer}>
            {ins.flags.length === 0 && <div className="rm-empty small">No flags.</div>}
            {ins.flags.map((f, i) => (
              <div className="rm-flag" key={i}><FlagPill level={f.level}>{f.level === 'high' ? 'High' : f.level === 'medium' ? 'Med' : 'Low'}</FlagPill><span>{f.text}</span></div>
            ))}
          </Card>
        )}
      </div>

      {banker && ins.opportunities.length > 1 && (
        <Card title="What to discuss, in order" aside={<span className="rm-kicker">buffer → protect → tax → invest</span>}>
          {ins.opportunities.map((o, i) => (
            <div className="rm-opp" key={o.id}>
              <b className="rm-opp-n">{i + 1}</b>
              <div className="grow">
                <div><strong>{o.product}</strong> <span className="rm-tag">rule · {o.rule}</span></div>
                <div className="rm-sub">{o.detail}</div>
              </div>
              {o.value > 0 && <span className="rm-opp-value">{fmtL(o.value)}</span>}
            </div>
          ))}
        </Card>
      )}

      <div className="rm-grid-3">
        <Card title="Financial health">
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <ScoreRing score={ins.hs.total} size={92} label={ins.hs.grade} />
            <div style={{ flex: 1, display: 'grid', gap: 9 }}>
              {ins.hs.parts.map((x) => (
                <div key={x.label}>
                  <div className="rm-row-label"><span>{x.label}</span><span>{x.score.toFixed(0)}/{x.max}</span></div>
                  <Meter value={x.score} max={x.max} tone={x.score / x.max < 0.35 ? 'red' : x.score / x.max < 0.7 ? 'orange' : 'teal'} />
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card title={`Allocation vs ${ins.riskProfile} target`}>
          <table className="rm-table compact">
            <thead><tr><th>Bucket</th><th>Now</th><th>Target</th><th>Gap</th></tr></thead>
            <tbody>
              {ins.dr.rows.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td><td>{r.current.toFixed(0)}%</td><td>{r.target}%</td>
                  <td className={Math.abs(r.gap) > 15 ? 'rm-neg' : ''}>{r.gap > 0 ? '+' : ''}{r.gap.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Cash flow · 6 months">
          <div className="rm-bars">
            {p.monthlySummary.map((m) => (
              <div key={m.month} className="rm-bar-col" title={`${m.month}: in ${fmt(m.income)} · out ${fmt(m.spend)}`}>
                <div className="rm-bar-pair">
                  <i style={{ height: `${(m.income / maxIncome) * 100}%` }} />
                  <i className="out" style={{ height: `${(m.spend / maxIncome) * 100}%` }} />
                </div>
                <span>{m.month}</span>
              </div>
            ))}
          </div>
          <div className="rm-legend"><span><i /> Income</span><span><i className="out" /> Spend</span>{banker && ins.emi > 0 && <span>EMI {fmt(ins.emi)}/mo</span>}</div>
        </Card>
      </div>

      <div className="rm-two">
        <Card title="Goals · the same plan as their Time Machine" aside={ins.goalNeed > ins.capacity ? <span className="rm-kicker orange">Need {fmt(ins.goalNeed)}/mo vs {fmt(ins.capacity)}</span> : null}>
          {ins.goals.map((g) => (
            <div key={g.id} className="rm-goal">
              <div className="rm-row-label"><strong>{g.name}</strong><span>{fmtL(g.target)} · {g.horizonYears} yr</span></div>
              <Meter value={g.progress} tone={g.progress < 25 ? 'orange' : 'teal'} />
              <div className="rm-row-label rm-mono-row"><span>{Math.round(g.progress)}% saved</span><span>{fmt(g.monthly)}/mo needed</span></div>
            </div>
          ))}
        </Card>
        <Card title={banker ? 'Holdings & loans' : 'Holdings'} aside={banker && loans.length ? layer : null}>
          <table className="rm-table compact">
            <thead><tr><th>Product</th><th>Type</th><th style={{ textAlign: 'right' }}>Value</th>{banker && <th style={{ textAlign: 'right' }}>EMI</th>}</tr></thead>
            <tbody>
              {p.holdings.map((h, i) => (
                <tr key={i}><td>{h.label}</td><td>{h.type}</td><td style={{ textAlign: 'right' }}>{fmt(h.value)}</td>{banker && <td style={{ textAlign: 'right' }}>—</td>}</tr>
              ))}
              {banker && loans.map((l, i) => (
                <tr key={`l${i}`} className="rm-neg"><td>{l.name} · {l.rate}%</td><td>Loan · {l.monthsLeft} mo left</td><td style={{ textAlign: 'right' }}>−{fmt(l.balance)}</td><td style={{ textAlign: 'right' }}>{fmt(l.emi)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {banker && (
        <Card title="Relationship history" aside={layer}>
          {cases.length + reviews.length === 0 && <div className="rm-empty small">No handoffs or reviews yet.</div>}
          {cases.map((x) => (
            <button key={x.id} className="rm-history" onClick={() => onOpenCase(x.id)}>
              <StatusPill status={x.status} /><span className="rm-mono">{x.id}</span><span className="grow">{x.topic}</span><span className="rm-sub">{dateTime(x.createdAt)}</span>
            </button>
          ))}
          {reviews.map((r) => (
            <div key={r.id} className="rm-history">
              <StatusPill status={r.status} /><span className="rm-mono">{r.id}</span><span className="grow">{r.recommendation}</span><span className="rm-sub">{dateTime(r.createdAt)}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
