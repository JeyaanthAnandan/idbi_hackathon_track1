import React, { useEffect, useState } from 'react';

// Small shared pieces for the RM console. Colours all come from the same
// custom properties as the customer app (styles.css), so both surfaces
// stay one brand in light and dark.

export const fmt = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
export const fmtL = (n) => {
  n = Number(n || 0);
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2).replace(/\.00$/, '') + '\u00a0Cr';
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1).replace(/\.0$/, '') + '\u00a0L';
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return '₹' + Math.round(n);
};

export const initials = (name = '') =>
  name.replace(/^Dr\.\s*/, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export function timeAgo(isoString, now = Date.now()) {
  const mins = Math.round((now - Date.parse(isoString)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

export const dateTime = (iso) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const dateOnly = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// Re-render every 30 s so SLA countdowns and "x min ago" stay honest.
export function useNow(interval = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

export function SlaBadge({ item, now }) {
  if (item.status === 'CLOSED') return <span className="rm-pill is-muted">Closed</span>;
  if (item.status === 'SCHEDULED') return <span className="rm-pill is-ok">Booked</span>;
  const left = Date.parse(item.slaDueAt) - now;
  const mins = Math.round(left / 60000);
  if (left <= 0) return <span className="rm-pill is-bad">SLA breached</span>;
  const label = mins < 60 ? `${mins} min left` : `${Math.floor(mins / 60)} h ${mins % 60} m left`;
  return <span className={`rm-pill ${mins < 45 ? 'is-warn' : 'is-info'}`}>{label}</span>;
}

const STATUS = {
  NEW: ['New', 'is-warn'], ACCEPTED: ['Accepted', 'is-info'], SCHEDULED: ['Scheduled', 'is-ok'], CLOSED: ['Closed', 'is-muted'],
  PENDING: ['Pending review', 'is-warn'], APPROVED: ['Approved', 'is-ok'], MODIFIED: ['Approved with changes', 'is-info'], REJECTED: ['Rejected', 'is-bad'],
};
export function StatusPill({ status }) {
  const [label, cls] = STATUS[status] || [status, 'is-muted'];
  return <span className={`rm-pill ${cls}`}>{label}</span>;
}

export function FlagPill({ level, children }) {
  return <span className={`rm-pill ${level === 'high' ? 'is-bad' : level === 'medium' ? 'is-warn' : 'is-muted'}`}>{children}</span>;
}

export function Kpi({ label, value, sub, tone }) {
  return (
    <div className={`rm-kpi ${tone ? `is-${tone}` : ''}`}>
      <div className="rm-kpi-label">{label}</div>
      <div className="rm-kpi-value">{value}</div>
      {sub && <div className="rm-kpi-sub">{sub}</div>}
    </div>
  );
}

export function Card({ title, aside, children, className = '' }) {
  return (
    <section className={`rm-card ${className}`}>
      {(title || aside) && (
        <header className="rm-card-head">
          {title && <h3>{title}</h3>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

export function Meter({ value, max = 100, tone = 'teal' }) {
  const pct = Math.max(0, Math.min((value / max) * 100, 100));
  return (
    <div className="rm-meter"><i style={{ width: `${pct}%`, background: tone === 'orange' ? 'var(--orange)' : tone === 'red' ? 'var(--red)' : 'var(--teal)' }} /></div>
  );
}

// Soft-tinted initials, as on the customer app's cards. `tone` follows the
// customer's worst flag; `ring` adds MITRA's orange highlight ring.
export function Avatar({ name, size = 36, tone, ring }) {
  const cls = `rm-avatar ${tone === 'high' ? 'is-high' : tone === 'medium' ? 'is-med' : ''} ${ring ? 'is-ring' : ''}`;
  return <span className={cls} style={{ width: size, height: size, fontSize: size * 0.34 }}>{initials(name)}</span>;
}
