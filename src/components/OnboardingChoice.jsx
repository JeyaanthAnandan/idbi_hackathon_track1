import React, { useState } from 'react';
import TalkingHeadAvatar from './TalkingHeadAvatar.jsx';
import Onboarding from './Onboarding.jsx';
import ConnectAccounts from './ConnectAccounts.jsx';
import UploadStatements from './UploadStatements.jsx';
import { getSession } from '../engine/auth.js';

// Entry point after login: let the customer prove who they are with real
// data (connect an account / upload a statement) instead of self-reporting
// via the quiz. The quiz stays as a no-data-shared fallback.
export default function OnboardingChoice({ onDone }) {
  const [mode, setMode] = useState('choice'); // 'choice' | 'connect' | 'upload' | 'quiz'
  // A risk profile the customer stated in the quiz before connecting data.
  // Derived-from-data risk wins on its own, but an explicit answer should not
  // be silently discarded just because the customer went on to connect a bank.
  const [statedRisk, setStatedRisk] = useState(null);
  const session = getSession();
  const firstName = session?.name?.trim().split(' ')[0] || 'there';

  if (mode === 'quiz') return (
    <Onboarding
      onDone={onDone}
      onConnect={(profile) => { setStatedRisk(profile); setMode('connect'); }}
      onUpload={(profile) => { setStatedRisk(profile); setMode('upload'); }}
    />
  );
  if (mode === 'connect') return <ConnectAccounts riskProfileOverride={statedRisk} onBack={() => setMode('choice')} />;
  if (mode === 'upload') return <UploadStatements riskProfileOverride={statedRisk} onBack={() => setMode('choice')} />;

  return (
    <div className="onboard">
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div className="avatar-svg-wrap" style={{ width: 96, height: 96 }}>
          <TalkingHeadAvatar size={96} mood="happy" />
        </div>
      </div>

      <h2>Choose data for MITRA, {firstName}</h2>
      <p className="ob-sub">
        Fetch accounts and transactions from the IDBI sandbox, or upload your own CSV statement. The risk quiz is optional and does not connect financial data.
      </p>

      <button className="ob-option" onClick={() => setMode('connect')}>
        <div>
          <div style={{ fontWeight: 700 }}>Connect IDBI sandbox data</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', fontWeight: 400, marginTop: 3 }}>
            Fetch from IDBI → review the response → use with MITRA
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
          <div style={{ fontWeight: 700 }}>Set my risk profile first</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', fontWeight: 400, marginTop: 3 }}>
            4 questions · no data shared · MITRA still needs a statement afterwards
          </div>
        </div>
      </button>
    </div>
  );
}
