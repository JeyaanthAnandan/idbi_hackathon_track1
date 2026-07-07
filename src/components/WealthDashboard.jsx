import React, { useState } from 'react';
import { holdings, totalWealth, monthlySummary, peers } from '../data/customer.js';
import {
  fmt, fmtCompact, healthScore, cashflow, allocation, allGoalPlans, topNudges, marketPulse,
} from '../engine/analytics.js';
import { Donut, ScoreRing, Bars, Sparkline } from './charts.jsx';
import { awardXP } from '../engine/xp.js';
import Counter from './Counter.jsx';
import Icon from './Icons.jsx';

const PALETTE = ['#f5f5f7', '#86868b', '#ff8a3c', '#30d158', '#48484a'];

// IFTTT-for-money: standing instructions MITRA executes automatically.
const DEFAULT_RULES = [
  { id: 'salary', when: 'Salary lands (1st)', then: 'Auto-invest ₹8,000 before I can spend it', on: true },
  { id: 'sweep', when: 'Balance crosses ₹2,00,000', then: 'Sweep excess into FD @ 7%', on: false },
  { id: 'dining', when: 'Dining crosses ₹10,000/mo', then: 'Alert me + pause food-app cards', on: false },
  { id: 'stepup', when: 'Salary increment detected', then: 'Step up all SIPs by the same %', on: false },
];

function MoneyRules() {
  const [rules, setRules] = useState(DEFAULT_RULES);
  const toggle = (id) => {
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, on: !r.on } : r)));
    awardXP(15, `rule-${id}`);
  };
  return (
    <div className="card">
      <h3>
        Money rules <span>runs while you sleep</span>
      </h3>
      {rules.map((r) => (
        <div
          key={r.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0',
            borderBottom: '1px solid var(--line)', cursor: 'pointer',
          }}
          onClick={() => toggle(r.id)}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--orange)' }}>
              When {r.when.charAt(0).toLowerCase() + r.when.slice(1)}
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 500, marginTop: 3 }}>{r.then}</div>
          </div>
          <div
            style={{
              width: 44, height: 26, borderRadius: 999, border: 'none',
              background: r.on ? 'var(--green)' : 'rgba(0,0,0,0.16)', position: 'relative',
              transition: 'background .25s', flexShrink: 0,
            }}
          >
            <span
              style={{
                position: 'absolute', top: 2, left: r.on ? 20 : 2, width: 22, height: 22,
                borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                transition: 'left .25s',
              }}
            />
          </div>
        </div>
      ))}
      <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 12 }}>
        The best financial decisions are the ones you only make once.
      </div>
    </div>
  );
}

export default function WealthDashboard({ onAsk, riskProfile = 'Balanced' }) {
  const hs = healthScore();
  const cf = cashflow();
  const alloc = allocation();
  const goals = allGoalPlans();
  const nudges = topNudges(riskProfile).slice(0, 2);
  const mp = marketPulse();

  return (
    <div style={{ paddingBottom: 20 }}>
      <div className="wealth-hero">
        <div className="wh-top">
          <div className="wh-title">My Wealth.</div>
          <div className="wh-tag">◉ 360° view · {riskProfile}</div>
        </div>
        <div className="wh-label">Total wealth with IDBI</div>
        <div className="wh-value"><Counter value={totalWealth()} format={fmt} /></div>
        <div className="wh-badges">
          <div className="wh-badge">Monthly surplus<b>{fmt(cf.surplus)}</b></div>
          <div className="wh-badge">Savings rate<b>{cf.savingsRate.toFixed(0)}%</b></div>
          <div className="wh-badge">Active SIPs<b>{fmt(cf.avgInvested)}/mo</b></div>
        </div>
      </div>

      {/* Proactive AI nudges — the "timely, data-driven guidance" ask */}
      {nudges.map((n) => (
        <div className="nudge" key={n.id}>
          <div className="nudge-ic">
            <Icon name={n.icon} size={19} />
          </div>
          <div>
            <div className="nudge-title">{n.title}</div>
            <div className="nudge-body">{n.body}</div>
            <button className="nudge-action" onClick={() => onAsk(n.action)}>
              {n.action} → ask MITRA
            </button>
          </div>
        </div>
      ))}

      <div className="card">
        <h3>
          Market pulse <span>{mp.index} · your impact</span>
        </h3>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <Sparkline series={mp.series} height={52} stroke={mp.delta >= 0 ? 'var(--mint)' : 'var(--red)'} />
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500 }}>This week</div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--display)', color: mp.delta >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {mp.delta >= 0 ? '+' : '−'}{fmt(Math.abs(mp.delta))}
            </div>
            <button
              onClick={() => onAsk('How are the markets?')}
              style={{
                marginTop: 6, background: 'none', border: 'none', color: 'var(--blue-link)',
                fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Ask MITRA why ›
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>
          Financial health <span>AI-computed monthly</span>
        </h3>
        <div className="score-ring-wrap">
          <ScoreRing score={hs.total} />
          <div className="score-detail">
            {hs.parts.map((p) => (
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

      <div className="card">
        <h3>
          Asset allocation <span>{holdings.length} holdings</span>
        </h3>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <Donut
            segments={alloc.map((a, i) => ({ pct: a.pct, color: PALETTE[i % PALETTE.length] }))}
            centerTop={fmtCompact(totalWealth())}
            centerBottom="total"
          />
          <div className="legend">
            {alloc.map((a, i) => (
              <div className="legend-row" key={a.type}>
                <span className="legend-dot" style={{ background: PALETTE[i % PALETTE.length] }} />
                {a.type}
                <small>{fmtCompact(a.value)}</small>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>
          Income vs spend <span>last 6 months</span>
        </h3>
        <Bars
          height={120}
          data={monthlySummary.map((m) => ({ label: m.month, value: m.spend }))}
          format={(v) => fmtCompact(v)}
          highlight={(d) => d.value > cf.avgSpend * 1.08}
        />
      </div>

      <MoneyRules />

      <div className="card">
        <h3>
          You vs people like you <span>anonymised cohort</span>
        </h3>
        <div className="percentile-hero">
          <b>Top {100 - peers.percentile}%</b>
          {peers.cohort}
        </div>
        {peers.metrics.slice(0, 3).map((m) => (
          <div className="peer-row" key={m.label}>
            <div className="peer-labels">
              <span>{m.label}</span>
              <span>you {m.you}{m.unit}</span>
            </div>
            <div className="peer-track">
              <div className="peer-you" style={{ width: `${(m.you / m.max) * 100}%` }} />
              <div className="peer-median" style={{ left: `${(m.median / m.max) * 100}%` }} />
            </div>
            <div className="peer-note">▎cohort median: {m.median}{m.unit}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>
          Goals <span>tap to plan with MITRA</span>
        </h3>
        {goals.map((g) => (
          <div className="goal-card" key={g.id} style={{ cursor: 'pointer' }} onClick={() => onAsk(`Plan my ${g.name}`)}>
            <div className="goal-ic">
              <Icon name={g.icon} size={18} />
            </div>
            <div className="goal-info">
              <div className="goal-name">{g.name}</div>
              <div className="goal-meta">
                {fmtCompact(g.saved)} of {fmtCompact(g.target)} · {g.horizonYears} yr horizon
              </div>
              <div className="bar-track">
                <i className="bar-fill" style={{ width: `${Math.min(g.progress, 100)}%`, display: 'block' }} />
              </div>
            </div>
            <div className="goal-pct">{g.progress.toFixed(0)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}
