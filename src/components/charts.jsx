import React from 'react';

// Hand-rolled SVG charts — zero dependencies, always render offline.
// Colors come from CSS variables, so every chart follows whichever
// surface it lands on (day or night) without a second implementation.

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
      {/* the mark's dot, parked at 12 o'clock where every arc starts */}
      <circle cx={c} cy={c - r} r={thickness * 0.24} fill="var(--orange)" />
      {centerTop && (
        <text
          x={c} y={c - 1} textAnchor="middle" fontSize={size * 0.15} fontWeight="800"
          fill="var(--ink)" fontFamily="var(--display)" letterSpacing="-0.5"
        >
          {centerTop}
        </text>
      )}
      {centerBottom && (
        <text
          x={c} y={c + size * 0.11} textAnchor="middle" fontSize={size * 0.07} fontWeight="500"
          fill="var(--ink-soft)" fontFamily="var(--mono)" letterSpacing="0.8"
        >
          {String(centerBottom).toUpperCase()}
        </text>
      )}
    </svg>
  );
}

// Health / progress ring — the mark carrying a 0–100 state.
export function ScoreRing({ score, size = 66, label = 'Health', thickness = 5, onNight }) {
  const c = size / 2;
  const r = c - thickness / 2 - 2;
  const circ = 2 * Math.PI * r;
  const len = (Math.max(0, Math.min(score, 100)) / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle
        cx={c} cy={c} r={r} fill="none"
        stroke={onNight ? 'rgba(234,243,241,0.16)' : 'var(--chart-track)'}
        strokeWidth={thickness}
      />
      <circle
        cx={c} cy={c} r={r} fill="none" stroke="var(--teal)" strokeWidth={thickness}
        strokeLinecap="round" strokeDasharray={`${len.toFixed(1)} ${(circ - len).toFixed(1)}`}
        transform={`rotate(-90 ${c} ${c})`}
      />
      <circle cx={c} cy={c - r} r={thickness * 0.72} fill="var(--orange)" />
      <text
        x={c} y={c} textAnchor="middle" fontSize={size * 0.245} fontWeight="800"
        fontFamily="var(--display)" fill={onNight ? '#eaf3f1' : 'var(--ink)'} letterSpacing="-0.5"
      >
        {Math.round(score)}
      </text>
      <text
        x={c} y={c + size * 0.17} textAnchor="middle" fontSize={size * 0.106} fontWeight="500"
        fontFamily="var(--mono)" fill={onNight ? '#9cd6cc' : 'var(--ink-soft)'} letterSpacing="0.8"
      >
        {label.toUpperCase()}
      </text>
    </svg>
  );
}

