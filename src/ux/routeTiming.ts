/**
 * @file routeTiming.ts
 * @description Measures and reports route change timings for SPA navigation analytics and diagnostics.
 */
import { addAction } from "../datadog.ts";

/**
 * Hooks into SPA route changes and reports navigation timing and largest script chunk size.
 *
 * @param getRoute - Function returning the current route (e.g., pathname).
 * @returns Unsubscribe function to clean up listeners and intervals.
 *
 * @example
 * import { hookRouter } from './routeTiming';
 * const unsubscribe = hookRouter(() => window.location.pathname);
 * // ...
 * unsubscribe(); // when cleaning up
 */
export function hookRouter(getRoute: () => string): () => void {
  let prev = getRoute();
  let t0 = performance.now();
  let largestKb = 0;

  /**
   * Tracks largest script resource loaded after route change.
   */
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

  // Listen for route changes
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

  /**
   * Unsubscribe function to clean up listeners and intervals.
   */
  return () => {
    unlisten();
    clearInterval(interval);
  };
}

/**
 * Minimal router-agnostic listener adapter for navigation events.
 * Replace with your router’s real listener in your app glue code.
 *
 * @param onChange - Callback invoked on route change.
 * @returns Unsubscribe function to remove listeners and restore history.pushState.
 *
 * @example
 * // In your app glue code:
 * import { hookRouter } from './routeTiming';
 * const unsubscribe = hookRouter(() => window.location.pathname);
 * // ...
 * unsubscribe(); // when cleaning up
 */
function listen(onChange: () => void): () => void {
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
