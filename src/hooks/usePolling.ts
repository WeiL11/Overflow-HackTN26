import { useEffect } from 'react';

export const usePolling = (callback: () => void | Promise<void>, intervalMs: number, enabled = true): void => {
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let inFlight = false;
    const interval = window.setInterval(async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try { await callback(); } catch { /* Dashboard loaders surface errors through their existing toasts. */ } finally { inFlight = false; }
    }, intervalMs);
    return () => { active = false; window.clearInterval(interval); };
  }, [callback, intervalMs, enabled]);
};
