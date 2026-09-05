import React, { useState } from 'react';
import Avatar from './Avatar.jsx';
import { PROVIDERS } from '../engine/mockProviderData.js';
import { buildCustomPersona } from '../engine/personaBuilder.js';
import { saveCustomPersonaAndActivate } from '../data/personas.js';
import { getSession } from '../engine/auth.js';
import { connectSandbox } from '../engine/api.js';

const PROVIDER_LIST = Object.values(PROVIDERS);
const BADGE_COLOR = { zerodha: '#387ed1', upstox: '#7e3ff2', groww: '#00d09c', indmoney: '#3643ba', bank: 'var(--teal)' };

function ProviderBadge({ id }) {
  return (
    <span
      style={{
        width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center',
        background: BADGE_COLOR[id] || 'var(--card-2)', color: '#fff', fontWeight: 700, fontSize: 15, flexShrink: 0,
      }}
    >
      {PROVIDERS[id].label[0]}
    </span>
  );
}

export default function ConnectAccounts({ onBack }) {
  const session = getSession();
  const [connected, setConnected] = useState({}); // providerId -> { holdings?, transactions? }
  const [phase, setPhase] = useState('list'); // list | consent | connecting | details
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState(session?.name || '');
  const [age, setAge] = useState('');
  const [city, setCity] = useState('');

  const provider = activeId ? PROVIDERS[activeId] : null;
  const connectedCount = Object.keys(connected).length;

  const startConnect = (id) => {
    setActiveId(id);
    setError('');
    setPhase('consent');
  };

  const submitConsent = async () => {
    setPhase('connecting');
    try {
      const result = await connectSandbox(activeId);
      setConnected((c) => ({ ...c, [activeId]: result }));
      setPhase('list');
      setActiveId(null);
    } catch (err) {
      setError(err.message);
      setPhase('list');
    }
  };

  const finish = async () => {
    const holdings = Object.values(connected).flatMap((d) => d.holdings || []);
    const transactions = Object.values(connected).flatMap((d) => d.transactions || []);
    const sources = Object.keys(connected).map((id) => PROVIDERS[id].label);
    const { persona, riskProfile } = buildCustomPersona({
      name, age: age ? parseInt(age, 10) : undefined, city, holdings, transactions, sources,
    });
    try {
      await saveCustomPersonaAndActivate(persona, riskProfile, sources.map((source) => `sandbox:${source}`));
      sessionStorage.setItem('mitra_land_tab', 'mitra');
      window.location.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  if (phase === 'consent' && provider) {
    return (
      <div className="onboard">
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <ProviderBadge id={provider.id} />
        </div>
        <h2 style={{ fontSize: 24 }}>
          {provider.kind === 'bank' ? 'Try the Account Aggregator sandbox' : `Try the ${provider.label} sandbox`}
        </h2>
        <p className="ob-sub">
          This creates a recorded sandbox consent and fetches a deterministic test fixture through the MITRA API.
          It does not contact {provider.label} or request any real credential.
        </p>
        <button className="primary-btn" style={{ marginTop: 18 }} onClick={submitConsent}>
          Approve sandbox consent
        </button>
        <button className="ghost-btn" style={{ marginTop: 12, alignSelf: 'center' }} onClick={() => setPhase('list')}>
          Cancel
        </button>
      </div>
    );
  }

  if (phase === 'connecting') {
    return (
      <div className="onboard" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="avatar-svg-wrap" style={{ width: 96, height: 96 }}>
          <Avatar size={96} mood="thinking" />
        </div>
        <h2 style={{ fontSize: 22 }}>Connecting to {provider?.label}…</h2>
        <p className="ob-sub">Calling the local connector API and recording consent.</p>
      </div>
    );
  }

  if (phase === 'details') {
    return (
      <div className="onboard">
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div className="avatar-svg-wrap" style={{ width: 96, height: 96 }}>
            <Avatar size={96} mood="excited" />
          </div>
        </div>
        <h2 style={{ fontSize: 24 }}>Almost there</h2>
        <p className="ob-sub">A couple of details so I can personalize this further.</p>
        <div className="settings-row">
          <input type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="settings-row">
          <input type="number" placeholder="Age" value={age} onChange={(e) => setAge(e.target.value)} />
        </div>
        <div className="settings-row">
          <input type="text" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <button className="primary-btn" style={{ marginTop: 18 }} onClick={finish}>
          Build my profile →
        </button>
      </div>
    );
  }

  return (
    <div className="onboard">
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div className="avatar-svg-wrap" style={{ width: 96, height: 96 }}>
          <Avatar size={96} mood="happy" />
        </div>
      </div>
      <h2 style={{ fontSize: 26 }}>Connect your accounts</h2>
      <p className="ob-sub">
        Exercise the real consent and API flow with deterministic sandbox data. For your own numbers, use statement upload.
      </p>

      <div style={{ fontSize: 11, color: 'var(--orange)', textAlign: 'center', marginBottom: 8, fontWeight: 700 }}>
        SANDBOX · no live provider connection
      </div>

      {PROVIDER_LIST.map((p) => {
        const isConnected = !!connected[p.id];
        return (
          <button
            key={p.id}
            className="ob-option"
            disabled={isConnected}
            onClick={() => startConnect(p.id)}
            style={isConnected ? { opacity: 0.7 } : undefined}
          >
            <ProviderBadge id={p.id} />
            <div>
              <div style={{ fontWeight: 700 }}>{p.label}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', fontWeight: 400, marginTop: 2 }}>{p.blurb}</div>
            </div>
            {isConnected && (
              <span style={{ marginLeft: 'auto', color: 'var(--green)', fontWeight: 600, fontSize: 12.5 }}>✓ Connected</span>
            )}
          </button>
        );
      })}

      <button
        className="primary-btn"
        style={{ marginTop: 18 }}
        disabled={connectedCount === 0}
        onClick={() => setPhase('details')}
      >
        {connectedCount === 0 ? 'Connect at least one account' : `Continue with ${connectedCount} connected`}
      </button>
      {error && <div className="auth-error">{error}</div>}
      <button className="ghost-btn" style={{ marginTop: 12, alignSelf: 'center' }} onClick={onBack}>
        ← Back
      </button>

      <div style={{ marginTop: 14, fontSize: 11, color: 'var(--ink-soft)', textAlign: 'center', lineHeight: 1.6 }}>
        API-backed sandbox fixtures. Live AA/broker access requires provider credentials and certification.
      </div>
    </div>
  );
}
