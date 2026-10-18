import { useEffect, useState } from 'react';
import { useInView, usePrefersReducedMotion } from './useInView';

interface CountUpProps {
  value: number | null;
  durationMs?: number;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

// Counts from 0 up to `value` once it's on screen; shows "—" until the value loads.
export default function CountUp({ value, durationMs = 1200 }: CountUpProps) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.5);
  const reducedMotion = usePrefersReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (value == null || !inView) return;
    if (reducedMotion) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1);
      setShown(Math.round(value * easeOutCubic(progress)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, inView, reducedMotion, durationMs]);

  return (
    <span ref={ref} className="tabular-nums" aria-label={value == null ? undefined : value.toLocaleString()}>
      {value == null ? '—' : shown.toLocaleString()}
    </span>
  );
}
