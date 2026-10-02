import React from 'react';
import { verifyAuditChain } from '../../engine/rmDesk.js';
import { Card, FlagPill, dateTime } from './ui.jsx';

const CODES = {
  LIQUIDITY: 'Liquidity stress', DEBT: 'Debt burden', INCOME: 'Irregular income', PROTECTION: 'Protection gap',
  SUITABILITY: 'Allocation suitability', KYC: 'KYC review', SENIOR: 'Senior citizen', GOALS: 'Goal shortfall',
};

export function RmCompliance({ book, desk, onOpenCustomer }) {
  const groups = {};
  book.forEach(({ persona, ins }) => ins.flags.forEach((f) => {
    (groups[f.code] ||= []).push({ ...f, customer: persona.customer });
  }));
  const order = Object.keys(groups).sort((a, b) => groups[b].filter((x) => x.level === 'high').length - groups[a].filter((x) => x.level === 'high').length || groups[b].length - groups[a].length);

  return (
    <div className="rm-stack">
      <div className="rm-grid-auto">
        {order.map((code) => (
          <Card key={code} title={CODES[code] || code} aside={<span className="rm-tag">{groups[code].length}</span>}>
            {groups[code].map((f, i) => (
              <button key={i} className="rm-history" onClick={() => onOpenCustomer(f.customer.id)}>
                <FlagPill level={f.level}>{f.level}</FlagPill><span className="grow"><strong>{f.customer.name}</strong> — {f.text}</span>
              </button>
            ))}
          </Card>
        ))}
      </div>
      <Card title="Consent register" aside={<span className="rm-tag">customer-granted, per case</span>}>
        <table className="rm-table">
          <thead><tr><th>Case</th><th>Customer</th><th>Granted</th><th>Contact</th><th>Share MITRA context</th><th>Purpose</th></tr></thead>
          <tbody>
            {desk.cases.map((c) => (
              <tr key={c.id}><td className="rm-mono">{c.id}</td><td>{c.customerName}</td><td>{dateTime(c.consent.at)}</td><td>{c.consent.contact ? 'Yes' : 'No'}</td><td>{c.consent.dataShare ? 'Yes' : 'No'}</td><td>RM advisory callback</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function RmAudit({ desk }) {
  const chain = verifyAuditChain(desk.audit);
  return (
    <Card
      title={`Audit trail · ${desk.audit.length} entries`}
      aside={<span className={`rm-pill ${chain.valid ? 'is-ok' : 'is-bad'}`}>{chain.valid ? 'Hash chain verified' : `Chain broken at ${chain.brokenAt}`}</span>}
    >
      <p className="rm-sub" style={{ marginBottom: 12 }}>
        Every customer-raised case, MITRA referral and RM decision is appended with a hash of the previous entry, so an edited or deleted line breaks the chain.
        Production would sign entries server-side and stream them to the bank's SIEM.
      </p>
      <div className="rm-table-wrap">
        <table className="rm-table">
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Reference</th><th>Detail</th><th>Hash</th></tr></thead>
          <tbody>
            {desk.audit.slice().reverse().map((e) => (
              <tr key={e.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{dateTime(e.at)}</td><td>{e.actor}</td><td className="rm-mono">{e.action}</td>
                <td className="rm-mono">{e.ref}</td><td>{e.detail}</td><td className="rm-mono rm-hash">{e.hash.slice(0, 10)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
