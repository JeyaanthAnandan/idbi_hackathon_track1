import React from 'react';
import Icon from '../Icons.jsx';
import { ScoreRing } from '../charts.jsx';
import { logRmAction } from '../../engine/rmDesk.js';
import { POLICY } from '../../data/policy.js';
import {
  Avatar, Card, FlagPill, Kpi, Meter, StatusPill, dateOnly, dateTime, fmt, fmtL,
} from './ui.jsx';

// Everything about one customer on one screen: the same facts MITRA used
// with them, plus what the bank knows about the relationship.
export default function RmCustomer360({ entry, desk, onBack, onOpenCase, toast }) {
  const { persona: p, ins } = entry;
  const c = p.customer;
  const rel = p.relationship || {};
  const cases = desk.cases.filter((x) => x.customerId === c.id);
  const reviews = desk.reviews.filter((x) => x.customerId === c.id);
  const maxIncome = Math.max(...p.monthlySummary.map((m) => m.income), 1);

  const printBrief = () => {
    logRmAction('brief.printed', c.id, 'Meeting brief');
    window.print();
  };

  return (
    <div className="rm-360">
      <div className="rm-360-head">
        <button className="rm-btn ghost" onClick={onBack}>← Book</button>
        <Avatar name={c.name} size={56} />
        <div style={{ minWidth: 0 }}>
          <h2>{c.name}</h2>
          <div className="rm-sub">{c.id} · {c.age} yrs · {c.segment} · {c.city} · customer since {c.relationshipSince}</div>
          <div className="rm-list-tags" style={{ marginTop: 8 }}>
            <span className="rm-tag">{ins.riskProfile} risk profile</span>
            <span className="rm-tag">KYC risk {c.kycRisk}</span>
            <span className="rm-tag">{rel.language || 'English'}</span>
            {rel.phone && <span className="rm-tag">{rel.phone}</span>}
          </div>
        </div>
        <button className="rm-btn primary no-print" onClick={printBrief} style={{ marginLeft: 'auto' }}>
          <Icon name="receipt" size={15} /> Meeting brief
        </button>
      </div>

      <div className="rm-kpis">
        <Kpi label="Relationship AUM" value={fmtL(ins.aum)} sub={`${p.holdings.length} holdings`} />
        <Kpi label="Avg monthly income" value={fmt(ins.cf.avgIncome)} sub={ins.cf.incomeVolatility > 12 ? `irregular · ±${ins.cf.incomeVolatility.toFixed(0)}%` : 'steady'} />
        <Kpi label="Idle surplus" value={`${fmt(Math.max(ins.cf.surplus, 0))}/mo`} sub={`savings rate ${ins.cf.savingsRate.toFixed(0)}%`} tone={ins.cf.surplus > 5000 ? 'orange' : undefined} />
        <Kpi label="Emergency cover" value={`${ins.hs.emergencyMonths.toFixed(1)} mo`} sub={`target ${POLICY.emergency.targetMonths}`} tone={ins.hs.emergencyMonths < 1 ? 'bad' : undefined} />
        <Kpi label="MITRA sessions (30d)" value={rel.mitraSessions30d ?? 0} sub={rel.lastMitraTopic ? `last: ${rel.lastMitraTopic}` : '—'} />
        <Kpi label="Last RM contact" value={rel.lastContact ? dateOnly(rel.lastContact) : 'Never'} sub={rel.nextReview ? `next review ${dateOnly(rel.nextReview)}` : ''} />
      </div>

      <div className="rm-grid-3">
        <Card title="Financial health">
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <ScoreRing score={ins.hs.total} size={92} label={ins.hs.grade} />
            <div style={{ flex: 1, display: 'grid', gap: 9 }}>
              {ins.hs.parts.map((x) => (
                <div key={x.label}>
                  <div className="rm-row-label"><span>{x.label}</span><span>{x.score.toFixed(0)}/{x.max}</span></div>
                  <Meter value={x.score} max={x.max} />
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

        <Card title="Cash flow · last 6 months">
          <div className="rm-bars">
            {p.monthlySummary.map((m) => (
              <div key={m.month} className="rm-bar-col" title={`${m.month}: in ${fmt(m.income)} · out ${fmt(m.spend)} · invested ${fmt(m.invested)}`}>
                <div className="rm-bar-pair">
                  <i style={{ height: `${(m.income / maxIncome) * 100}%` }} />
                  <i className="out" style={{ height: `${(m.spend / maxIncome) * 100}%` }} />
                </div>
                <span>{m.month}</span>
              </div>
            ))}
          </div>
          <div className="rm-legend"><span><i /> Income</span><span><i className="out" /> Spend</span><span>EMI {fmt(ins.emi)}/mo ({ins.emiRatio.toFixed(0)}%)</span></div>
        </Card>
      </div>

      <div className="rm-two">
        <Card title={`Opportunities (${ins.opportunities.length})`} aside={<span className="rm-tag">suitability-first · ranked by need</span>}>
          {ins.opportunities.length === 0 && <div className="rm-empty small">No gaps found by current policy rules.</div>}
          {ins.opportunities.map((o) => (
            <div className="rm-opp" key={o.id}>
              <div>
                <strong>{o.product}</strong>
                <div className="rm-sub">{o.detail}</div>
                <div className="rm-rule">Rule: {o.rule} · {POLICY.version}</div>
              </div>
              <div className="rm-opp-actions no-print">
                {o.value > 0 && <span className="rm-opp-value">{fmtL(o.value)}</span>}
                <button className="rm-btn small" onClick={() => { logRmAction('opportunity.nudge', c.id, o.product); toast(`MITRA will raise "${o.product}" with ${c.name.split(' ')[0]} next session`); }}>Nudge via MITRA</button>
                <button className="rm-btn small ghost" onClick={() => { logRmAction('opportunity.discussed', c.id, o.product); toast('Logged as discussed'); }}>Discussed</button>
              </div>
            </div>
          ))}
        </Card>

        <Card title={`Risk & compliance flags (${ins.flags.length})`}>
          {ins.flags.length === 0 && <div className="rm-empty small">No flags.</div>}
          {ins.flags.map((f, i) => (
            <div className="rm-flag" key={i}><FlagPill level={f.level}>{f.code}</FlagPill><span>{f.text}</span></div>
          ))}
          {ins.pg.available && (
            <div className="rm-meta-grid" style={{ marginTop: 12 }}>
              <div><span>Term cover</span>{fmtL(ins.pg.termCover)} / {fmtL(ins.pg.termNeeded)}</div>
              <div><span>Health cover</span>{fmtL(ins.pg.healthCover)} / {fmtL(ins.pg.healthNeeded)}</div>
              <div><span>80C headroom</span>{ins.tg.available ? fmt(ins.tg.gap) : 'n/a (regime)'}</div>
            </div>
          )}
        </Card>
      </div>

      <div className="rm-two">
        <Card title="Goals">
          {ins.goals.map((g) => (
            <div key={g.id} className="rm-goal">
              <div className="rm-row-label"><strong>{g.name}</strong><span>{fmtL(g.saved)} of {fmtL(g.target)} · {g.horizonYears} yr</span></div>
              <Meter value={g.progress} tone={g.progress < 25 ? 'orange' : 'teal'} />
              <div className="rm-sub">Needs {fmt(g.monthly)}/mo at the {ins.riskProfile.toLowerCase()} base rate</div>
            </div>
          ))}
          <div className="rm-outcome">All goals need <strong>{fmt(ins.goalNeed)}/mo</strong> vs investing capacity <strong>{fmt(ins.capacity)}/mo</strong></div>
        </Card>

        <Card title="Holdings">
          <table className="rm-table compact">
            <thead><tr><th>Holding</th><th>Type</th><th style={{ textAlign: 'right' }}>Value</th></tr></thead>
            <tbody>
              {p.holdings.map((h, i) => (
                <tr key={i}><td>{h.label}</td><td>{h.type}</td><td style={{ textAlign: 'right' }}>{fmt(h.value)}</td></tr>
              ))}
              {(p.loans || []).map((l, i) => (
                <tr key={`l${i}`} className="rm-neg"><td>{l.name} · {l.rate}%</td><td>Loan</td><td style={{ textAlign: 'right' }}>−{fmt(l.balance)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="Relationship history">
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
    </div>
  );
}
