import React, { useEffect, useState } from 'react';

// MITRA — friendly advisor avatar. Soft flat-illustration style:
// warm rounded features, gentle smile, blazer + gold studs.
// Blinks on a timer, mouth animates while `speaking`, brows follow `mood`.
export default function Avatar({ speaking = false, mood = 'happy', size = 108 }) {
  const [blink, setBlink] = useState(false);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    let t;
    const id = setInterval(() => {
      setBlink(true);
      t = setTimeout(() => setBlink(false), 150);
    }, 3200 + Math.random() * 1800);
    return () => { clearInterval(id); clearTimeout(t); };
  }, []);

  useEffect(() => {
    if (!speaking) { setFrame(0); return; }
    const id = setInterval(() => setFrame((f) => (f + 1) % 4), 160);
    return () => clearInterval(id);
  }, [speaking]);

  const browLift = mood === 'excited' ? -2 : mood === 'thinking' ? 1.5 : 0;

  // mouth frames: rest smile → small open → mid open → soft open
  const mouths = [
    { open: false, d: 'M51 73 Q60 79.5 69 73', lower: 'M55 77.5 Q60 79 65 77.5' },
    { open: true, d: 'M52 72.5 Q60 80 68 72.5 Q60 76 52 72.5' },
    { open: true, d: 'M51.5 72 Q60 83 68.5 72 Q60 77 51.5 72' },
    { open: true, d: 'M52 72.5 Q60 81.5 68 72.5 Q60 76.5 52 72.5' },
  ];
  const m = speaking ? mouths[frame] : mouths[0];

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width={size} height={size} aria-label="MITRA avatar">
      <defs>
        <radialGradient id="mitraBg" cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#f4f2ec" />
          <stop offset="100%" stopColor="#ddd8cb" />
        </radialGradient>
        <linearGradient id="mitraSkin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbd6b0" />
          <stop offset="100%" stopColor="#f3bd92" />
        </linearGradient>
        <linearGradient id="mitraHair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a372c" />
          <stop offset="100%" stopColor="#33251d" />
        </linearGradient>
        <linearGradient id="mitraCoat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2b2a2e" />
          <stop offset="100%" stopColor="#111013" />
        </linearGradient>
      </defs>

      {/* backdrop + speaking ring */}
      <circle cx="60" cy="60" r="57" fill="url(#mitraBg)" />
      <circle
        cx="60" cy="60" r="57" fill="none"
        stroke={speaking ? '#ff8a3c' : 'rgba(255,255,255,0.22)'}
        strokeWidth={speaking ? 2.5 : 1.2}
        strokeDasharray={speaking ? '10 7' : '0'}
      >
        {speaking && (
          <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="7s" repeatCount="indefinite" />
        )}
      </circle>

      <g>
        {/* hair bun */}
        <ellipse cx="60" cy="17" rx="12" ry="9" fill="url(#mitraHair)" />
        <path d="M52 14 Q60 9 68 14" stroke="#6b5343" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.7" />

        {/* hair behind face (falls to shoulders) */}
        <path d="M32 52 Q30 22 60 20 Q90 22 88 52 L88 76 Q88 84 82 86 L80 60 L40 60 L38 86 Q32 84 32 76 Z" fill="url(#mitraHair)" />

        {/* shoulders / teal blazer */}
        <path d="M16 120 Q20 96 42 90 L60 86 L78 90 Q100 96 104 120 Z" fill="url(#mitraCoat)" />
        {/* blouse v-neck */}
        <path d="M50 91 L60 104 L70 91 L60 87 Z" fill="#f0eee6" />
        {/* lapels */}
        <path d="M50 91 L60 104 L52 110 L44 92 Z" fill="#000000" opacity="0.55" />
        <path d="M70 91 L60 104 L68 110 L76 92 Z" fill="#000000" opacity="0.55" />
        {/* pocket square */}
        <rect x="82" y="106" width="8" height="7" rx="1.5" fill="#ff8a3c" transform="rotate(-6 86 109)" />

        {/* neck */}
        <path d="M53 76 L53 90 Q60 95 67 90 L67 76 Z" fill="#eeb287" />

        {/* ears + studs */}
        <ellipse cx="34.5" cy="58" rx="4" ry="5.5" fill="#f3bd92" />
        <ellipse cx="85.5" cy="58" rx="4" ry="5.5" fill="#f3bd92" />
        <circle cx="34.5" cy="61.5" r="1.8" fill="#d9a441" />
        <circle cx="85.5" cy="61.5" r="1.8" fill="#d9a441" />

        {/* face */}
        <path d="M36 50 Q36 26 60 26 Q84 26 84 50 Q84 66 76 74 Q68 81 60 81 Q52 81 44 74 Q36 66 36 50 Z" fill="url(#mitraSkin)" />

        {/* front hair — side-swept with middle part */}
        <path d="M36 52 Q34 24 60 23 Q86 24 84 52 Q84 40 76 34 Q70 41 60 40 Q50 41 44 34 Q36 40 36 52 Z" fill="url(#mitraHair)" />
        <path d="M46 30 Q54 25 60 26" stroke="#6b5343" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.6" />

        {/* bindi */}
        <circle cx="60" cy="43.5" r="1.3" fill="#b8443c" />

        {/* brows — soft, rounded */}
        <path d={`M44 ${48.5 + browLift} Q48.5 ${46 + browLift} 53 ${48.2 + browLift}`} stroke="#5a4335" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d={`M67 ${48.2 + browLift} Q71.5 ${46 + browLift} 76 ${48.5 + browLift}`} stroke="#5a4335" strokeWidth="2.2" fill="none" strokeLinecap="round" />

        {/* eyes */}
        {blink ? (
          <>
            <path d="M44 56 Q48.5 58.4 53 56" stroke="#5a4335" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M67 56 Q71.5 58.4 76 56" stroke="#5a4335" strokeWidth="2" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            {/* whites */}
            <path d="M43.5 56 Q48.5 51 53.5 56 Q48.5 60 43.5 56 Z" fill="#fff" />
            <path d="M66.5 56 Q71.5 51 76.5 56 Q71.5 60 66.5 56 Z" fill="#fff" />
            {/* warm brown iris + pupil + sparkle */}
            <circle cx="48.7" cy="55.8" r="2.7" fill="#6d4c33" />
            <circle cx="71.7" cy="55.8" r="2.7" fill="#6d4c33" />
            <circle cx="48.7" cy="55.8" r="1.25" fill="#2a1a10" />
            <circle cx="71.7" cy="55.8" r="1.25" fill="#2a1a10" />
            <circle cx="49.6" cy="54.8" r="0.85" fill="#fff" />
            <circle cx="72.6" cy="54.8" r="0.85" fill="#fff" />
            {/* soft upper lash line */}
            <path d="M44 54.6 Q48.5 50.6 53 54.6" stroke="#3f2e22" strokeWidth="1.7" fill="none" strokeLinecap="round" />
            <path d="M67 54.6 Q71.5 50.6 76 54.6" stroke="#3f2e22" strokeWidth="1.7" fill="none" strokeLinecap="round" />
          </>
        )}

        {/* nose — barely there */}
        <path d="M59.2 62 Q58.4 65.5 60.8 66.3" stroke="#dfa578" strokeWidth="1.5" fill="none" strokeLinecap="round" />

        {/* blush */}
        <ellipse cx="43" cy="66" rx="4.6" ry="2.6" fill="#f2a58d" opacity="0.35" />
        <ellipse cx="77" cy="66" rx="4.6" ry="2.6" fill="#f2a58d" opacity="0.35" />

        {/* mouth */}
        {m.open ? (
          <>
            <path d={m.d} fill="#8a4038" />
            <path d="M54 73 Q60 75.5 66 73 L66 73.8 Q60 76.5 54 73.8 Z" fill="#fff" opacity="0.9" />
          </>
        ) : (
          <>
            <path d={m.d} stroke="#a34e46" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <path d={m.lower} stroke="#d98a80" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.4" />
          </>
        )}
      </g>
    </svg>
  );
}
