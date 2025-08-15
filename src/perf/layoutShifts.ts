/**
 * @file layoutShifts.ts
 * @description Monitors layout shift events using the PerformanceObserver API to
 * calculate and report Cumulative Layout Shift (CLS) scores.
 * CLS measures unexpected layout shifts that occur during a page's lifecycle,
 * which impact user experience.
 */

import { safeAddAction } from "../datadog.ts";
import { LayoutShiftOptions } from "../types/types.ts";

let _clsValue = 0;
let _observer: PerformanceObserver | null = null;
let _opts: Required<LayoutShiftOptions>;

/**
 * Starts tracking Cumulative Layout Shift (CLS) for the current page.
 *
 * @param opts - Configuration for tracking layout shifts.
 * @returns A function to stop tracking CLS.
 *
 * @example
 * ```ts
 * import { startLayoutShiftTracking } from "datadog-ux-utils/layoutShifts";
 *
 * const stopTracking = startLayoutShiftTracking({
 *   onChange: (cls, entry) => {
 *     console.log("CLS updated:", cls, entry);
 *   }
 * });
 *
 * // Stop tracking later:
 * stopTracking();
 * ```
 */
export function startLayoutShiftTracking(
  opts: LayoutShiftOptions = {}
): () => void {
  if (
    typeof window === "undefined" ||
    typeof PerformanceObserver === "undefined"
  ) {
    return () => {};
  }

  _opts = {
    reportToDatadog: opts.reportToDatadog ?? true,
    onChange: opts.onChange ?? (() => {}),
  };

  try {
    _observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as LayoutShift[]) {
        // Ignore shifts triggered by user input
        if (!entry.hadRecentInput) {
          _clsValue += entry.value;
          _opts.onChange(_clsValue, entry);

          if (_opts.reportToDatadog) {
            safeAddAction("layout_shift", {
              clsValue: _clsValue,
              value: entry.value,
              sources: entry.sources?.map((s) => s.node?.nodeName),
            });
          }
        }
      }
    });

    _observer.observe({ type: "layout-shift", buffered: true });
  } catch {
    // swallow: CLS tracking not supported in this browser
  }

  return () => {
    if (_observer) {
      _observer.disconnect();
      _observer = null;
    }
  };
}

/**
 * Returns the current cumulative layout shift score.
 *
 * @example
 * ```ts
 * import { getCLSValue } from "datadog-ux-utils/layoutShifts";
 * console.log("Current CLS:", getCLSValue());
 * ```
 */
export function getCLSValue(): number {
  return _clsValue;
}
