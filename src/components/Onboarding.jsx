import React, { useState } from 'react';
import Avatar from './Avatar.jsx';
import Ring from './Ring.jsx';
import { riskQuestions, riskProfileFromScore, modelPortfolios, customer } from '../data/customer.js';
import { getSession } from '../engine/auth.js';
import { ConcentricRings } from './charts.jsx';

// Conversational risk profiling — MITRA "asks", customer taps.
// Output feeds every recommendation in the app (SEBI-style suitability).
// Runs on the night surface: this is the one screen before the bank exists.
//
// The quiz establishes *suitability*, never financial facts. On its own it
// leaves MITRA with no balances or transactions, so the closing screen asks
// for data rather than handing the customer an advisor that has to refuse
// every question. `onConnect`/`onUpload` are the two paths that fix that;
// continuing without them is still allowed, but it is named honestly.
export default function Onboarding({ onDone, onConnect, onUpload }) {
  const [step, setStep] = useState(0);
  const [score, setScore] = useState(0);
  const firstName = getSession()?.name?.trim().split(' ')[0] || customer.name.split(' ')[0];

  const finished = step >= riskQuestions.length;
  const profile = finished ? riskProfileFromScore(score) : null;

  return (
    <div className="onboard">
      <div className="ob-top">
        <div className="bank-logo"><img src="/idbi-logo.png" alt="IDBI Bank" /></div>
        <div className="ob-count">
          {finished ? 'Profile ready' : `Question ${String(step + 1).padStart(2, '0')} / ${String(riskQuestions.length).padStart(2, '0')}`}
        </div>
      </div>

      <div className="ob-progress">
        {riskQuestions.map((q, i) => (
          <i key={q.q} className={i <= step ? 'on' : ''} />
        ))}
      </div>

      <div className="ob-intro">
        <Ring size={58} dot={6}>
          <Avatar size={46} mood={finished ? 'excited' : 'happy'} />
        </Ring>
        <p>
          {finished
            ? "That's everything I need. Every number from here on is yours."
            : `MITRA is listening, ${firstName}. Four taps and every number after this is yours, not a template’s.`}
        </p>
      </div>

      {!finished ? (
        <>
          <h2>{riskQuestions[step].q}</h2>
          <div className="ob-options">
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
          </div>
          <div className="ob-foot">SEBI-style suitability · re-checked yearly</div>
        </>
      ) : (
        <>
          <h2>You’re a {profile} investor</h2>
          <span className="profile-badge">
            {profile} · ~{modelPortfolios[profile].expectedReturn}% expected p.a.
          </span>
          <p className="ob-sub">
            I’ll tailor every SIP, fund and nudge to this profile — and re-check it yearly or when your life changes.
          </p>

          <div style={{ display: 'flex', gap: 20, alignItems: 'center', margin: '26px 0 0' }}>
            <ConcentricRings
              segments={modelPortfolios[profile].mix.map((m) => ({ key: m.name, pct: m.pct, color: m.color }))}
              size={132}
            />
            <div className="legend">
              {modelPortfolios[profile].mix.map((m) => (
                <div className="legend-row" key={m.name}>
                  <span className="legend-dot" style={{ background: m.color }} />
                  {m.name}
                  <small>{m.pct}%</small>
                </div>
              ))}
            </div>
          </div>

          <div className="ob-handoff">
            <p className="ob-sub" style={{ marginBottom: 0 }}>
              That covers how much risk suits you. It does not tell me what you actually
              earn, hold or spend — so connect data next, or MITRA will have to decline
              every question about your money.
            </p>

            {onConnect && (
              <button className="primary-btn" style={{ marginTop: 18 }} onClick={() => onConnect(profile)}>
                Connect IDBI sandbox data →
              </button>
            )}
            {onUpload && (
              <button className="ghost-btn" style={{ marginTop: 10 }} onClick={() => onUpload(profile)}>
                Upload a CSV statement
              </button>
            )}
            <button
              className="ghost-btn"
              style={{ marginTop: 10, alignSelf: 'center' }}
              onClick={() => onDone(profile)}
            >
              Skip for now · concepts and what-ifs only
            </button>
          </div>
        </>
      )}
    </div>
  );
}
