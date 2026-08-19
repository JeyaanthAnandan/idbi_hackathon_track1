import React from 'react';

// The IDBI concentric mark, used as a container.
// A thin ring with one orange dot orbiting it — the same object at every
// scale: 16px on a profile chip, 236px on a live call. Anything that
// reports progress or attention gets wrapped in one of these.
export default function Ring({
  size = 58,
  dot = 6,
  color = 'rgba(15,140,126,0.6)',
  orbit = true,
  children,
  style,
}) {
  return (
    <span
      className="ring"
      style={{ width: size, height: size, '--ring-color': color, '--dot': `${dot}px`, ...style }}
    >
      {orbit && (
        <span className="ring-orbit">
          <i />
        </span>
      )}
      {children}
    </span>
  );
}
