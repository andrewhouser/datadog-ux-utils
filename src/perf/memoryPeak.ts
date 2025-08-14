/**
 * @file memoryPeak.ts
 * @description Lightweight tracker that records only the peak JS heap usage
 * (via `performance.memory`, when available) and reports it rarely:
 *   - by default on page hide/unload (visibility change), and
 *   - optionally on a low-frequency interval.
 *
 * Use this when you want a “how big did it get?” signal with minimal volume
 * and almost no runtime cost.
 */

import { safeAddAction } from "../datadog";
import {
  MemoryPeak,
  MemoryPeakReportMode,
  MemoryPeakOptions,
} from "../types/types";

/* ----------------------- state & defaults ----------------------- */

const DEFAULTS: Required<MemoryPeakOptions> = {
  mode: "onHide",
  intervalMs: 60_000,
  reportToDatadog: true,
  actionName: "memory_peak",
  onNewPeak: () => {},
};

let peak: MemoryPeak | null = null;
let installed = false;
let opts: Required<MemoryPeakOptions> = DEFAULTS;
let intervalId: number | null = null;
let lastReportedAt = 0;

/* ----------------------------- API ----------------------------- */

/**
 * Start lightweight peak-memory tracking.
 *
 * - If `performance.memory` is unavailable, this becomes a no-op (safe).
 * - In "onHide" mode, the tracker reports at most once per page lifetime.
 * - In "interval" mode, it reports at a low frequency (use conservatively).
 * - In "manual" mode, you can call `reportMemoryPeak()` whenever you like.
 *
 * @example
 * ```ts
 * import { startMemoryPeakTracking } from "datadog-ux-utils/memoryPeak";
 *
 * // Default: records peaks and reports once when the tab hides/unloads
 * const stop = startMemoryPeakTracking();
 *
 * // Clean up later (SPA teardown)
 * stop();
 * ```
 *
 * @example
 * ```ts
 * // Interval mode (report every 2 minutes)
 * startMemoryPeakTracking({ mode: "interval", intervalMs: 120_000 });
 * ```
 */
export function startMemoryPeakTracking(options: MemoryPeakOptions = {}) {
  if (installed) return stopMemoryPeakTracking;
  installed = true;

  opts = { ...DEFAULTS, ...options };

  // Try an immediate sample so we have an initial baseline if supported
  sampleOnce();

  // Mode wiring
  if (opts.mode === "onHide") {
    window.addEventListener("visibilitychange", onVisibilityChange, {
      passive: true,
    });
    window.addEventListener("pagehide", onPageHide, { passive: true });
    window.addEventListener("beforeunload", onBeforeUnload, { passive: true });
  } else if (opts.mode === "interval") {
    intervalId = window.setInterval(
      reportMemoryPeak,
      Math.max(15_000, opts.intervalMs)
    );
  }

  // Opportunistically sample at low-cost lifecycle points
  window.addEventListener("resize", onLightTouchSample, { passive: true });
  window.addEventListener("focus", onLightTouchSample, { passive: true });

  return stopMemoryPeakTracking;
}

/**
 * Stop tracking and remove listeners. Does not clear the last observed peak.
 */
