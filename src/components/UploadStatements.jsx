import React, { useRef, useState } from 'react';
import Avatar from './Avatar.jsx';
import { buildCustomPersona } from '../engine/personaBuilder.js';
import { saveCustomPersonaAndActivate } from '../data/personas.js';
import { getSession } from '../engine/auth.js';
import { analyseStatements } from '../engine/api.js';

const SAMPLE_BANK = '/samples/sample-bank-statement.csv';
const SAMPLE_HOLDINGS = '/samples/sample-holdings.csv';

const ANALYSE_STEPS = [
  'Reading your file…',
  'Extracting transactions…',
  'Categorising spending…',
  'Reading portfolio holdings…',
  'Computing your risk profile…',
];

function isCSV(file) {
  return /\.csv$/i.test(file.name) || file.type === 'text/csv';
}

export default function UploadStatements({ onBack }) {
  const session = getSession();
  const [bankFile, setBankFile] = useState(null);
  const [holdingsFile, setHoldingsFile] = useState(null);
  const [phase, setPhase] = useState('pick'); // pick | analysing | details
  const [stepIdx, setStepIdx] = useState(0);
  const [dragOver, setDragOver] = useState(null); // 'bank' | 'holdings' | null
  const [parsed, setParsed] = useState({ holdings: [], transactions: [] });
  const [name, setName] = useState(session?.name || '');
  const [age, setAge] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState('');
  const bankInputRef = useRef(null);
  const holdingsInputRef = useRef(null);

  const canAnalyse = bankFile || holdingsFile;

  const runAnalysis = async () => {
    setPhase('analysing');
    setError('');
    try {
      setStepIdx(0);
      const result = await analyseStatements({
        bankName: bankFile?.name,
        bankText: bankFile && isCSV(bankFile) ? await bankFile.text() : undefined,
        holdingsName: holdingsFile?.name,
        holdingsText: holdingsFile && isCSV(holdingsFile) ? await holdingsFile.text() : undefined,
      });
      setStepIdx(4);
      setParsed({ holdings: result.holdings, transactions: result.transactions, rejected: result.rejected });
      setPhase('details');
    } catch (err) {
      setError(err.message);
      setPhase('pick');
    }
  };

  const finish = async () => {
    const { persona, riskProfile } = buildCustomPersona({
      name, age: age ? parseInt(age, 10) : undefined, city,
      holdings: parsed.holdings, transactions: parsed.transactions,
      sources: [bankFile?.name, holdingsFile?.name].filter(Boolean),
    });
    try {
      await saveCustomPersonaAndActivate(persona, riskProfile, [bankFile?.name, holdingsFile?.name].filter(Boolean));
      sessionStorage.setItem('mitra_land_tab', 'mitra');
      window.location.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  if (phase === 'analysing') {
    return (
      <div className="onboard" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="avatar-svg-wrap" style={{ width: 96, height: 96 }}>
          <Avatar size={96} mood="thinking" />
        </div>
        <h2 style={{ fontSize: 22 }}>Analysing your statement…</h2>
        <p className="ob-sub">{ANALYSE_STEPS[stepIdx]}</p>
        <div className="ob-progress" style={{ width: 220 }}>
          <i style={{ width: `${((stepIdx + 1) / ANALYSE_STEPS.length) * 100}%` }} />
        </div>
      </div>
    );
  }

  if (phase === 'details') {
    const noRealData = !parsed.holdings.length && !parsed.transactions.length;
    return (
      <div className="onboard">
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div className="avatar-svg-wrap" style={{ width: 96, height: 96 }}>
            <Avatar size={96} mood="excited" />
          </div>
        </div>
        <h2 style={{ fontSize: 24 }}>Here's what I found</h2>
        <p className="ob-sub">
          {noRealData
            ? "PDF statements can't be read for real in this prototype — I'll set up a starter profile instead, which you can refine from Settings."
            : `${parsed.transactions.length ? `${parsed.transactions.length} transactions` : ''}${parsed.transactions.length && parsed.holdings.length ? ' and ' : ''}${parsed.holdings.length ? `${parsed.holdings.length} holdings` : ''} — a couple of details and I'll finish building your profile.`}
        </p>
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
        {error && <div className="auth-error">{error}</div>}
      </div>
    );
  }

  const dropZone = (kind, file, setFile, inputRef, label, hint, sampleHref) => (
    <div
      className="upload-zone"
      style={{ borderColor: dragOver === kind ? 'var(--blue-link)' : undefined }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(kind); }}
      onDragLeave={() => setDragOver(null)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(null);
        const f = e.dataTransfer.files?.[0];
        if (f) setFile(f);
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700 }}>{label}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', fontWeight: 400, marginTop: 2 }}>{hint}</div>
        </div>
      </div>
      {file ? (
        <div style={{ marginTop: 10, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📄 {file.name}</span>
          <button className="ghost-btn" style={{ margin: 0, padding: '5px 12px' }} onClick={() => setFile(null)}>
            Remove
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button className="ghost-btn" style={{ margin: 0 }} onClick={() => inputRef.current?.click()}>
            Choose file
          </button>
          <a className="ghost-btn" style={{ margin: 0, textDecoration: 'none' }} href={sampleHref} download>
            Sample CSV
          </a>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.pdf"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
      />
    </div>
  );

  return (
    <div className="onboard">
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div className="avatar-svg-wrap" style={{ width: 96, height: 96 }}>
          <Avatar size={96} mood="happy" />
        </div>
      </div>
      <h2 style={{ fontSize: 26 }}>Upload your statements</h2>
      <p className="ob-sub">
        CSV files are read for real — I'll extract transactions and holdings myself, right here in your browser.
      </p>

      {dropZone('bank', bankFile, setBankFile, bankInputRef, 'Bank statement', 'CSV or PDF · date, description, amount', SAMPLE_BANK)}
      {dropZone('holdings', holdingsFile, setHoldingsFile, holdingsInputRef, 'Investment holdings', 'CSV export from any broker · name, type, value', SAMPLE_HOLDINGS)}

      <button className="primary-btn" style={{ marginTop: 18 }} disabled={!canAnalyse} onClick={runAnalysis}>
        {canAnalyse ? 'Analyse my statements' : 'Add a file to continue'}
      </button>
      {error && <div className="auth-error">{error}</div>}
      <button className="ghost-btn" style={{ marginTop: 12, alignSelf: 'center' }} onClick={onBack}>
        ← Back
      </button>

      <div style={{ marginTop: 14, fontSize: 11, color: 'var(--ink-soft)', textAlign: 'center', lineHeight: 1.6 }}>
        CSV content is sent to the local MITRA API, parsed there, and only the derived profile is retained.
      </div>
    </div>
  );
}