// Allocation as concentric arcs — one ring per holding type, largest
// outermost. The mark itself, made of the customer's own money.
export function ConcentricRings({ segments, size = 118, thickness = 7, gap = 7 }) {
  const view = 132;
  const scale = view / size;
  const t0 = thickness * scale;
  const g = gap * scale;
  const vc = view / 2;
  const rOuter = vc - t0 / 2 - 4;
  // the innermost ring still has to read as a ring, not a dot
  const rMin = Math.min(rOuter * 0.34, t0 * 2.4);
  const n = segments.length;
  // keep the design's pitch when there's room; when a portfolio has enough
  // buckets that the rings would collide, tighten the pitch and the stroke
  const pitch = n > 1 ? Math.min(t0 + g, (rOuter - rMin) / (n - 1)) : 0;
  const t = n > 1 ? Math.min(t0, pitch * 0.62) : t0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${view} ${view}`} style={{ flexShrink: 0 }}>
      {segments.map((s, i) => {
        const r = rOuter - i * pitch;
        if (r < t) return null;
        const circ = 2 * Math.PI * r;
        const len = (s.pct / 100) * circ;
        return (
          <g key={s.key ?? i}>
            <circle cx={vc} cy={vc} r={r} fill="none" stroke="var(--chart-track)" strokeWidth={t} />
            <circle
              cx={vc} cy={vc} r={r} fill="none" stroke={s.color} strokeWidth={t}
              strokeDasharray={`${len.toFixed(1)} ${(circ - len).toFixed(1)}`}
              transform={`rotate(-90 ${vc} ${vc})`}
            />
          </g>
        );
      })}
      <circle cx={vc} cy={vc - rOuter} r={4} fill="var(--ink)" />
    </svg>
  );
}

// NOTE on all charts below: the SVG uses viewBox width 100 stretched via
// preserveAspectRatio="none" to fill the container responsively. That's fine
// for geometry (bars, lines) but <text> inside that same coordinate system
// gets stretched horizontally by the same (large, non-uniform) factor and
// becomes illegibly huge. So text lives in an HTML overlay instead — Y maps
// 1:1 to px (svg height === viewBox height), X maps directly to CSS `left: X%`.
export function Bars({ data, height = 110, format = (v) => v, highlight }) {
  const max = Math.max(...data.map((d) => d.value)) * 1.15;
  const bw = 100 / data.length;
  const bars = data.map((d, i) => {
    const h = (d.value / max) * (height - 26);
    const x = i * bw + bw * 0.18;
    const w = bw * 0.64;
    return { ...d, h, x, w, cx: x + w / 2, hot: highlight?.(d) };
  });
  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        {bars.map((d, i) => (
          <rect
            key={i}
            x={d.x} y={height - 16 - d.h} width={d.w} height={d.h} rx="2"
            fill={d.hot ? 'var(--orange)' : 'var(--teal)'}
            opacity={d.hot ? 1 : 0.85}
          />
        ))}
      </svg>
      {bars.map((d, i) => (
        <span
          key={`v${i}`}
          style={{
            position: 'absolute', left: `${d.cx}%`, top: height - 20 - d.h, transform: 'translate(-50%, -100%)',
            fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap',
          }}
        >
          {format(d.value)}
        </span>
      ))}
      {bars.map((d, i) => (
        <span
          key={`l${i}`}
          style={{
            position: 'absolute', left: `${d.cx}%`, top: height - 13, transform: 'translateX(-50%)',
            fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--ink-soft)', whiteSpace: 'nowrap',
          }}
        >
          {d.label}
        </span>
      ))}
    </div>
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
  const legend = {
    fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 500,
    letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap',
  };
  return (
    <div style={{ width: '100%' }}>
      <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <path d={`${line('fv')} L100,${height - 12} L0,${height - 12} Z`} fill="rgba(15,140,126,0.18)" />
        <path d={line('fv')} fill="none" stroke="var(--ink)" strokeWidth="2" />
        <path d={line('invested')} fill="none" stroke="var(--ink-soft)" strokeWidth="1.2" strokeDasharray="3 3" />
      </svg>
      <div style={{ display: 'flex', gap: 14, marginTop: -4, ...legend }}>
        <span style={{ color: 'var(--ink)' }}>— portfolio value</span>
        <span style={{ color: 'var(--ink-soft)' }}>--- invested</span>
      </div>
    </div>
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
      <path d={`${d} L100,${height} L0,${height} Z`} fill="rgba(15,140,126,0.14)" />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.8" />
      <circle cx={X(series.length - 1)} cy={Y(series[series.length - 1])} r="2.4" fill="var(--orange)" />
    </svg>
  );
}

// Wealth Time Machine projection: wealth curve + freedom threshold line.
// The freedom crossing is marked with the ring-and-dot, not a label.
export function ProjectionChart({ series, fireAge, events = [], height = 158 }) {
  // Without a credible expense baseline there is no 25×-expenses line to draw.
  // Null would plot as a flat line along the axis, which reads as a real
  // target of zero — so the series and its legend entry are both dropped.
  const hasFreedomTarget = series.every((p) => Number.isFinite(p.freedomTarget));
  const maxV = Math.max(...series.map((p) => Math.max(p.wealth, hasFreedomTarget ? p.freedomTarget : 0))) * 1.05;
  const a0 = series[0].age;
  const a1 = series[series.length - 1].age;
  const svgH = height - 16;
  const X = (age) => ((age - a0) / (a1 - a0)) * 100;
  const Y = (v) => height - 18 - (v / maxV) * (height - 34);
  const px = (v) => Y(v) * (svgH / height); // svg is drawn shorter than the box; keep overlays aligned
  const line = (key) =>
    series.map((p, i) => `${i ? 'L' : 'M'}${X(p.age).toFixed(1)},${Y(p[key]).toFixed(1)}`).join(' ');
  const firePt = fireAge ? series.find((p) => p.age === fireAge) : null;
  const legend = {
    fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 500,
    letterSpacing: '0.1em', textTransform: 'uppercase',
  };
  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <svg width="100%" height={svgH} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <path d={`${line('wealth')} L100,${height - 18} L0,${height - 18} Z`} fill="rgba(15,140,126,0.18)" />
        <path d={line('wealth')} fill="none" stroke="var(--ink)" strokeWidth="2.4" />
        <path d={line('invested')} fill="none" stroke="var(--ink-soft)" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.7" />
        {hasFreedomTarget && <path d={line('freedomTarget')} fill="none" stroke="var(--orange)" strokeWidth="1.4" strokeDasharray="5 4" />}
        {events.map((ev) => {
          const pt = series.find((p) => p.age === ev.age);
          if (!pt) return null;
          return <circle key={ev.id || ev.age} cx={X(ev.age)} cy={Y(pt.wealth)} r="2.6" fill="var(--orange)" />;
        })}
      </svg>

      {/* overlays — see the note above Bars() for why these aren't inside the svg */}
      {fireAge && (
        <div
          style={{
            position: 'absolute', left: `${X(fireAge)}%`, top: 9,
            width: 1, height: px(0) - 9,
            backgroundImage: 'repeating-linear-gradient(to bottom, var(--orange) 0 2px, transparent 2px 5px)',
          }}
        />
      )}
      {firePt && (
        <div
          style={{
            position: 'absolute', left: `${X(fireAge)}%`, top: px(firePt.wealth),
            width: 20, height: 20, margin: '-10px 0 0 -10px', borderRadius: '50%',
            border: '2px solid var(--orange)', display: 'grid', placeItems: 'center',
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--orange)' }} />
        </div>
      )}
      {events.map((ev) => {
        const pt = series.find((p) => p.age === ev.age);
        if (!pt) return null;
        return (
          <div
            key={ev.id || ev.age}
            style={{
              position: 'absolute', left: `${X(ev.age)}%`, top: px(pt.wealth) - 17, transform: 'translateX(-50%)',
              fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 600, color: 'var(--orange)', whiteSpace: 'nowrap',
            }}
          >
            {ev.short}
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: 0, top: svgH - 6, display: 'flex', gap: 14, color: 'var(--ink-soft)', ...legend }}>
        <span style={{ color: 'var(--ink)' }}>— wealth</span>
        <span>--- invested</span>
        {hasFreedomTarget && <span style={{ color: 'var(--orange)' }}>--- 25× expenses</span>}
      </div>
    </div>
  );
}
