import React from 'react';
import { Donut, Bars, GrowthCurve, ScoreRing, Sparkline } from './charts.jsx';
import { fmt, fmtCompact } from '../engine/analytics.js';
import Icon from './Icons.jsx';

const PALETTE = ['#0f8c7e', '#f2761d', '#6bbdb2', '#1a9c6b', '#5c6f6c', '#8a5cf2'];

// Renders the rich inline widget attached to a MITRA chat message.
export default function ChatWidget({ widget, onChip }) {
  const { type, data } = widget;

  if (type === 'allocation') {
    const segs = data.alloc.map((a, i) => ({ pct: a.pct, color: PALETTE[i % PALETTE.length] }));
    return (
      <div className="widget-card">
        <h4>Your Portfolio · {fmtCompact(data.total)}</h4>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <Donut segments={segs} centerTop={fmtCompact(data.total)} centerBottom="total" />
          <div className="legend">
            {data.alloc.map((a, i) => (
              <div className="legend-row" key={a.type}>
                <span className="legend-dot" style={{ background: PALETTE[i % PALETTE.length] }} />
                {a.type}
                <small>{a.pct.toFixed(0)}%</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'spending') {
    return (
      <div className="widget-card">
        <h4>June Spending by Category</h4>
        <Bars
          height={130}
          data={data.categories.map((c) => ({
            label: c.category.split(' ')[0].slice(0, 7),
            value: c.amount,
            over: c.amount > c.avg3m * 1.15 && !c.essential,
          }))}
          format={(v) => fmtCompact(v)}
          highlight={(d) => d.over}
        />
        <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', fontWeight: 600, marginTop: 6 }}>
          <span style={{ color: 'var(--amber)' }}>■</span> above your 3-month average
        </div>
      </div>
    );
  }

  if (type === 'sip') {
    return (
      <div className="widget-card">
        <h4>
          SIP Projection · {fmt(data.monthly)}/mo · {data.years} yrs @ {data.rate}%
        </h4>
        <GrowthCurve monthly={data.monthly} rate={data.rate} years={data.years} />
        <div style={{ display: 'flex', gap: 0, marginTop: 10, border: '1px solid var(--line-strong)' }}>
          <div style={{ flex: 1, borderRight: '1px solid var(--line)', padding: '9px 11px' }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--ink-soft)', fontFamily: 'inherit' }}>Invested</div>
            <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--display)' }}>{fmtCompact(data.monthly * data.years * 12)}</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(15,140,126,0.08)', padding: '9px 11px' }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, opacity: 0.65, fontFamily: 'inherit' }}>Projected value</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--orange)', fontFamily: 'var(--display)' }}>{fmtCompact(data.fv)}</div>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'goals') {
    return (
      <div className="widget-card">
        <h4>Goal Tracker</h4>
        {data.plans.map((g) => (
          <div className="goal-card" key={g.id} style={{ cursor: 'pointer' }} onClick={() => onChip?.(`Plan my ${g.name}`)}>
            <div className="goal-ic">
              <Icon name={g.icon} size={18} />
            </div>
            <div className="goal-info">
              <div className="goal-name">{g.name}</div>
              <div className="goal-meta">
                {fmtCompact(g.saved)} of {fmtCompact(g.target)} · needs {fmt(g.monthly)}/mo
              </div>
              <div className="bar-track">
                <i className="bar-fill" style={{ width: `${Math.min(g.progress, 100)}%`, display: 'block' }} />
              </div>
            </div>
            <div className="goal-pct">{g.progress.toFixed(0)}%</div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'tax') {
    const usedPct = (data.section80CUsed / data.section80CLimit) * 100;
    return (
      <div className="widget-card">
        <h4>Section 80C Utilisation</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Donut
            segments={[{ pct: usedPct, color: 'var(--teal)' }]}
            centerTop={`${usedPct.toFixed(0)}%`}
            centerBottom="used"
          />
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
            Used: <b style={{ color: 'var(--ink)' }}>{fmt(data.section80CUsed)}</b>
            <br />
            Gap: <b style={{ color: 'var(--red)' }}>{fmt(data.gap)}</b>
            <br />
            Potential tax saved: <b style={{ color: 'var(--green)' }}>{fmt(data.estSaving)}</b>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'subs') {
    return (
      <div className="widget-card">
        <h4>Unused Subscriptions · {fmt(data.waste)}/mo leaking</h4>
        {data.unused.map((s) => (
          <div className="sub-row" key={s.name}>
            <span style={{ fontWeight: 700 }}>{s.name}</span>
            <span>
              <span className="sub-tag">{s.lastUsed}</span>{' '}
              <b style={{ marginLeft: 6 }}>{fmt(s.amount)}</b>
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'health') {
    return (
      <div className="widget-card">
        <h4>Financial Health Breakdown</h4>
        <div className="score-ring-wrap">
          <ScoreRing score={data.total} />
          <div className="score-detail">
            {data.parts.map((p) => (
              <div className="score-row" key={p.label}>
                <span className="sr-label">{p.label}</span>
                <div className="bar-track">
                  <i className="bar-fill" style={{ width: `${(p.score / p.max) * 100}%`, display: 'block' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'compare') {
    return (
      <div className="widget-card">
        <h4>Fixed Deposit vs Mutual Fund SIP</h4>
        <table className="cmp-table">
          <thead>
            <tr><th></th><th>FD</th><th>Equity MF</th></tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td><td>{r.fd}</td><td>{r.mf}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === 'model') {
    return (
      <div className="widget-card">
        <h4>
          Recommended {data.profile} Portfolio · ~{data.expectedReturn}% p.a.
        </h4>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <Donut segments={data.mix} centerTop={`${data.expectedReturn}%`} centerBottom="expected" />
          <div className="legend">
            {data.mix.map((m) => (
              <div className="legend-row" key={m.name}>
                <span className="legend-dot" style={{ background: m.color }} />
                <span style={{ fontSize: 11 }}>{m.name}</span>
                <small>{m.pct}%</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'pulse') {
    const up = data.delta >= 0;
    return (
      <div className="widget-card">
        <h4>{data.index} · this month</h4>
        <Sparkline series={data.series} height={58} stroke={up ? 'var(--ink)' : 'var(--orange)'} />
        <div style={{ display: 'flex', gap: 0, marginTop: 10, border: '1px solid var(--line-strong)' }}>
          <div style={{ flex: 1, borderRight: '1px solid var(--line)', padding: '9px 11px' }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--ink-soft)', fontFamily: 'inherit' }}>Week move</div>
            <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--display)' }}>
              {up ? '▲' : '▼'} {Math.abs(data.weekChangePct)}%
            </div>
          </div>
          <div style={{ flex: 1, padding: '9px 11px' }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--ink-soft)', fontFamily: 'inherit' }}>Your impact</div>
            <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--display)', color: up ? 'var(--ink)' : 'var(--orange)' }}>
              {up ? '+' : '−'}{fmt(Math.abs(data.delta))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'drift') {
    return (
      <div className="widget-card">
        <h4>Current vs Target Allocation</h4>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-around', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <Donut segments={data.current} size={92} thickness={13} centerTop="Now" />
          </div>
          <div style={{ fontSize: 18, color: 'var(--mint)' }}>→</div>
          <div style={{ textAlign: 'center' }}>
            <Donut segments={data.target} size={92} thickness={13} centerTop="Target" />
          </div>
        </div>
        <div className="legend" style={{ marginTop: 10 }}>
          {data.current.map((c, i) => (
            <div className="legend-row" key={c.name}>
              <span className="legend-dot" style={{ background: c.color }} />
              {c.name}
              <small>
                {c.pct.toFixed(0)}% → {data.target[i].pct}%
              </small>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'peers') {
    return (
      <div className="widget-card">
        <h4>You vs people like you</h4>
        <div className="percentile-hero">
          <b>Top {100 - data.percentile}%</b>
          of your cohort · {data.cohort}
        </div>
        {data.metrics.map((m) => (
          <div className="peer-row" key={m.label}>
            <div className="peer-labels">
              <span>{m.label}</span>
              <span>
                you {m.you}
                {m.unit}
              </span>
            </div>
            <div className="peer-track">
              <div className="peer-you" style={{ width: `${(m.you / m.max) * 100}%` }} />
              <div className="peer-median" style={{ left: `${(m.median / m.max) * 100}%` }} />
            </div>
            <div className="peer-note">
              ▎cohort median: {m.median}
              {m.unit}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'shield') {
    return (
      <div className="widget-card">
        <h4>Fraud Shield · 30-second offer check</h4>
        {data.checks.map((c, i) => (
          <div key={c.flag} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: i < data.checks.length - 1 ? '1px solid var(--line)' : 'none' }}>
            <span style={{ color: 'var(--orange)', fontWeight: 700, fontSize: 12, fontFamily: 'var(--display)' }}>
              0{i + 1}
            </span>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{c.flag}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2, lineHeight: 1.5 }}>{c.why}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'protection') {
    const rows = [
      { label: 'Life (term) cover', have: data.termCover, need: data.termNeeded, premium: data.termPremium },
      { label: 'Health cover', have: data.healthCover, need: data.healthNeeded, premium: data.healthPremium },
    ];
    return (
      <div className="widget-card">
        <h4>Protection Gap · {data.dependents} dependents</h4>
        {rows.map((r) => (
          <div className="peer-row" key={r.label} style={{ marginBottom: 14 }}>
            <div className="peer-labels">
              <span>{r.label}</span>
              <span>+{fmt(r.premium)}/mo to fix</span>
            </div>
            <div className="peer-track">
              <div className="peer-you" style={{ width: `${Math.min((r.have / r.need) * 100, 100)}%` }} />
              <div className="peer-median" style={{ left: '99%' }} />
            </div>
            <div className="peer-note">
              have {fmtCompact(r.have)} · need {fmtCompact(r.need)}
            </div>
          </div>
        ))}
        <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
          Wealth you don't protect is wealth you're lending to bad luck.
        </div>
      </div>
    );
  }

  if (type === 'handoff') {
    return (
      <div className="widget-card">
        <h4>Human handoff · RM briefing prepared</h4>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 9, marginBottom: 9 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{data.rm}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--orange)', fontFamily: 'inherit' }}>
            {data.slot}
          </div>
        </div>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink-soft)', fontFamily: 'inherit', marginBottom: 6 }}>
          What the RM already knows
        </div>
        {data.brief.map((b, i) => (
          <div key={i} style={{ fontSize: 11.5, color: 'var(--ink-soft)', padding: '4px 0', lineHeight: 1.5 }}>
            — {b}
          </div>
        ))}
      </div>
    );
  }

  if (type === 'xray') {
    const mono = { fontFamily: 'inherit' };
    return (
      <div className="widget-card">
        <h4>Portfolio X-Ray · {data.fund}</h4>
        <div style={{ display: 'flex', gap: 0, border: '1px solid var(--line-strong)' }}>
          <div style={{ flex: 1, borderRight: '1px solid var(--line)', padding: '9px 11px' }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--ink-soft)', ...mono }}>You pay ({data.plan})</div>
            <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'var(--display)', color: 'var(--orange)' }}>{data.er}%</div>
          </div>
          <div style={{ flex: 1, padding: '9px 11px' }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--ink-soft)', ...mono }}>Direct plan</div>
            <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'var(--display)' }}>{data.directEr}%</div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 2px', borderBottom: '1px solid var(--line)', fontSize: 12, fontWeight: 600 }}>
          <span>Cost of staying Regular · {data.years} yrs</span>
          <b style={{ color: 'var(--orange)', fontFamily: 'var(--display)' }}>−{fmtCompact(data.feeLoss)}</b>
        </div>
        <div style={{ padding: '10px 2px 2px', fontSize: 12, fontWeight: 600 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span>Overlap with {data.overlapWith}</span>
            <b style={{ fontFamily: 'var(--display)' }}>{data.overlapPct}%</b>
          </div>
          <div className="peer-track">
            <div className="peer-you" style={{ width: `${data.overlapPct}%` }} />
          </div>
        </div>
      </div>
    );
  }

  if (type === 'harvest') {
    const mono = { fontFamily: 'inherit' };
    const usedPct = Math.min((data.harvestable / data.exemption) * 100, 100);
    return (
      <div className="widget-card">
        <h4>LTCG Harvest · FY 2026–27 window</h4>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <Donut
            segments={[{ pct: usedPct, color: 'var(--orange)' }]}
            centerTop={fmtCompact(data.harvestable)}
            centerBottom="harvestable"
          />
          <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.9, color: 'var(--ink-soft)' }}>
            Unrealised gains: <b style={{ color: 'var(--ink)' }}>{fmt(data.gains)}</b>
            <br />
            Tax-free limit: <b style={{ color: 'var(--ink)' }}>{fmt(data.exemption)}/yr</b>
            <br />
            Tax saved now: <b style={{ color: 'var(--orange)' }}>{fmt(data.taxSaved)}</b>
          </div>
        </div>
        <div style={{ marginTop: 10, padding: '9px 11px', border: '1px solid var(--line-strong)', fontSize: 11, color: 'var(--ink-soft)' }}>
          <span style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--ink)', ...mono }}>The 20-year habit</span>
          <div style={{ marginTop: 3 }}>
            Harvesting every year ≈ <b style={{ color: 'var(--ink)' }}>{fmtCompact(data.habitValue)}</b> of tax kept compounding for you.
          </div>
        </div>
      </div>
    );
  }

  if (type === 'persona') {
    return (
      <div className="widget-card" style={{ background: 'radial-gradient(130% 150% at 85% -10%, rgba(255,138,60,0.2), transparent 55%), #1d1d1f', color: '#f5f5f7', borderColor: 'transparent' }}>
        <h4 style={{ color: 'rgba(245,245,247,0.55)', borderBottomColor: 'rgba(245,245,247,0.2)' }}>
          Money Persona · 6-month behavioural read
        </h4>
        <div style={{ fontFamily: 'var(--display)', fontWeight: 900, fontSize: 24, textTransform: 'uppercase', lineHeight: 0.95, letterSpacing: '-0.02em' }}>
          {data.title}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(245,245,247,0.7)', margin: '6px 0 12px' }}>
          {data.tagline}
        </div>
        {data.stats.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
            <span style={{ width: 92, fontSize: 8.5, fontWeight: 700, fontFamily: 'inherit', color: 'rgba(245,245,247,0.6)' }}>
              {s.label}
            </span>
            <div style={{ flex: 1, height: 5, background: 'rgba(245,245,247,0.15)' }}>
              <div style={{ width: `${s.score}%`, height: '100%', background: s.score < 50 ? 'var(--amber)' : '#fff' }} />
            </div>
            <b style={{ fontSize: 11, fontFamily: 'var(--display)' }}>{s.score}</b>
          </div>
        ))}
        <div style={{ marginTop: 10, borderTop: '1px solid rgba(236,234,227,0.2)', paddingTop: 8 }}>
          {data.traits.map((t, i) => (
            <div key={i} style={{ fontSize: 11, color: 'rgba(245,245,247,0.75)', padding: '3px 0', lineHeight: 1.5 }}>
              — {t}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'collision') {
    return (
      <div className="widget-card">
        <h4>
          Goal Collision · need {fmtCompact(data.needTotal)}/mo vs {fmtCompact(data.capacity)}/mo
        </h4>
        {data.proposal.map((g) => (
          <div className="peer-row" key={g.id}>
            <div className="peer-labels">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name={g.icon} size={14} />
                {g.name}
              </span>
              <span>{fmt(Math.round(g.alloc))} of {fmt(Math.round(g.need))}</span>
            </div>
            <div className="peer-track">
              <div className="peer-you" style={{ width: `${Math.min(g.funded * 100, 100)}%`, background: g.funded >= 0.99 ? 'var(--green)' : 'var(--orange)' }} />
            </div>
            <div className="peer-note">
              {g.funded >= 0.99 ? 'fully funded' : g.funded > 0 ? `${Math.round(g.funded * 100)}% funded — timeline extends` : 'queued'}
            </div>
          </div>
        ))}
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-soft)' }}>
          A plan that admits its limits beats one that pretends.
        </div>
      </div>
    );
  }

  return null;
}
