import React from 'react';
import { customer, holdings } from '../data/customer.js';
import { fmt, healthScore, cashflow, marketPulse, spendingAnomalies, taxGap, topNudges } from '../engine/analytics.js';
import { levelInfo } from '../engine/xp.js';
import Avatar from './Avatar.jsx';
import Ring from './Ring.jsx';
import Counter from './Counter.jsx';
import Icon from './Icons.jsx';
import { ScoreRing } from './charts.jsx';
import idbiLogo from '../assets/idbi-logo.png';
import { getBootstrap } from '../engine/api.js';

const selfEmployed = customer.segment.toLowerCase().includes('self-employed');

const quickActions = [
  ['rupee', 'Pay / UPI'],
  ['mobile', 'Recharge'],
  ['bank', 'Deposits'],
  ['card', 'Cards'],
];

export default function BankHome({ onOpenMitra, onAsk, riskProfile = 'Balanced' }) {
  const hs = healthScore();
  const lvl = levelInfo();
  const cf = cashflow();
  const mp = marketPulse();
  const anomaly = spendingAnomalies()[0];
  const topNudge = topNudges(riskProfile)[0];

  const recentTxns = getBootstrap().session ? [] : [
    { icon: 'bag', name: 'Swiggy', cat: 'Food delivery · today', amt: -485 },
    { icon: 'bolt', name: 'Electricity bill', cat: 'BBPS · yesterday', amt: -2140 },
    ...(cf.avgInvested > 0 ? [{ icon: 'trendUp', name: 'SIP — Auto Invest', cat: 'Auto-debit · 3 Jul', amt: -Math.round(cf.avgInvested) }] : []),
    selfEmployed
      ? { icon: 'briefcase', name: 'Business Receipts — UPI Collections', cat: 'Settlement · 1 Jul', amt: Math.round(cf.avgIncome) }
      : { icon: 'briefcase', name: 'Salary — TechCorp India', cat: 'NEFT · 1 Jul', amt: Math.round(cf.avgIncome) },
  ];

  // the daily brief — three computed lines, nothing editorial
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
    <div>
      <div className="bank-header">
        <div className="bank-brand">
          <img className="bank-logo-img" src={idbiLogo} alt="IDBI Bank" />
          <div>
            <h1>IDBI GO+<sup style={{ fontSize: 8 }}>®</sup></h1>
            <span>bank aisa dost jaisa</span>
          </div>
          <div className="xp-chip">Lv.{lvl.level} — {lvl.title}</div>
        </div>
      </div>

      {/* the one dark object on this screen — balance owns it */}
      <div className="balance-card" data-guide-target="home-summary">
        <div className="balance-top">
          <div>
            <div className="balance-greet">Welcome · {customer.city}</div>
            <div className="bank-name">{customer.name}</div>
          </div>
          <ScoreRing score={hs.total} size={66} label="Health" onNight />
        </div>
        <div className="balance-body">
          <div className="balance-label">Reported savings balance</div>
          <div className="balance-value">{holdings.some((h) => h.type === 'Savings Account') ? <Counter value={customer.savingsBalance} format={fmt} /> : <span style={{ fontSize: 30 }}>Not supplied</span>}</div>
          <div className="balance-actions">
            <button className="primary">Pay / UPI</button>
            <button>Deposits</button>
            <button>Cards</button>
          </div>
        </div>
      </div>

      {topNudge && (
        <div className="nudge">
          <div className="nudge-ic">
            <Icon name={topNudge.icon} size={19} />
          </div>
          <div>
            <div className="nudge-title">{topNudge.title}</div>
            <div className="nudge-body">{topNudge.body}</div>
            <button className="nudge-action" onClick={() => onAsk?.(topNudge.action)}>
              {topNudge.action} → ask MITRA
            </button>
          </div>
        </div>
      )}

      {/* THE integration point — avatar advisor embedded in the bank app */}
      <button className="mitra-banner" onClick={onOpenMitra}>
        <Ring size={66} dot={8} color="rgba(15,140,126,0.45)">
          <Avatar size={54} mood="happy" />
        </Ring>
        <div>
          <div className="mb-eyebrow">MITRA found something</div>
          <div className="mb-title">{fmt(cf.surplus)} average monthly cashflow left</div>
          <div className="mb-sub">Let me put it to work for your goals →</div>
        </div>
      </button>

      <div className="quick-grid">
        {quickActions.map(([ic, label]) => (
          <button className="quick-item" key={label}>
            <span className="qi">
              <Icon name={ic} size={20} />
            </span>
            {label}
          </button>
        ))}
      </div>

      <div className="section-title">
        <span>Daily brief · computed today</span>
      </div>
      <div className="brief-strip">
        {brief.map((b) => (
          <div className="brief-row" key={b.label}>
            <span className="bd" style={{ background: b.dot }} />
            <span className="bl">{b.label}</span>
            <span className="bv" style={{ color: b.color }}>{b.value}</span>
          </div>
        ))}
      </div>

      <div className="section-title">
        <span>{getBootstrap().session ? 'Recent activity' : 'Illustrative demo activity'}</span>
      </div>
      <div className="list-card">
        {!recentTxns.length && <p style={{ padding: 16 }}>Individual transactions are not retained in this view. Open the Ledger to review imported spending totals.</p>}
        {recentTxns.map((t) => (
          <div className="txn" key={t.name}>
            <div className="txn-ic">
              <Icon name={t.icon} size={17} />
            </div>
            <div>
              <div className="txn-name">{t.name}</div>
              <div className="txn-cat">{t.cat}</div>
            </div>
            <div className={`txn-amt ${t.amt < 0 ? 'debit' : 'credit'}`}>
              {t.amt < 0 ? '−' : '+'}{fmt(Math.abs(t.amt))}
            </div>
          </div>
        ))}
      </div>

      <div className="giant-word">
        MITRA. A friend<br />for your money.
      </div>
      <div className="app-footnote">
        Wealth advisory for the many, not the few · IDBI Bank © 2026
      </div>
    </div>
  );
}
