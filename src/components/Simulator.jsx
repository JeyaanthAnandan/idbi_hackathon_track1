import React, { useEffect, useMemo, useState } from 'react';
import { ProjectionChart } from './charts.jsx';
import { fmt, fmtCompact, projectWealth, cashflow } from '../engine/analytics.js';
import { customer, dataQuality, totalWealth } from '../data/customer.js';
import { awardXP } from '../engine/xp.js';
import { returnScenario } from '../data/policy.js';

const balancedReturns = returnScenario('Balanced');
const SCENARIOS = ['bear', 'base', 'bull'].map((id) => ({
  id,
  label: `${id[0].toUpperCase()}${id.slice(1)} ${balancedReturns[id]}%`,
  rate: balancedReturns[id],
}));

// Life events — each reshapes the whole projection when toggled on.
// projectWealth only applies an event inside its own start→60 loop, so an
// event dated before the customer's current age renders as a toggle that
// silently does nothing. Past milestones are dropped rather than shown dead.
const ALL_LIFE_EVENTS = [
  { id: 'wedding', label: 'Wedding 31', short: 'W', age: 31, oneTime: 800000 },
  { id: 'child', label: 'Child 33', short: 'C', age: 33, oneTime: 300000, monthlyDelta: -8000 },
  { id: 'homebuy', label: 'Home 35', short: 'H', age: 35, oneTime: 2000000, monthlyDelta: -12000 },
  { id: 'parents', label: 'Parents 45', short: 'P', age: 45, monthlyDelta: -10000 },
];
const LIFE_EVENTS = ALL_LIFE_EVENTS.filter((e) => e.age > customer.age);

const MAX_EXTRA = 40000;

// Wealth Time Machine — live what-if simulation of the customer's future.
// Runs on the night surface: the age of financial freedom is the one
// display figure, and every drag recomputes it.
export default function Simulator({ onAsk }) {
  const [extra, setExtra] = useState(10000);
  const [scenario, setScenario] = useState('base');
  const [eventIds, setEventIds] = useState([]);
  const rate = SCENARIOS.find((s) => s.id === scenario).rate;
  const cf = cashflow();

  // A bank-only snapshot has no identifiable income and no portfolio scope,
  // so a *detected* surplus is out of reach — but compounding a stated
  // contribution against a known starting balance needs neither. The tab used
  // to refuse outright; now it runs on the customer's own stated number and
  // drops only the freedom age, which genuinely does require an expense
  // baseline. `events` go with it: they reprice a retirement date.
  const stated = dataQuality.portfolioComplete === false || !cf.incomeKnown;
  const events = stated ? [] : LIFE_EVENTS.filter((e) => eventIds.includes(e.id));

  const result = useMemo(
    () => projectWealth({ extraMonthly: extra, annualRatePct: rate, events, expenseBaselineKnown: !stated }),
    [extra, rate, eventIds, stated] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const baseline = useMemo(
    () => projectWealth({ extraMonthly: 0, annualRatePct: balancedReturns.base, expenseBaselineKnown: !stated }),
    [stated]
  );

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
      <div className="eyebrow" style={{ letterSpacing: '0.18em' }}>Time Machine® · what-if</div>

      {stated ? (
        <>
          <div className="eyebrow" style={{ marginTop: 14 }}>Projected wealth at 60</div>
          <div className="sim-hero" data-guide-target="simulator-chart">
            <div className="figure">{fmtCompact(result.wealthAt60)}</div>
            <p>
              From {fmtCompact(totalWealth())} connected today, investing<br />
              {fmt(extra)}/month at {rate}% until 60.
            </p>
          </div>
          <p className="ob-sub" style={{ fontSize: 12, marginTop: 10 }}>
            This compounds an amount <strong>you</strong> set against your connected balance. I can't show an
            age of financial freedom — that needs a real monthly expense baseline, and
            {cf.incomeKnown ? ' your portfolio scope is incomplete' : ' no identifiable income is connected'}.
            Returns are a policy scenario, not a guarantee.
          </p>
        </>
      ) : (
        <>
          <div className="eyebrow" style={{ marginTop: 14 }}>Age of financial freedom</div>
          <div className="sim-hero" data-guide-target="simulator-chart">
            <div className="figure">{result.fireAge ?? '60+'}</div>
            <p>
              {newlyPossible ? (
                <>Doing nothing differently,<br />freedom never arrives before 60.</>
              ) : yearsEarlier > 0 ? (
                <>{yearsEarlier} year{yearsEarlier > 1 ? 's' : ''} earlier than<br />doing nothing differently.</>
              ) : result.fireAge ? (
                <>On this plan, {customer.name.split(' ')[0]} stops<br />needing the salary at {result.fireAge}.</>
              ) : (
                <>On this path freedom never<br />arrives before 60. Drag a lever.</>
              )}
            </p>
          </div>
        </>
      )}

      <div className="sim-card">
        <ProjectionChart series={result.series} fireAge={result.fireAge} events={events} height={158} />
        <div className="sim-stats">
          <div className="sim-stat">
            Wealth at 60
            <b>{fmtCompact(result.wealthAt60)}</b>
          </div>
          <div className="sim-stat">
            You invest
            <b>{fmtCompact(result.invested)}</b>
          </div>
        </div>
      </div>

      <div className="sim-card">
        <div className="sim-label">
          <span>Extra monthly</span>
          <b>{fmt(extra)}</b>
        </div>
        <input
          type="range"
          min="0"
          max={MAX_EXTRA}
          step="1000"
          value={extra}
          style={{ '--fill': `${(extra / MAX_EXTRA) * 100}%` }}
          onChange={(e) => setExtra(+e.target.value)}
        />
        <div className="sim-hint">{cf.incomeKnown && !stated ? `Detected surplus ${fmt(cf.surplus)} — drag there` : 'No detected surplus — set the amount you know you can invest'}</div>

        <div className="scenario-pills" style={{ marginTop: 14 }}>
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

        {/* Events reprice a retirement date, which `stated` mode cannot show. */}
        {!stated && LIFE_EVENTS.length > 0 && <div className="event-pills" style={{ marginTop: 10 }}>
          {LIFE_EVENTS.map((e) => (
            <button
              key={e.id}
              className={`event-pill ${eventIds.includes(e.id) ? 'active' : ''}`}
              onClick={() => toggleEvent(e.id)}
            >
              {e.label}
            </button>
          ))}
        </div>}
      </div>

      <button
        className="primary-btn"
        style={{ marginTop: 12, marginBottom: 24 }}
        onClick={() => onAsk(`calculate sip of ${extra} for ${60 - customer.age} years`)}
      >
        Send this plan to MITRA →
      </button>
    </div>
  );
}
