import React, { useState } from 'react';
import Avatar from './Avatar.jsx';
import Ring from './Ring.jsx';
import Icon from './Icons.jsx';
import Counter from './Counter.jsx';
import AvatarChat from './AvatarChat.jsx';
import WealthDashboard from './WealthDashboard.jsx';
import Simulator from './Simulator.jsx';
import { ScoreRing, ConcentricRings, ProjectionChart } from './charts.jsx';
import { customer, totalWealth, spendByCategory, subscriptions } from '../data/customer.js';
import {
  fmt, fmtCompact, healthScore, cashflow, allocation, drift, projectWealth,
  marketPulse, spendingAnomalies, taxGap,
} from '../engine/analytics.js';
import { levelInfo } from '../engine/xp.js';
import idbiLogo from '../assets/idbi-logo.png';

// ─────────────────────────────────────────────────────────────
// The desktop face of MITRA — a three-pane workspace: nav rail,
// scrolling main column, and a chat rail that is always open.
//
// The phone app makes MITRA a destination you tab into. On a wide screen
// there is room to keep her on screen permanently, so the dashboard and the
// conversation sit side by side: every card can hand a question straight to
// the rail without the customer losing the number they were looking at.
//
// Every figure below is computed by engine/analytics.js against the active
// persona — the same source the phone app reads. Nothing here is hardcoded,
// so switching demo customers in Settings changes this screen too.
// ─────────────────────────────────────────────────────────────

const NAV = [
  ['home', 'home', 'Home'],
  ['wealth', 'chart', 'Wealth'],
  ['simulate', 'clock', 'Machine'],
  ['ledger', 'list', 'Ledger'],
];

// Growth scenarios for the Time Machine — the same three the phone
// Simulator offers, as a segmented control.
const SCENARIOS = [
  [7, 'Bear 7%'],
  [11, 'Base 11%'],
  [14, 'Bull 14%'],
];

// Holding types, in the order the concentric mark draws them (largest
// outermost), mapped onto the brand's chart palette.
const ALLOC = {
  'Savings Account': { label: 'Savings', color: 'var(--teal)' },
  'Fixed Deposit': { label: 'Fixed deposit', color: 'var(--teal-2)' },
  'Mutual Fund': { label: 'Mutual funds', color: 'var(--orange)' },
  Gold: { label: 'Gold (SGB)', color: 'var(--slate)' },
};
const allocStyle = (type) => ALLOC[type] || { label: type, color: 'var(--ink-soft)' };

