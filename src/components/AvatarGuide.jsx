import React, { memo } from 'react';
import TalkingHeadAvatar from './TalkingHeadAvatar.jsx';

const COPY = {
  result: {
    label: '1 · Result',
    title: 'Start with the calculation',
    detail: 'This is what MITRA calculated from the connected data.',
  },
  evidence: {
    label: '2 · Evidence',
    title: 'Check why it is trustworthy',
    detail: 'Open the passport for the formula, source date, policy and receipt.',
  },
  action: {
    label: '3 · Next step',
    title: 'Try it safely',
    detail: 'This button changes only the planning scenario—never your real money.',
  },
};

const AvatarGuide = memo(function AvatarGuide({ targets, active, speaking, mood, onSelect }) {
  if (!targets.length) return null;
  const current = COPY[active] || COPY[targets[0]];
  return (
    <aside className="mitra-guide" aria-label="MITRA guided explanation">
      <div className="mitra-guide-avatar" aria-hidden="true">
        <TalkingHeadAvatar size={82} speaking={speaking} mood={mood} gesture="point-right" gaze="right" />
      </div>
      <div className="mitra-guide-content">
        <div className="mitra-guide-kicker">MITRA is pointing here</div>
        <strong>{current.title}</strong>
        <p>{current.detail}</p>
        <div className="mitra-guide-steps" aria-label="Advice walkthrough steps">
          {targets.map((target) => (
            <button
              key={target}
              type="button"
              className={target === active ? 'active' : ''}
              aria-pressed={target === active}
              onClick={() => onSelect(target)}
            >
              {COPY[target].label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
});

export default AvatarGuide;
