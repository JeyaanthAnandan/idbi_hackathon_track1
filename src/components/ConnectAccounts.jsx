import React, { useState } from 'react';
import TalkingHeadAvatar from './TalkingHeadAvatar.jsx';
import { PROVIDERS } from '../engine/mockProviderData.js';
import { buildCustomPersona } from '../engine/personaBuilder.js';
import { saveCustomPersonaAndActivate } from '../data/personas.js';
import { getSession } from '../engine/auth.js';
import { connectSandbox, fetchIdbiConsentSnapshot, requestIdbiConsent, fetchIdbiSnapshot, getBootstrap } from '../engine/api.js';

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

const rupees = (value) => Number.isFinite(value) ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value) : 'Not supplied';
const dateLabel = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? String(iso) : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

// What IDBI lists as owed. Shown for review before anything is saved, with the
// reconciliation problems in plain view — these figures are reported, not verified.
export function LiabilitiesSummary({ liabilities }) {
  if (!liabilities?.loans) return null;
  return (
    <div role="region" aria-label="Loans reported by IDBI" style={{ marginTop: 16, lineHeight: 1.7 }}>
      <div style={{ fontWeight: 700 }}>Loans reported by IDBI · {liabilities.loans.length} account{liabilities.loans.length === 1 ? '' : 's'}</div>
      <div style={{ fontSize: 12.5 }}>
        {rupees(liabilities.totalOutstanding)} outstanding
        {liabilities.allStandard ? ' · all standard, none overdue' : ' · some overdue or non-standard'}
      </div>
      <div style={{ overflowX: 'auto', marginTop: 6 }}>
        <table style={{ width: '100%', fontSize: 12, textAlign: 'left' }}>
          <caption style={{ textAlign: 'left', color: 'var(--ink-soft)' }}>Itemised by IDBI's loan list</caption>
          <thead><tr><th>Account</th><th>Outstanding</th><th>Days past due</th><th>Status</th><th>Contract</th></tr></thead>
          <tbody>
            {liabilities.loans.map((loan) => (
              <tr key={loan.accountId}>
                <td>{loan.maskedAccountNumber}</td>
                <td>{rupees(loan.outstanding)}</td>
                <td>{loan.dpd}</td>
                <td>{loan.npaStatus === 'SA' ? 'Standard' : loan.npaStatus || '—'}</td>
                <td>{loan.terms ? `${loan.terms.rate}% · EMI ${rupees(loan.terms.emi)}` : 'No terms'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {liabilities.exposure?.totalOutstanding != null && (
        <div style={{ fontSize: 12, marginTop: 6 }}>
          IDBI's exposure summary: {rupees(liabilities.exposure.totalOutstanding)} outstanding of {rupees(liabilities.exposure.totalLimit)} sanctioned across all facilities.
        </div>
      )}
      {(liabilities.warnings || []).map((warning, index) => <p key={index} style={{ fontSize: 12, color: 'var(--orange)', margin: '6px 0 0' }}>{warning}</p>)}
    </div>
  );
}

export default function ConnectAccounts({ onBack, riskProfileOverride = null }) {
  const session = getSession();
  const boot = getBootstrap();
  const idbiEnabled = Boolean(boot.connectors?.idbi?.enabled);
  const sandboxCustomers = boot.connectors?.idbi?.customers || [];
  const [customerId, setCustomerId] = useState(boot.connectors?.idbi?.defaultCustomer || sandboxCustomers[0]?.id || '');
  const [connected, setConnected] = useState({}); // providerId -> { holdings?, transactions? }
  const [phase, setPhase] = useState('list'); // list | consent | consent-pending | connecting | details
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(null);
  const [saving, setSaving] = useState(false);
  const name = session?.name || '';

  const provider = activeId ? PROVIDERS[activeId] : null;
  const connectedCount = Object.keys(connected).length;
  const snapshots = Object.values(connected);
  const transactions = snapshots.flatMap(s => s.transactions || []);
  const holdings = snapshots.flatMap(s => s.holdings || []);
  const bank = connected.bank;
  const money = (value) => Number.isFinite(value) ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value) : 'Not supplied';

  const fetchDirect = async () => {
    setActiveId('bank');
    setError('');
    setPhase('connecting');
    try {
      const result = await fetchIdbiSnapshot(customerId || undefined);
      setConnected(c => ({ ...c, bank: result }));
      setPhase('details');
    } catch (err) {
      setError(err.message);
      setPhase('list');
    }
  };

  const startConnect = (id) => {
    setActiveId(id);
    setError('');
    setPhase('consent');
  };

  const submitConsent = async () => {
    setPhase('connecting');
    try {
      let result;
      if (activeId === 'bank') {
        const requested = await requestIdbiConsent();
        setConsent(requested);
        setPhase('consent-pending');
        return;
      } else result = await connectSandbox(activeId);
      setConnected((c) => ({ ...c, [activeId]: result }));
      setPhase('list');
      setActiveId(null);
    } catch (err) {
      setError(err.message);
      setPhase('list');
    }
  };

  const loadConsentData = async () => {
    setPhase('connecting');
    try {
      const result = await fetchIdbiConsentSnapshot({ consentHandle: consent?.consentHandle });
      setConnected((c) => ({ ...c, bank: result }));
      setPhase('details');
      setActiveId(null);
      setConsent(null);
    } catch (err) {
      setError(err.message);
      setPhase('consent-pending');
    }
  };

  const finish = async () => {
    setSaving(true);
    setError('');
    const sources = Object.keys(connected).map((id) => PROVIDERS[id].label);
    const { persona, riskProfile } = buildCustomPersona({
      name, age: boot.profile?.persona.customer.age, city: boot.profile?.persona.customer.city, holdings, transactions, sources, snapshots,
    });
    try {
      // An explicitly answered quiz outranks a profile derived from a bank-only
      // snapshot, which cannot see horizon or loss tolerance at all.
      await saveCustomPersonaAndActivate(persona, riskProfileOverride || riskProfile, sources.map((source) => `sandbox:${source}`));
      sessionStorage.setItem('mitra_land_tab', 'mitra');
      const url = new URL(window.location.href);
      url.searchParams.delete('connect');
      window.history.replaceState(null, '', url.toString());
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setSaving(false);
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
          {provider.kind === 'bank' ? 'This starts the IDBI sandbox consent flow when configured. Approval happens on the Account Aggregator page; MITRA receives test account data.' : `This loads a recorded ${provider.label} sandbox fixture through MITRA.`}
        </p>
        <button className="primary-btn" style={{ marginTop: 18 }} onClick={submitConsent}>
          Start sandbox connection
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
          <TalkingHeadAvatar size={96} mood="thinking" />
        </div>
        <h2 style={{ fontSize: 22 }}>Connecting to {provider?.label}…</h2>
        <p className="ob-sub">Fetching the response through the MITRA server. Your profile changes only after you review it.</p>
      </div>
    );
  }

  if (phase === 'consent-pending' && provider) {
    return (
      <div className="onboard">
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <ProviderBadge id={provider.id} />
        </div>
        <h2 style={{ fontSize: 24 }}>Approve your data consent</h2>
        <p className="ob-sub">
          IDBI has created a pending consent. Open the registered Account Aggregator page,
          approve access, then fetch the approved statement into MITRA.
        </p>
        {consent?.status && <div style={{ fontSize: 12, color: 'var(--orange)', textAlign: 'center' }}>Consent status: {consent.status}</div>}
        {consent?.redirectUrl && (
          <button className="primary-btn" style={{ marginTop: 18 }} onClick={() => window.open(consent.redirectUrl, '_blank', 'noopener,noreferrer')}>
            Open IDBI consent page ↗
          </button>
        )}
        <button className="primary-btn" style={{ marginTop: 12 }} onClick={loadConsentData}>
          Fetch approved data
        </button>
        {error && <div className="auth-error">{error}</div>}
        <button className="ghost-btn" style={{ marginTop: 12 }} onClick={fetchDirect}>Use direct sandbox test data instead</button>
        <button className="ghost-btn" style={{ marginTop: 12, alignSelf: 'center' }} onClick={() => setPhase('list')}>
          Cancel
        </button>
      </div>
    );
  }

  if (phase === 'details') {
    return (
      <div className="onboard">
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div className="avatar-svg-wrap" style={{ width: 96, height: 96 }}>
            <TalkingHeadAvatar size={96} mood="excited" />
          </div>
        </div>
        <h2 style={{ fontSize: 24 }}>Review fetched data</h2>
        <p className="ob-sub">{bank?.mode === 'IDBI_SANDBOX_DIRECT' ? 'Fetched from the IDBI sandbox gateway. This is bank-provided test data; it does not represent your personal bank account or an approved AA consent.' : bank?.mode === 'IDBI_SANDBOX_CONSENT' ? 'Fetched from the IDBI sandbox through the matched consent.' : 'Local demonstration fixtures.'}</p>
        <div role="status" style={{ lineHeight: 1.8 }}>
          <div><strong>{transactions.length} transactions · {holdings.length} holdings</strong></div>
          {bank?.fetchedAt && <div>Fetched: {new Date(bank.fetchedAt).toLocaleString()}</div>}
          {bank?.dataAsOf && <div>Latest transaction: {bank.dataAsOf}</div>}
          {bank?.account && <><div>Reported balance: {money(bank.account.balance)}</div><div>Available balance: {money(bank.account.availableBalance)}</div><div>Lien: {money(bank.account.lienBalance)}{bank.account.lien?.endDate ? ` · held until ${dateLabel(bank.account.lien.endDate)}` : ''}</div></>}
        </div>
        <LiabilitiesSummary liabilities={bank?.liabilities} />
        {transactions.length > 0 && <div style={{ overflowX: 'auto', marginTop: 16 }}><table style={{ width: '100%', fontSize: 12, textAlign: 'left' }}><caption>First five returned transactions</caption><thead><tr><th>Date</th><th>Description</th><th>Amount</th></tr></thead><tbody>{transactions.slice(0, 5).map((t, index) => <tr key={`${t.sourceId}-${index}`}><td>{t.date}</td><td>{t.description}</td><td>{t.type === 'debit' ? '−' : '+'}{money(t.amount)}</td></tr>)}</tbody></table></div>}
        {bank?.provenance?.apis && <p className="ob-sub" style={{ fontSize: 11 }}>Source: {bank.provenance.apis.join(' · ')}</p>}
        {snapshots.flatMap(s => s.warnings || []).map((warning, index) => <p key={index} style={{ fontSize: 12, color: 'var(--orange)' }}>{warning}</p>)}
        {boot.profile && <p className="ob-sub">Using this snapshot replaces your current financial profile and starts a new chat.</p>}
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="primary-btn" style={{ marginTop: 18 }} onClick={finish} disabled={saving}>
          {saving ? 'Saving…' : 'Use this data with MITRA →'}
        </button>
        <button className="ghost-btn" style={{ marginTop: 12 }} onClick={() => setPhase('list')} disabled={saving}>Back to connections</button>
      </div>
    );
  }

  return (
    <div className="onboard">
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div className="avatar-svg-wrap" style={{ width: 96, height: 96 }}>
          <TalkingHeadAvatar size={96} mood="happy" />
        </div>
      </div>
      <h2 style={{ fontSize: 26 }}>Connect / refresh data</h2>
      <p className="ob-sub">
        Fetch bank-provided sandbox accounts and transactions, review the response, then let MITRA explain the data. No risk questionnaire is required.
      </p>

      <div style={{ fontSize: 11, color: 'var(--orange)', textAlign: 'center', marginBottom: 8, fontWeight: 700 }}>
        SANDBOX · test data only
      </div>

      <div role="status" style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
        {!boot.available ? 'The account service is unavailable on this site. A running MITRA server is required to connect.' : idbiEnabled ? 'IDBI sandbox connector is enabled. Each fetch calls the gateway.' : 'The IDBI sandbox connector is disabled on this server. Local demo data will not be substituted.'}
      </div>
      {sandboxCustomers.length > 1 && (
        <>
          <label className="settings-label">Sandbox customer</label>
          <div className="settings-row" role="radiogroup" aria-label="Sandbox customer" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {sandboxCustomers.map((c) => (
              <button
                key={c.id}
                className="ghost-btn"
                role="radio"
                aria-checked={customerId === c.id}
                disabled={!idbiEnabled}
                style={customerId === c.id ? { background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)' } : undefined}
                onClick={() => setCustomerId(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </>
      )}
      <button className="primary-btn" onClick={fetchDirect} disabled={!idbiEnabled}>Fetch IDBI sandbox data</button>
      <p className="ob-sub" style={{ fontSize: 12 }}>Direct sandbox test data · accounts, balances, lien, statement, loans and credit exposure · no personal bank login</p>
      <button className="ghost-btn" onClick={() => startConnect('bank')} disabled>
        Account Aggregator consent · unavailable
      </button>

      <details style={{ marginTop: 16 }}><summary>Other providers · local demo fixtures</summary>
      {PROVIDER_LIST.filter(p => p.id !== 'bank').map((p) => {
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
      })}</details>

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
