import { addAction } from "../datadog";

export function hookRouter(getRoute: () => string) {
  let prev = getRoute();
  let t0 = performance.now();
  let largestKb = 0;

  const onResources = () => {
    const res = performance.getEntriesByType(
      "resource"
    ) as PerformanceResourceTiming[];
    for (const r of res) {
      if (r.responseEnd > t0 && r.initiatorType === "script") {
        const kb = Math.round((r.transferSize || r.encodedBodySize) / 1024);
        if (kb > largestKb) largestKb = kb;
      }
    }
  };

  const interval = setInterval(onResources, 200);

  const unlisten = listen(() => {
    const next = getRoute();
    const dur = Math.round(performance.now() - t0);
    addAction("route_change_timing", {
      from: prev,
      to: next,
      duration_ms: dur,
      largest_chunk_kb: largestKb,
    });

    // reset
    prev = next;
    t0 = performance.now();
    largestKb = 0;
  });

  return () => {
    unlisten();
    clearInterval(interval);
  };
}

/**
 * Minimal adapter so this stays router-agnostic.
 * Replace with your router’s real listener in your app glue code:
 *   import { createBrowserRouter } from 'react-router-dom';
 *   // use navigation events to call notify()
 */
function listen(onChange: () => void) {
  const notify = () => onChange();
  window.addEventListener("popstate", notify);
  const orig = history.pushState;
  history.pushState = function (...args) {
    orig.apply(this, args as any);
    notify();
  };
  return () => {
    window.removeEventListener("popstate", notify);
    history.pushState = orig;
  };
}