const initials = (name) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// ── Home ────────────────────────────────────────────────────
function HomePanel({ riskProfile, onAsk }) {
  const [rate, setRate] = useState(11);

  const cf = cashflow();
  const dr = drift(riskProfile);
  const proj = projectWealth({ annualRatePct: rate });
  const mp = marketPulse();
  const anomaly = spendingAnomalies()[0];

  // drift().biggestGap is signed: target − current, so a negative gap means
  // the customer is *over* target in that bucket.
  const gap = dr.biggestGap;
  const over = gap.gap < 0;

  const segments = allocation()
    .slice()
    .sort((a, b) => b.value - a.value)
    .map((a) => ({ key: a.type, pct: a.pct, value: a.value, color: allocStyle(a.type).color, label: allocStyle(a.type).label }));

  const brief = [
    {
      dot: mp.delta >= 0 ? 'var(--green)' : 'var(--red)',
      label: `${mp.index} ${mp.weekChangePct >= 0 ? 'up' : 'down'} ${Math.abs(mp.weekChangePct)}% this week`,
      value: `${mp.delta >= 0 ? '+' : '−'}${fmt(Math.abs(mp.delta))}`,
      color: mp.delta >= 0 ? 'var(--green)' : 'var(--red)',
    },
    anomaly && {
      dot: 'var(--orange)',
      label: `${anomaly.category.split(' ')[0]} spends vs 3-mo baseline`,
      value: `↑ ${anomaly.deltaPct.toFixed(0)}%`,
      color: 'var(--orange)',
    },
    {
      dot: 'var(--ink-soft)',
      label: '80C headroom left this year',
      value: fmt(taxGap().gap),
    },
  ].filter(Boolean);

  return (
    <>
      {/* the one dark object in the main column — balance owns it */}
      <section className="web-hero web-span" data-surface="night">
        <div className="web-hero-rings" aria-hidden="true">
          <span /><span />
        </div>
        <div className="web-hero-main">
          <div className="web-eyebrow">Savings a/c ···4127</div>
          <div className="web-hero-value">
            <Counter value={customer.savingsBalance} format={fmt} />
          </div>
          <div className="web-hero-actions">
            <button className="web-btn web-btn-primary">Pay / UPI</button>
            <button className="web-btn web-btn-ghost">Deposits</button>
            <button className="web-btn web-btn-ghost">Cards</button>
          </div>
        </div>
        <div className="web-hero-stats">
          <div className="web-stat">
            <div className="web-eyebrow">Total with IDBI</div>
            <div className="web-stat-value">{fmt(totalWealth())}</div>
          </div>
          <div className="web-stat web-stat-accent">
            <div className="web-eyebrow">Surplus / mo</div>
            <div className="web-stat-value">{fmt(cf.surplus)}</div>
          </div>
          <div className="web-stat">
            <div className="web-eyebrow">Savings rate</div>
            <div className="web-stat-value">{cf.savingsRate.toFixed(0)}%</div>
          </div>
        </div>
      </section>

      <div className="web-span web-pair">
        <button className="web-card web-mitra" onClick={() => onAsk(`Put my ${fmt(cf.surplus)} monthly surplus to work`)}>
          <Ring size={66} dot={8} color="rgba(15,140,126,0.45)">
            <Avatar size={54} mood="happy" />
          </Ring>
          <span>
            <span className="web-eyebrow web-eyebrow-accent">MITRA found something</span>
            <span className="web-card-title">{fmt(cf.surplus)} idle, every month</span>
            <span className="web-card-sub">Ask me in the panel and I'll put it to work →</span>
          </span>
        </button>

        <div className="web-card">
          <div className="web-flag">
            <span className="web-flag-dot" />
            <span className="web-eyebrow web-eyebrow-accent">Drift detected</span>
          </div>
          <div className="web-card-title">
            {Math.abs(gap.gap).toFixed(0)}% {over ? 'over' : 'under'} target in {gap.name.toLowerCase()}
          </div>
          <p className="web-card-body">
            Gradual SIP-based rebalancing fixes it without triggering tax.
          </p>
          <button
            className="web-btn web-btn-primary"
            onClick={() => onAsk('Rebalance my drift without a tax event')}
          >
            Rebalance with MITRA →
          </button>
        </div>
      </div>

      <section className="web-card web-span web-machine">
        <div className="web-machine-side">
          <div className="web-eyebrow">Time Machine® · what-if</div>
          <div className="web-eyebrow web-machine-label">Age of financial freedom</div>
          <div className="web-machine-age">{proj.fireAge ?? '60+'}</div>
          <p className="web-card-body web-machine-note">
            {proj.fireAge
              ? `With ${fmt(cf.avgInvested)}/mo invested at ${rate}% p.a.`
              : `At ${fmt(cf.avgInvested)}/mo and ${rate}% p.a., freedom does not arrive before 60.`}
          </p>
          <div className="web-machine-stats">
            <div className="web-stat web-stat-rule">
              <div className="web-eyebrow">Wealth at 60</div>
              <div className="web-stat-value">{fmtCompact(proj.wealthAt60)}</div>
            </div>
            <div className="web-stat web-stat-rule">
              <div className="web-eyebrow">You invest</div>
              <div className="web-stat-value">{fmtCompact(proj.invested)}</div>
            </div>
          </div>
        </div>
        <div className="web-machine-chart">
          <ProjectionChart series={proj.series} fireAge={proj.fireAge} height={210} />
          <div className="web-machine-controls">
            {SCENARIOS.map(([r, label]) => (
              <button
                key={r}
                className={`web-chip ${rate === r ? 'is-on' : ''}`}
                aria-pressed={rate === r}
                onClick={() => setRate(r)}
              >
                {label}
              </button>
            ))}
            <button
              className="web-btn web-btn-dark web-machine-send"
              onClick={() => onAsk(`Send this Time Machine plan to my SIP — ${rate}% p.a.`)}
            >
              Send plan to MITRA →
            </button>
          </div>
        </div>
      </section>

      <section className="web-card">
        <div className="web-eyebrow">Allocation · concentric</div>
        <div className="web-alloc">
          <ConcentricRings segments={segments} size={126} />
          <div className="web-alloc-legend">
            {segments.map((s) => (
              <div className="web-legend-row" key={s.key}>
                <span className="web-legend-dot" style={{ background: s.color }} />
                {s.label}
                <span className="web-legend-value">{fmtCompact(s.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="web-card web-brief">
        <div className="web-eyebrow web-brief-head">Daily brief · computed today</div>
        {brief.map((b) => (
          <div className="web-brief-row" key={b.label}>
            <span className="web-brief-dot" style={{ background: b.dot }} />
            <span className="web-brief-label">{b.label}</span>
            <span className="web-brief-value" style={{ color: b.color }}>{b.value}</span>
          </div>
        ))}
      </section>
    </>
  );
}

// ── Ledger ──────────────────────────────────────────────────
// The nav rail promises a ledger, so it gets one: where the month actually
// went, measured against each category's own 3-month baseline rather than
// against a budget nobody set.
function LedgerPanel({ onAsk }) {
  const cf = cashflow();
  const rows = spendByCategory
    .slice()
    .sort((a, b) => b.amount - a.amount)
    .map((c) => ({ ...c, deltaPct: c.avg3m > 0 ? ((c.amount - c.avg3m) / c.avg3m) * 100 : 0 }));
  const peak = Math.max(...rows.map((r) => Math.max(r.amount, r.avg3m)));
  const idle = subscriptions.filter((s) => s.lastUsed !== 'active');

  return (
    <>
      <section className="web-span web-pair">
        <div className="web-card">
          <div className="web-eyebrow">Money in · monthly average</div>
          <div className="web-card-figure">{fmt(cf.avgIncome)}</div>
        </div>
        <div className="web-card">
          <div className="web-eyebrow">Money out · monthly average</div>
          <div className="web-card-figure">{fmt(cf.avgSpend)}</div>
        </div>
      </section>

      <section className="web-card web-span">
        <div className="web-eyebrow">This month by category · vs own 3-month baseline</div>
        <div className="web-ledger">
          {rows.map((r) => (
            <div className="web-ledger-row" key={r.category}>
              <div className="web-ledger-name">
                {r.category}
                {!r.essential && <span className="web-tag">discretionary</span>}
              </div>
              <div className="web-ledger-bar">
                <span className="web-ledger-base" style={{ width: `${(r.avg3m / peak) * 100}%` }} />
                <span
                  className="web-ledger-fill"
                  style={{
                    width: `${(r.amount / peak) * 100}%`,
                    background: r.deltaPct > 15 ? 'var(--orange)' : 'var(--teal)',
                  }}
                />
              </div>
              <div className="web-ledger-amt">{fmt(r.amount)}</div>
              <div
                className="web-ledger-delta"
                style={{ color: r.deltaPct > 15 ? 'var(--orange)' : 'var(--ink-soft)' }}
              >
                {r.deltaPct >= 0 ? '↑' : '↓'} {Math.abs(r.deltaPct).toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
      </section>

      {idle.length > 0 && (
        <section className="web-card web-span">
          <div className="web-eyebrow web-eyebrow-accent">Paying for, not using</div>
          <div className="web-ledger">
            {idle.map((s) => (
              <div className="web-ledger-row web-ledger-sub" key={s.name}>
                <div className="web-ledger-name">
                  {s.name}
                  <span className="web-tag">{s.lastUsed}</span>
                </div>
                <div className="web-ledger-amt">{fmt(s.amount)}/mo</div>
              </div>
            ))}
          </div>
          <button className="web-btn web-btn-primary" onClick={() => onAsk('Cancel my unused subscriptions')}>
            Clear these with MITRA →
          </button>
        </section>
      )}
    </>
  );
}

// ── Shell ───────────────────────────────────────────────────
export default function WebApp({ riskProfile, tab, onTab, settingsPanel }) {
  const [pendingPrompt, setPendingPrompt] = useState(null);
  const [query, setQuery] = useState('');

  const hs = healthScore();
  const lvl = levelInfo();

  // The phone app has a dedicated MITRA tab; here she is always on screen,
  // so that tab collapses back to Home for the purpose of nav highlighting.
  const active = tab === 'mitra' ? 'home' : tab;

  const ask = (prompt) => setPendingPrompt(prompt);

  const submitSearch = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setQuery('');
    ask(q);
  };

  return (
    <div className="app-shell web" data-surface="day">
      <nav className="web-rail" data-surface="night" aria-label="Primary">
        <span className="web-rail-arc" aria-hidden="true" />
        <div className="web-rail-logo">
          <img src={idbiLogo} alt="IDBI Bank" />
        </div>
        <div className="web-rail-items">
          {NAV.map(([id, ic, label]) => (
            <button
              key={id}
              className={`web-rail-item ${active === id ? 'is-on' : ''}`}
              aria-current={active === id ? 'page' : undefined}
              onClick={() => onTab(id)}
            >
              <Icon name={ic} size={19} />
              {label}
            </button>
          ))}
        </div>
        <div className="web-rail-foot">
          <button
            className={`web-rail-item ${active === 'settings' ? 'is-on' : ''}`}
            aria-current={active === 'settings' ? 'page' : undefined}
            onClick={() => onTab('settings')}
          >
            <Icon name="gear" size={19} />
            Settings
          </button>
          <span className="web-rail-avatar" title={customer.name}>{initials(customer.name)}</span>
        </div>
      </nav>

      <div className="web-main">
        <header className="web-topbar">
          <div className="web-topbar-id">
            <div className="web-greet">
              <div className="web-eyebrow">Good afternoon · {customer.city}, 34°C</div>
              <div className="web-greet-name">{customer.name}</div>
            </div>
            <div className="web-persona">
              <span className="web-persona-ring" />
              <span>{lvl.title}</span>
            </div>
            <ScoreRing score={hs.total} size={56} label="Health" />
          </div>
          <form className="web-search" onSubmit={submitSearch}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4 4" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search accounts, funds, goals…"
              aria-label="Ask MITRA about accounts, funds or goals"
            />
          </form>
        </header>

        <div className="web-scroll" key={active}>
          {active === 'home' && <HomePanel riskProfile={riskProfile} onAsk={ask} />}
          {active === 'wealth' && <div className="web-span web-embed"><WealthDashboard onAsk={ask} riskProfile={riskProfile} /></div>}
          {active === 'simulate' && <div className="web-span web-embed" data-surface="night"><Simulator onAsk={ask} /></div>}
          {active === 'ledger' && <LedgerPanel onAsk={ask} />}
          {active === 'settings' && <div className="web-span web-embed">{settingsPanel}</div>}
        </div>
      </div>

      <aside className="web-chat" data-surface="night" aria-label="MITRA">
        <AvatarChat
          riskProfile={riskProfile}
          initialPrompt={pendingPrompt}
          onConsumeInitial={() => setPendingPrompt(null)}
        />
      </aside>
    </div>
  );
}
