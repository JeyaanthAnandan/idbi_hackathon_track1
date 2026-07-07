import React from 'react';

// Hand-rolled SVG charts — zero dependencies, always render offline.
// Colors come from CSS variables so they follow the Wealth OS dark theme.

export function Donut({ segments, size = 110, thickness = 16, centerTop, centerBottom }) {
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--chart-track)" strokeWidth={thickness} />
      {segments.map((s, i) => {
        const len = (s.pct / 100) * circ;
        const el = (
          <circle
            key={i}
            cx={c} cy={c} r={r} fill="none"
            stroke={s.color} strokeWidth={thickness}
            strokeDasharray={`${len} ${circ - len}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${c} ${c})`}
            strokeLinecap="butt"
          />
        );
        offset += len;
        return el;
      })}
      {centerTop && (
        <text x={c} y={c - 2} textAnchor="middle" fontSize="15" fontWeight="800" fill="var(--ink)" fontFamily="var(--display)">
          {centerTop}
        </text>
      )}
      {centerBottom && (
        <text x={c} y={c + 13} textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--ink-soft)">
          {centerBottom}
        </text>
      )}
    </svg>
  );
}

export function ScoreRing({ score, size = 96 }) {
  const color = score >= 75 ? 'var(--green)' : score >= 55 ? 'var(--amber)' : 'var(--red)';
  return (
    <Donut
      segments={[{ pct: score, color }]}
      size={size}
      thickness={11}
      centerTop={String(score)}
      centerBottom="/ 100"
    />
  );
}

export function Bars({ data, height = 110, format = (v) => v, highlight }) {
  const max = Math.max(...data.map((d) => d.value)) * 1.15;
  const bw = 100 / data.length;
  return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      {data.map((d, i) => {
        const h = (d.value / max) * (height - 26);
        const x = i * bw + bw * 0.18;
        const w = bw * 0.64;
        const hot = highlight?.(d);
        return (
          <g key={i}>
            <rect
              x={x} y={height - 16 - h} width={w} height={h} rx="2.5"
              fill={hot ? 'var(--amber)' : 'var(--teal)'}
              opacity={hot ? 1 : 0.85}
            />
            <text x={x + w / 2} y={height - 4} textAnchor="middle" fontSize="6.4" fontWeight="700" fill="var(--ink-soft)">
              {d.label}
            </text>
            <text x={x + w / 2} y={height - 20 - h} textAnchor="middle" fontSize="6" fontWeight="800" fill="var(--ink)">
              {format(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function GrowthCurve({ monthly, rate, years, height = 96 }) {
  const pts = [];
  const r = rate / 100 / 12;
  const n = years * 12;
  for (let m = 0; m <= n; m += Math.max(1, Math.floor(n / 48))) {
    const fv = m === 0 ? 0 : monthly * ((Math.pow(1 + r, m) - 1) / r) * (1 + r);
    const invested = monthly * m;
    pts.push({ m, fv, invested });
  }
  const maxV = pts[pts.length - 1].fv * 1.08;
  const X = (m) => (m / n) * 100;
  const Y = (v) => height - 12 - (v / maxV) * (height - 20);
  const line = (key) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.m).toFixed(1)},${Y(p[key]).toFixed(1)}`).join(' ');
  return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      <path d={`${line('fv')} L100,${height - 12} L0,${height - 12} Z`} fill="rgba(255,255,255,0.09)" />
      <path d={line('fv')} fill="none" stroke="var(--ink)" strokeWidth="2" />
      <path d={line('invested')} fill="none" stroke="var(--ink-soft)" strokeWidth="1.2" strokeDasharray="3 3" />
      <text x="1" y="8" fontSize="6.5" fontWeight="700" fill="var(--ink)">— Portfolio value</text>
      <text x="1" y="17" fontSize="6.5" fontWeight="700" fill="var(--ink-soft)">--- Amount invested</text>
    </svg>
  );
}

export function Sparkline({ series, height = 54, stroke = 'var(--ink)' }) {
  const min = Math.min(...series);
  const max = Math.max(...series);
  const X = (i) => (i / (series.length - 1)) * 100;
  const Y = (v) => height - 6 - ((v - min) / (max - min || 1)) * (height - 12);
  const d = series.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      <path d={`${d} L100,${height} L0,${height} Z`} fill="rgba(255,255,255,0.09)" />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.8" />
      <circle cx={X(series.length - 1)} cy={Y(series[series.length - 1])} r="2.4" fill={stroke} />
    </svg>
  );
}

// Wealth Time Machine projection: wealth curve + freedom threshold line.
export function ProjectionChart({ series, fireAge, events = [], height = 150, format }) {
  const maxV = Math.max(...series.map((p) => Math.max(p.wealth, p.freedomTarget))) * 1.05;
  const a0 = series[0].age;
  const a1 = series[series.length - 1].age;
  const X = (age) => ((age - a0) / (a1 - a0)) * 100;
  const Y = (v) => height - 18 - (v / maxV) * (height - 34);
  const line = (key) =>
    series.map((p, i) => `${i ? 'L' : 'M'}${X(p.age).toFixed(1)},${Y(p[key]).toFixed(1)}`).join(' ');
  return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      <path d={`${line('wealth')} L100,${height - 18} L0,${height - 18} Z`} fill="rgba(255,255,255,0.09)" />
      <path d={line('wealth')} fill="none" stroke="var(--ink)" strokeWidth="2.2" />
      <path d={line('invested')} fill="none" stroke="var(--ink-soft)" strokeWidth="1.2" strokeDasharray="3 3" />
      <path d={line('freedomTarget')} fill="none" stroke="var(--amber)" strokeWidth="1.4" strokeDasharray="5 4" opacity="0.9" />
      {fireAge && (
        <g>
          <line x1={X(fireAge)} y1="8" x2={X(fireAge)} y2={height - 18} stroke="var(--amber)" strokeWidth="1" strokeDasharray="2 3" />
          <text x={Math.min(X(fireAge), 78)} y="7" fontSize="6.5" fontWeight="800" fill="var(--amber)">
            Freedom · age {fireAge}
          </text>
        </g>
      )}
      {/* life-event markers */}
      {events.map((ev) => {
        const pt = series.find((p) => p.age === ev.age);
        if (!pt) return null;
        return (
          <g key={ev.id || ev.age}>
            <circle cx={X(ev.age)} cy={Y(pt.wealth)} r="2.6" fill="var(--orange)" stroke="#000" strokeWidth="1" />
            <text x={X(ev.age)} y={Y(pt.wealth) - 5} fontSize="5.8" fontWeight="800" fill="var(--orange)" textAnchor="middle">
              {ev.short}
            </text>
          </g>
        );
      })}
      {/* age axis */}
      {series.filter((p) => (p.age - a0) % 8 === 0).map((p) => (
        <text key={p.age} x={X(p.age)} y={height - 7} fontSize="6" fontWeight="700" fill="var(--ink-soft)" textAnchor="middle">
          {p.age}
        </text>
      ))}
      <text x="1" y={height + 6} fontSize="6.2" fontWeight="700" fill="var(--ink-soft)">
        <tspan fill="var(--ink)">— wealth</tspan>  <tspan fill="var(--ink-soft)">--- invested</tspan>  <tspan fill="var(--amber)">--- freedom line (25× expenses)</tspan>
      </text>
    </svg>
  );
}
