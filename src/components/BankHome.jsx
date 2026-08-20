import React from 'react';
import { customer } from '../data/customer.js';
import { fmt, healthScore, cashflow, marketPulse, spendingAnomalies, taxGap } from '../engine/analytics.js';
import { levelInfo } from '../engine/xp.js';
import Avatar from './Avatar.jsx';
import Counter from './Counter.jsx';
import Icon from './Icons.jsx';
import idbiLogo from '../assets/idbi-logo.png';

const recentTxns = [
  { icon: 'bag', name: 'Swiggy', cat: 'Food Delivery · Today', amt: -485 },
  { icon: 'bolt', name: 'Electricity Bill', cat: 'BBPS · Yesterday', amt: -2140 },
  { icon: 'trendUp', name: 'SIP — Nifty 50 Index', cat: 'Auto-debit · 3 Jul', amt: -8000 },
  { icon: 'briefcase', name: 'Salary — TechCorp India', cat: 'NEFT · 1 Jul', amt: 95000 },
];

const quickActions = [
  ['rupee', 'Pay / UPI'],
  ['mobile', 'Recharge'],
  ['bank', 'Deposits'],
  ['card', 'Cards'],
];

export default function BankHome({ onOpenMitra }) {
  const hs = healthScore();
  const cf = cashflow();
  const mp = marketPulse();
  const anomaly = spendingAnomalies()[0];
  const lvl = levelInfo();

  return (
    <div>
      <div className="bank-header">
        <div className="bank-brand">
          <img className="bank-logo-img" src={idbiLogo} alt="IDBI Bank" />
          <div>
            <h1>GO+<sup style={{ fontSize: 8 }}>®</sup></h1>
            <span>bank aisa dost jaisa</span>
          </div>
          <div className="xp-chip">Lv.{lvl.level} — {lvl.title}</div>
        </div>
        <div className="bank-greet">Good Afternoon — Mumbai, 34°C</div>
        <div className="bank-name">{customer.name}</div>
      </div>

      <div className="balance-card">
        <div className="balance-label">SAVINGS A/C ···4127</div>
        <div className="balance-value"><Counter value={customer.savingsBalance} format={fmt} /></div>
        <div className="balance-sub">financial health {hs.total}/100 — {hs.grade.toLowerCase()}</div>
      </div>

      <div className="marquee">
        <div className="marquee-inner">
          <span>
            Wealth advisory. <em>Now for everyone.</em>
          </span>
        </div>
      </div>

      <div className="brief-strip">
        <span className="bs-title">Your daily brief</span>
        Markets <b>{mp.weekChangePct >= 0 ? '↑' : '↓'} {Math.abs(mp.weekChangePct)}%</b> this week
        (your funds {mp.delta >= 0 ? '+' : '−'}<b>{fmt(Math.abs(mp.delta))}</b>) ·{' '}
        {anomaly && (<>
          {anomaly.category.split(' ')[0]} spends <b>↑ {anomaly.deltaPct.toFixed(0)}%</b> ·{' '}
        </>)}
        80C gap <b>{fmt(taxGap().gap)}</b> · idle surplus <b>{fmt(cf.surplus)}/mo</b>
      </div>

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

      {/* THE integration point — avatar advisor embedded in the bank app */}
      <button className="mitra-banner" onClick={onOpenMitra}>
        <span className="pulse-dot" />
        <div style={{ flexShrink: 0 }}>
          <Avatar size={64} mood="happy" />
        </div>
        <div>
          <div className="mb-title">Meet MITRA. <em>Your AI wealth advisor.</em></div>
          <div className="mb-sub">
            I found {fmt(cf.surplus)} sitting idle every month. Let me put it to work for your goals.
          </div>
          <span className="mb-cta">Talk to MITRA</span>
        </div>
      </button>

      <div className="section-title">
        <span>Recent activity</span> <small>View all ›</small>
      </div>
      <div className="list-card">
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
        MITRA. A friend for your money.
      </div>
      <div style={{ padding: '12px 16px 28px', fontSize: 12, color: 'var(--ink-soft)', textAlign: 'center' }}>
        Wealth advisory for the many, not the few. IDBI Bank © 2026
      </div>
    </div>
  );
}
