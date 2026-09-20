import React, { useEffect, useState } from 'react';
import { dataQuality, holdings } from '../data/customer.js';
import { getBootstrap } from '../engine/api.js';
import { POLICY } from '../data/policy.js';

export default function DataStatus({ onConnect }) {
  const [syncError, setSyncError] = useState(false);
  useEffect(() => {
    const update = (event) => setSyncError(!event.detail.ok);
    window.addEventListener('mitra-sync', update);
    return () => window.removeEventListener('mitra-sync', update);
  }, []);
  const boot = getBootstrap();
  const sources = boot.profile?.sources || dataQuality.sources || [];
  const demo = sources.some((s) => /^(sandbox|synthetic):/.test(s)) || dataQuality.connections?.some(s => s.mode?.includes('SANDBOX')) || !boot.session;
  const idbiConnection = dataQuality.connections?.find(s => s.mode?.startsWith('IDBI_'));
  return (
    <div className="web-span" role="status" style={{ padding: '12px 18px', fontSize: 12, lineHeight: 1.6, color: 'var(--ink-soft)', background: 'var(--card)', borderRadius: 12 }}>
      <strong>{idbiConnection ? 'IDBI gateway · sandbox data' : demo ? 'Local demo data' : boot.profile ? 'Uploaded financial data' : 'No financial data connected'}</strong>
      {' · '}{dataQuality.transactionMonths} observed transaction months · {holdings.length} holdings
      {dataQuality.dataAsOf && <> · Latest transaction: {dataQuality.dataAsOf}</>}
      {idbiConnection?.fetchedAt && <div>Last fetched from IDBI: {new Date(idbiConnection.fetchedAt).toLocaleString()}</div>}
      {dataQuality.transactionMonths < POLICY.confidence.minimumMonthsForTrend && <div>Trend advice needs at least {POLICY.confidence.minimumMonthsForTrend} observed months. Missing tax, insurance and loan details cannot be inferred from these balances.</div>}
      {syncError && <div style={{ color: 'var(--orange)' }}>Server save failed. Your latest changes may be lost if you reload. Keep this page open and check the API connection.</div>}
      {onConnect && <button type="button" className="ghost-btn" style={{ marginTop: 8 }} onClick={onConnect}>{boot.session ? 'Connect / refresh data' : 'Log in to connect IDBI sandbox data'}</button>}
    </div>
  );
}
