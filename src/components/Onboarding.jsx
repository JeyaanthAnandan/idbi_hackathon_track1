import React, { useState } from 'react';
import Avatar from './Avatar.jsx';
import { riskQuestions, riskProfileFromScore, modelPortfolios } from '../data/customer.js';
import { Donut } from './charts.jsx';

// Conversational risk profiling — MITRA "asks", customer taps.
// Output feeds every recommendation in the app (SEBI-style suitability).
export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const [score, setScore] = useState(0);

  const finished = step >= riskQuestions.length;
  const profile = finished ? riskProfileFromScore(score) : null;

  return (
    <div className="onboard">
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div className="avatar-svg-wrap" style={{ width: 96, height: 96 }}>
          <Avatar size={96} mood={finished ? 'excited' : 'happy'} />
        </div>
      </div>

      {!finished ? (
        <>
          <h2>Let's understand you, Priya</h2>
          <p className="ob-sub">
            4 quick questions so every recommendation I make fits <b>your</b> comfort with risk — not a generic template.
          </p>
          <div className="ob-progress">
            <i style={{ width: `${(step / riskQuestions.length) * 100}%` }} />
          </div>
          <div className="ob-q">{riskQuestions[step].q}</div>
          {riskQuestions[step].options.map((o) => (
            <button
              className="ob-option"
              key={o.label}
              onClick={() => {
                setScore((s) => s + o.score);
                setStep((s) => s + 1);
              }}
            >
              {o.label}
            </button>
          ))}
        </>
      ) : (
        <>
          <h2>You're a {profile} investor</h2>
          <span className="profile-badge">{profile} · ~{modelPortfolios[profile].expectedReturn}% expected p.a.</span>
          <p className="ob-sub">
            I'll tailor every SIP, fund and nudge to this profile — and re-check it yearly or when your life changes.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '18px 0' }}>
            <Donut
              segments={modelPortfolios[profile].mix}
              size={150}
              thickness={22}
              centerTop={profile}
              centerBottom="portfolio"
            />
          </div>
          <div className="legend" style={{ marginBottom: 10 }}>
            {modelPortfolios[profile].mix.map((m) => (
              <div className="legend-row" key={m.name}>
                <span className="legend-dot" style={{ background: m.color }} />
                {m.name}
                <small>{m.pct}%</small>
              </div>
            ))}
          </div>
          <button className="primary-btn" onClick={() => onDone(profile)}>
            Meet MITRA, my advisor →
          </button>
        </>
      )}
    </div>
  );
}
