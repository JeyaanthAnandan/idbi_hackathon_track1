import React, { useState } from 'react';
import Avatar from './Avatar.jsx';
import Onboarding from './Onboarding.jsx';
import ConnectAccounts from './ConnectAccounts.jsx';
import UploadStatements from './UploadStatements.jsx';
import { getSession } from '../engine/auth.js';

// Entry point after login: let the customer prove who they are with real
// data (connect an account / upload a statement) instead of self-reporting
// via the quiz. The quiz stays as a no-data-shared fallback.
export default function OnboardingChoice({ onDone }) {
  const [mode, setMode] = useState('choice'); // 'choice' | 'connect' | 'upload' | 'quiz'
  const session = getSession();
  const firstName = session?.name?.trim().split(' ')[0] || 'there';

  if (mode === 'quiz') return <Onboarding onDone={onDone} />;
  if (mode === 'connect') return <ConnectAccounts onBack={() => setMode('choice')} />;
  if (mode === 'upload') return <UploadStatements onBack={() => setMode('choice')} />;

  return (
    <div className="onboard">
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div className="avatar-svg-wrap" style={{ width: 96, height: 96 }}>
          <Avatar size={96} mood="happy" />
        </div>
      </div>

      <h2>How should I get to know you, {firstName}?</h2>
      <p className="ob-sub">
        Upload a CSV and I'll compute from your numbers, or exercise the account-consent flow with
        clearly labeled sandbox data. You can also answer the risk quiz without sharing data.
      </p>

      <button className="ob-option" onClick={() => setMode('connect')}>
        <div>
          <div style={{ fontWeight: 700 }}>Connect my accounts</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', fontWeight: 400, marginTop: 3 }}>
            API-backed sandbox · no live credentials
          </div>
        </div>
      </button>
      <button className="ob-option" onClick={() => setMode('upload')}>
        <div>
          <div style={{ fontWeight: 700 }}>Upload a statement</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', fontWeight: 400, marginTop: 3 }}>
            Real CSV parsing by the local MITRA API
          </div>
        </div>
      </button>
      <button className="ob-option" onClick={() => setMode('quiz')}>
        <div>
          <div style={{ fontWeight: 700 }}>Answer a quick quiz instead</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', fontWeight: 400, marginTop: 3 }}>
            4 questions · no data shared
          </div>
        </div>
      </button>
    </div>
  );
}
