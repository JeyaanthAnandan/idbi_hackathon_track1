import { useEffect, useState } from 'react';

// Only IDs validated by avatarDirector reach this hook; no model selectors.
export default function useGuideTarget(target, originRef, enabled = true) {
  const [line, setLine] = useState(null);
  useEffect(() => {
    if (!enabled || !target) { setLine(null); return undefined; }
    let element, frame, disposed = false;
    const update = () => {
      frame = null;
      if (disposed) return;
      const next = [...document.querySelectorAll('[data-guide-target]')].find((node) => node.dataset.guideTarget === target);
      if (next !== element) {
        element?.classList.remove('mitra-ui-highlight');
        element = next;
        element?.classList.add('mitra-ui-highlight');
        // This also reveals targets clipped inside the dashboard's nested
        // scroll pane, even when their coordinates lie inside the viewport.
        element?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
      const from = originRef.current?.getBoundingClientRect(), to = element?.getBoundingClientRect();
      if (!from || !to || !to.width || !to.height) { setLine(null); return; }
      const x1 = from.left + from.width / 2, y1 = from.top + from.height * .65;
      const x2 = Math.max(12, Math.min(window.innerWidth - 12, to.left + to.width / 2));
      const y2 = Math.max(12, Math.min(window.innerHeight - 12, to.top + Math.min(to.height / 2, 70)));
      const nextLine = { x1, y1, x2, y2 };
      setLine((old) => old && Object.keys(nextLine).every((key) => old[key] === nextLine[key]) ? old : nextLine);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    update();
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true);
      element?.classList.remove('mitra-ui-highlight');
    };
  }, [target, enabled, originRef]);
  return line;
}
