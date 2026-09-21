import React, { useEffect, useState } from 'react';
import { dataQuality, holdings, liabilities } from '../data/customer.js';
import { getBootstrap } from '../engine/api.js';
import { POLICY } from '../data/policy.js';

const rupees = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
const dateLabel = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? String(iso) : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

export default function DataStatus({ onConnect, onAsk }) {
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
  const owed = liabilities?.loans?.length ? liabilities : null;
  const lien = idbiConnection?.accounts?.map((a) => a.lien).find((l) => l?.amount > 0);
  // Missing-data wording must follow what is actually connected: loans are now
  // fetched, so telling the customer loan details are absent is simply wrong.
  const needsHistory = dataQuality.transactionMonths < POLICY.confidence.minimumMonthsForTrend;
  const noLabels = Boolean(idbiConnection) && dataQuality.incomeAvailable === false;
  const notConnected = owed ? 'Tax, insurance and investments outside IDBI are not connected.' : 'Tax, insurance and loan details are not connected.';
  return (
    <div className="web-span" role="status" style={{ padding: '12px 18px', fontSize: 12, lineHeight: 1.6, color: 'var(--ink-soft)', background: 'var(--card)', borderRadius: 12 }}>
      <strong>{idbiConnection ? 'IDBI gateway · sandbox data' : demo ? 'Local demo data' : boot.profile ? 'Uploaded financial data' : 'No financial data connected'}</strong>
      {' · '}{dataQuality.transactionMonths} observed transaction months · {holdings.length} holdings
      {dataQuality.dataAsOf && <> · Latest transaction: {dataQuality.dataAsOf}</>}
      {idbiConnection?.fetchedAt && <div>Last fetched from IDBI: {new Date(idbiConnection.fetchedAt).toLocaleString()}</div>}
      {owed && (
        <div>
          Loans reported by IDBI: {owed.loans.length} account{owed.loans.length === 1 ? '' : 's'} · {rupees(owed.totalOutstanding)} outstanding · {owed.allStandard ? 'all standard, none overdue' : 'some overdue or non-standard'}
          {onAsk && <> · <button type="button" className="ghost-btn" style={{ padding: '2px 10px', fontSize: 11 }} onClick={() => onAsk('What do I owe?')}>Ask MITRA</button></>}
        </div>
      )}
      {lien && <div>{rupees(lien.amount)} of your balance is held under lien{lien.endDate ? ` until ${dateLabel(lien.endDate)}` : ''}, so it is not spendable.</div>}
      {(needsHistory || noLabels) && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer' }}>Why is some data unavailable?</summary>
          {needsHistory && <div>Trend advice needs at least {POLICY.confidence.minimumMonthsForTrend} observed months. {notConnected}</div>}
          {noLabels && (
            <div>
              IDBI's sandbox rows carry no salary, merchant or category labels, so income, spending-category and health analytics stay off rather than being guessed.
              {!boot.session?.demo && <> <a href="?demo=1" style={{ color: 'inherit', fontWeight: 600 }}>Preview the full demo customer (synthetic) →</a></>}
            </div>
          )}
        </details>
      )}
      {syncError && <div style={{ color: 'var(--orange)' }}>Server save failed. Your latest changes may be lost if you reload. Keep this page open and check the API connection.</div>}
      {onConnect && <button type="button" className="ghost-btn" style={{ marginTop: 8 }} onClick={onConnect}>{boot.session ? 'Connect / refresh data' : 'Log in to connect IDBI sandbox data'}</button>}
    </div>
  );
}
