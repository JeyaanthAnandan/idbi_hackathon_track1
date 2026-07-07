import React, { useEffect, useMemo, useState } from 'react';
import { ProjectionChart } from './charts.jsx';
import { fmt, fmtCompact, projectWealth, cashflow } from '../engine/analytics.js';
import { customer } from '../data/customer.js';
import { awardXP } from '../engine/xp.js';

const SCENARIOS = [
  { id: 'bear', label: 'Bear — 7%', rate: 7 },
  { id: 'base', label: 'Expected — 11%', rate: 11 },
  { id: 'bull', label: 'Bull — 14%', rate: 14 },
];

// Life events — each reshapes the whole projection when toggled on.
const LIFE_EVENTS = [
  { id: 'wedding', label: 'Wedding @ 31', short: 'W', age: 31, oneTime: 800000 },
  { id: 'child', label: 'Child @ 33', short: 'C', age: 33, oneTime: 300000, monthlyDelta: -8000 },
  { id: 'homebuy', label: 'Home @ 35', short: 'H', age: 35, oneTime: 2000000, monthlyDelta: -12000 },
  { id: 'parents', label: "Parents' care @ 45", short: 'P', age: 45, monthlyDelta: -10000 },
];

// Wealth Time Machine — live what-if simulation of the customer's future.
// Every drag recomputes the full projection + age of financial freedom.
export default function Simulator({ onAsk }) {
  const [extra, setExtra] = useState(10000);
  const [scenario, setScenario] = useState('base');
  const [eventIds, setEventIds] = useState([]);
  const rate = SCENARIOS.find((s) => s.id === scenario).rate;
  const cf = cashflow();
  const events = LIFE_EVENTS.filter((e) => eventIds.includes(e.id));

  const result = useMemo(
    () => projectWealth({ extraMonthly: extra, annualRatePct: rate, events }),
    [extra, rate, eventIds] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const baseline = useMemo(() => projectWealth({ extraMonthly: 0, annualRatePct: 11 }), []);

  const toggleEvent = (id) =>
    setEventIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  useEffect(() => {
    awardXP(20, 'simulator');
  }, []);

  const yearsEarlier =
    result.fireAge && baseline.fireAge ? baseline.fireAge - result.fireAge : 0;
  const newlyPossible = result.fireAge && !baseline.fireAge;

  return (
    <div className="sim">
      <h2>Time Machine<sup>®</sup></h2>
      <p className="sim-sub">
        Drag the levers. Watch your future move. Financial freedom is a corpus of 25× your yearly expenses, inflation-adjusted.
      </p>

      <div className="sim-card">
        <div className="sim-label">
          <span>Extra monthly investment</span>
          <b>{fmt(extra)}</b>
        </div>
        <input
          type="range"
          min="0"
          max="40000"
          step="1000"
          value={extra}
          style={{ '--fill': `${(extra / 40000) * 100}%` }}
          onChange={(e) => setExtra(+e.target.value)}
        />
        <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: -6 }}>
          MITRA detected {fmt(cf.surplus)}/month of investable surplus — try dragging there.
        </div>

        <div className="sim-label" style={{ marginTop: 16 }}>
          <span>Market scenario</span>
        </div>
        <div className="scenario-pills">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              className={`scenario-pill ${scenario === s.id ? 'active' : ''}`}
              onClick={() => setScenario(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="sim-label" style={{ marginTop: 16 }}>
          <span>Life events. Toggle what life might throw.</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {LIFE_EVENTS.map((e) => {
            const on = eventIds.includes(e.id);
            return (
              <button
                key={e.id}
                onClick={() => toggleEvent(e.id)}
                style={{
                  border: 'none', borderRadius: 980, cursor: 'pointer',
                  padding: '9px 15px', fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
                  background: on ? 'var(--blue)' : 'var(--card-2)',
                  color: on ? '#fff' : 'var(--ink)',
                  transition: 'all .25s',
                }}
              >
                {e.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="sim-card">
        <ProjectionChart series={result.series} fireAge={result.fireAge} events={events} height={160} />
        <div className="sim-stats">
          <div className="sim-stat hero">
            Financial freedom
            <b>{result.fireAge ? `age ${result.fireAge}` : 'after 60'}</b>
          </div>
          <div className="sim-stat">
            Wealth at 60
            <b>{fmtCompact(result.wealthAt60)}</b>
          </div>
          <div className="sim-stat">
            You invest
            <b>{fmtCompact(result.invested)}</b>
          </div>
        </div>
        {(yearsEarlier > 0 || newlyPossible) && (
          <div
            style={{
              marginTop: 12, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)',
              background: 'rgba(255,138,60,0.1)', border: '1px solid rgba(255,138,60,0.3)',
              borderRadius: 14, padding: '12px 14px', lineHeight: 1.55,
            }}
          >
            {newlyPossible ? (
              <>On your current path, freedom never arrives before 60. This plan makes it happen at <u>age {result.fireAge}</u>.</>
            ) : (
              <>This plan buys {customer.name.split(' ')[0]} freedom <u>{yearsEarlier} year{yearsEarlier > 1 ? 's' : ''} earlier</u> than doing nothing differently.</>
            )}
          </div>
        )}
      </div>

      <button
        className="primary-btn"
        style={{ marginTop: 14 }}
        onClick={() => onAsk(`calculate sip of ${extra} for ${60 - customer.age} years`)}
      >
        Ask MITRA to set this plan up →
      </button>
    </div>
  );
}
