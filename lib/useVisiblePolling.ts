import { useEffect, useRef } from 'react';

// One outstanding request per mounted poller. Hidden/offline tabs do no polling.
export function useVisiblePolling(task: () => Promise<unknown>, intervalMs: number, enabled = true, resetKey = '') {
  const latest = useRef(task);
  latest.current = task;
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let busy = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      if (stopped || busy) return;
      clearTimeout(timer);
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      busy = true;
      try {
        await latest.current();
        failures = 0;
      } catch {
        failures = Math.min(failures + 1, 4);
      } finally {
        busy = false;
        if (!stopped) timer = setTimeout(run, intervalMs * 2 ** failures + Math.random() * intervalMs * 0.1);
      }
    };
    const resume = () => { void run(); };
    void run();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
    };
  }, [intervalMs, enabled, resetKey]);
}
