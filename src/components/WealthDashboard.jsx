import React, { useState } from 'react';
import { holdings, totalWealth, monthlySummary, peers } from '../data/customer.js';
import {
  fmt, fmtCompact, healthScore, cashflow, allocation, allGoalPlans, topNudges, marketPulse,
} from '../engine/analytics.js';
import { ConcentricRings, ScoreRing, Bars, Sparkline } from './charts.jsx';
import { awardXP } from '../engine/xp.js';
import Counter from './Counter.jsx';
import Ring from './Ring.jsx';
import Icon from './Icons.jsx';

const PALETTE = ['#0f8c7e', '#f2761d', '#6bbdb2', '#1a9c6b', '#5c6f6c'];

// What MITRA calls the thing she noticed, per nudge kind.
const DETECTED_LABEL = {
  drift: 'Drift detected',
  surplus: 'Surplus detected',
  spend: 'Spending spike',
  tax: 'Tax headroom',
  subs: 'Leak detected',
  protection: 'Protection gap',
  emergency: 'Buffer short',
};

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
              background: r.on ? 'var(--green)' : 'var(--line-strong)', position: 'relative',
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
  const nudges = topNudges(riskProfile).slice(0, 3);
  const [lead, ...rest] = nudges;
  const mp = marketPulse();

  return (
    <div style={{ paddingBottom: 20 }}>
      <div className="wealth-hero">
        <div className="wh-top">
          <div className="wh-title">My wealth</div>
          <div className="wh-tag">360° · {riskProfile}</div>
        </div>
        <div className="wh-label">Total with IDBI · {holdings.length} holdings</div>
        <div className="wh-value"><Counter value={totalWealth()} format={fmt} /></div>
        <div className="wh-badges">
          <div className="wh-badge">Surplus/mo<b>{fmt(cf.surplus)}</b></div>
          <div className="wh-badge accent">Savings rate<b>{cf.savingsRate.toFixed(0)}%</b></div>
          <div className="wh-badge">Active SIPs<b>{fmt(cf.avgInvested)}</b></div>
        </div>
      </div>

      {/* Whatever MITRA flagged first gets the detected-card treatment:
          ring, then the one sentence, then the action. The rest follow
          in the quieter nudge style. */}
      {lead && (
        <div className="card">
          <div className="drift-head">
            <Ring size={20} orbit={false} color="var(--orange)">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--orange)' }} />
            </Ring>
            <span className="eyebrow accent">{DETECTED_LABEL[lead.id] || 'MITRA detected'}</span>
          </div>
          <div className="drift-title">{lead.title}</div>
          <div className="drift-body">{lead.body}</div>
          <button className="nudge-action" onClick={() => onAsk(lead.action)}>
            {lead.action} →
          </button>
        </div>
      )}

      {/* Proactive AI nudges — the "timely, data-driven guidance" ask */}
      {rest.map((n) => (
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
          <ScoreRing score={hs.total} size={96} thickness={7} />
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
        <h3>Allocation · concentric</h3>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <ConcentricRings
            segments={alloc.map((a, i) => ({ key: a.type, pct: a.pct, color: PALETTE[i % PALETTE.length] }))}
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
