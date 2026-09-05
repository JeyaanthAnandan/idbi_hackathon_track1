import React, { memo } from 'react';

const pct = (value) => `${Math.round(Number(value || 0) * 100)}%`;

const AdvicePassport = memo(function AdvicePassport({ passport }) {
  if (!passport) return null;
  const shortHash = passport.receiptHash ? passport.receiptHash.slice(0, 12) : null;
  return (
    <div className="advice-passport">
      <details>
        <summary>
          <span>Advice Passport</span>
          <span className="passport-confidence">{pct(passport.confidence)} confidence</span>
        </summary>
        <div className="passport-grid">
          <div><small>Mode</small><b>{passport.engineMode}</b></div>
          <div><small>Policy</small><b>{passport.policyVersion}</b></div>
          <div><small>Data as of</small><b>{passport.dataAsOf}</b></div>
          <div><small>Action state</small><b>{passport.action?.status}</b></div>
          {passport.issuedAt ? <div><small>Receipt issued</small><b>{new Date(passport.issuedAt).toLocaleString('en-IN')}</b></div> : null}
        </div>
        <div className="passport-section">
          <small>Formula</small>
          <p>{passport.formula}</p>
        </div>
        <div className="passport-section">
          <small>Evidence used</small>
          {passport.evidence?.map((item) => (
            <div className="passport-evidence" key={`${item.field}-${item.source}-${item.asOf}`}>
              <span>{item.field}</span><b>{item.value}</b>
            </div>
          ))}
        </div>
        <div className="passport-foot">
          {shortHash ? `API receipt ${shortHash}… · tamper-evident chain` : 'Local preview · sign in to persist an API receipt'}
        </div>
      </details>
    </div>
  );
});

export default AdvicePassport;