export function stopMemoryPeakTracking() {
  if (!installed) return;
  installed = false;

  window.removeEventListener("visibilitychange", onVisibilityChange as any);
  window.removeEventListener("pagehide", onPageHide as any);
  window.removeEventListener("beforeunload", onBeforeUnload as any);
  window.removeEventListener("resize", onLightTouchSample as any);
  window.removeEventListener("focus", onLightTouchSample as any);

  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/**
 * Return the current peak snapshot (or `null` if nothing recorded / unsupported).
 *
 * @example
 * ```ts
 * import { getMemoryPeak } from "datadog-ux-utils/memoryPeak";
 * console.log(getMemoryPeak());
 * ```
 */
export function getMemoryPeak(): MemoryPeak | null {
  return peak ? { ...peak } : null;
}

/**
 * Manually force a report of the current peak (no-op if none).
 * Respects `reportToDatadog` and action naming in options.
 *
 * @example
 * ```ts
 * import { reportMemoryPeak } from "datadog-ux-utils/memoryPeak";
 * await someBigOperation();
 * reportMemoryPeak(); // log the current max after the operation
 * ```
 */
export function reportMemoryPeak() {
  if (!peak || !opts.reportToDatadog) return;

  // Avoid duplicate spamming if someone calls frequently
  const now = Date.now();
  if (now - lastReportedAt < 10_000) return; // 10s guard
  lastReportedAt = now;

  try {
    safeAddAction(opts.actionName, {
      peakUsedBytes: peak.peakUsedBytes,
      peakTotalBytes: peak.peakTotalBytes,
      peakLimitBytes: peak.peakLimitBytes,
      at: peak.at,
      peakUsedMB: bytesToMB(peak.peakUsedBytes), // handy for dashboards
    });
  } catch {
    // Intentionally ignore errors to avoid impacting UX.
  }
}

/**
 * Reset the recorded peak (useful when switching routes or completing a large workflow).
 *
 * @example
 * ```ts
 * import { resetMemoryPeak } from "datadog-ux-utils/memoryPeak";
 * resetMemoryPeak();
 * ```
 */
export function resetMemoryPeak() {
  peak = null;
  lastReportedAt = 0;
}

/* --------------------------- internals --------------------------- */

function getPerfMemory(): {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
} | null {
  const anyPerf = performance as any;
  const m = anyPerf?.memory;
  if (!m) return null;
  const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = m;
  // Guard against bogus zeros from some environments
  if (typeof usedJSHeapSize !== "number" || usedJSHeapSize <= 0) return null;
  return { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit };
}

/** Take a single measurement and update peak if higher. */
function sampleOnce() {
  const m = getPerfMemory();
  if (!m) return;

  if (!peak || m.usedJSHeapSize > peak.peakUsedBytes) {
    peak = {
      peakUsedBytes: m.usedJSHeapSize,
      peakTotalBytes: m.totalJSHeapSize,
      peakLimitBytes: m.jsHeapSizeLimit,
      at: Date.now(),
    };
    // Notify local callback when a new peak is observed
    try {
      opts.onNewPeak(peak);
    } catch {
      // Intentionally ignore
    }
  }
}

function onLightTouchSample() {
  // Occasional sample on benign events; avoid tight loops.
  sampleOnce();
}

function onVisibilityChange() {
  if (document.visibilityState === "hidden") {
    sampleOnce();
    reportMemoryPeak();
  } else {
    // When coming back, take a fresh sample (peaks can rise again)
    sampleOnce();
  }
}

function onPageHide() {
  sampleOnce();
  reportMemoryPeak();
}

function onBeforeUnload() {
  sampleOnce();
  reportMemoryPeak();
}

/* ---------------------------- utils ---------------------------- */

function bytesToMB(b: number) {
  return Math.round((b / (1024 * 1024)) * 100) / 100;
}

/**
EXAMPLES

1) Default (recommended): report once on page hide/unload
import { startMemoryPeakTracking } from "datadog-ux-utils/memoryPeak";

const stop = startMemoryPeakTracking();
// ... later
// stop();

2) Interval mode (low frequency)
import { startMemoryPeakTracking } from "datadog-ux-utils/memoryPeak";

// Report every 2 minutes (be conservative to keep volume tiny)
startMemoryPeakTracking({ mode: "interval", intervalMs: 120_000 });

3) Manual reporting
import { startMemoryPeakTracking, reportMemoryPeak } from "datadog-ux-utils/memoryPeak";

startMemoryPeakTracking({ mode: "manual", reportToDatadog: true });
// …do some memory-heavy workflow…
reportMemoryPeak(); // log the current peak on demand

4) Reacting to new peaks locally
import { startMemoryPeakTracking } from "datadog-ux-utils/memoryPeak";

startMemoryPeakTracking({
  onNewPeak: ({ peakUsedBytes }) => {
    const mb = Math.round((peakUsedBytes / 1024 / 1024) * 10) / 10;
    if (mb > 700) {
      console.warn("High memory peak:", mb, "MB — consider shedding cache.");
    }
  },
});

*/
