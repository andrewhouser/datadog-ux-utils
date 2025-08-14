/**
 * @file memory.ts
 * @description Utility to track JavaScript heap memory usage via the
 * `performance.memory` API (Chrome-only), with optional Datadog reporting.
 */

import { safeAddAction } from "../datadog";
import { MemoryMetrics, MemoryTrackingOptions } from "../types/types";

let _timer: number | null = null;
let _opts: Required<MemoryTrackingOptions>;

/**
 * Reads the current JS heap memory metrics.
 * Works only in browsers that implement the non-standard `performance.memory` API.
 *
 * @returns Memory metrics, or `null` if unsupported.
 *
 * @example
 * ```ts
 * import { getMemoryUsage } from "datadog-ux-utils/memory";
 * const metrics = getMemoryUsage();
 * if (metrics) {
 *   console.log("Used heap MB:", metrics.usedJSHeapSize / 1024 / 1024);
 * }
 * ```
 */
export function getMemoryUsage(): MemoryMetrics | null {
  const anyPerf = performance as any;
  if (anyPerf && anyPerf.memory) {
    const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = anyPerf.memory;
    return { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit };
  }
  return null;
}

/**
 * Starts polling for memory usage and optionally reports metrics to Datadog.
 *
 * @param opts - Tracking configuration.
 * @returns Function to stop tracking.
 *
 * @example
 * ```ts
 * import { startMemoryTracking } from "datadog-ux-utils/memory";
 *
 * const stop = startMemoryTracking({
 *   intervalMs: 5000,
 *   onChange: (metrics) => {
 *     console.log("Heap usage (MB):", metrics.usedJSHeapSize / 1024 / 1024);
 *   }
 * });
 *
 * // Stop tracking later:
 * stop();
 * ```
 */
export function startMemoryTracking(
  opts: MemoryTrackingOptions = {}
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  _opts = {
    intervalMs: opts.intervalMs ?? 10000,
    reportToDatadog: opts.reportToDatadog ?? true,
    onChange: opts.onChange ?? (() => {}),
  };

  if (_timer !== null) {
    stopMemoryTracking();
  }

  const poll = () => {
    const metrics = getMemoryUsage();
    if (metrics) {
      _opts.onChange(metrics);

      if (_opts.reportToDatadog) {
        safeAddAction("memory_usage", {
          usedJSHeapSize: metrics.usedJSHeapSize,
          totalJSHeapSize: metrics.totalJSHeapSize,
          jsHeapSizeLimit: metrics.jsHeapSizeLimit,
        });
      }
    }
  };

  poll(); // immediate first run
  _timer = window.setInterval(poll, _opts.intervalMs);

  return stopMemoryTracking;
}

/**
 * Stops memory usage tracking.
 *
 * @example
 * ```ts
 * import { stopMemoryTracking } from "datadog-ux-utils/memory";
 * stopMemoryTracking();
 * ```
 */
export function stopMemoryTracking(): void {
  if (_timer !== null) {
    clearInterval(_timer);
    _timer = null;
  }
}
