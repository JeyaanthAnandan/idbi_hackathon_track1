import React, { useEffect, useRef, useState } from 'react';

// demo/screenshot mode → render final values instantly (no count-up mid-frame)
const INSTANT =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1';

// Apple-style animated stat: counts up with a strong ease-out when mounted.
export default function Counter({ value, format = (v) => Math.round(v), duration = 1400, delay = 150 }) {
  const [display, setDisplay] = useState(INSTANT ? value : 0);
  const rafRef = useRef();

  useEffect(() => {
    if (INSTANT) { setDisplay(value); return; }
    let start;
    const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
    const tick = (now) => {
      if (start === undefined) start = now + delay;
      const p = Math.min(Math.max((now - start) / duration, 0), 1);
      setDisplay(value * easeOutQuart(p));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration, delay]);

  return <>{format(display)}</>;
}
