/**
 * @file resources.ts
 * @description Reports large or slow-loading resources using the Performance API and sends summary events to Datadog RUM.
 */
import { datadogRum } from "@datadog/browser-rum";
import { getUxConfig } from "../config.ts";

/**
 * Capture oversized or slow-loading resources from the Performance API
 * and send summary events to DataDog.
 */
/**
 * Capture oversized or slow-loading resources from the Performance API and send summary events to Datadog.
 * @param opts - Optional thresholds and sample rate for reporting.
 */
export const reportLargeOrSlowResources = (opts?: {
  sizeKbThreshold?: number;
  durationMsThreshold?: number;
  sampleRate?: number;
}) => {
  if (!("performance" in window) || !performance.getEntriesByType) return;

  const cfg = getUxConfig();
  const sizeThreshold = opts?.sizeKbThreshold ?? 250; // default: >250 KB
  const durationThreshold = opts?.durationMsThreshold ?? 2000; // default: >2s load
  const sampleRate = opts?.sampleRate ?? cfg.actionSampleRate;

  const resources = performance.getEntriesByType(
    "resource"
  ) as PerformanceResourceTiming[];

  for (const res of resources) {
    // Skip data URIs and tracking pixels
    if (res.name.startsWith("data:") || res.transferSize === 0) continue;

    const sizeKb = Math.round(res.transferSize / 1024);
    const durationMs = Math.round(res.duration);

    const isLarge = sizeKb >= sizeThreshold;
    const isSlow = durationMs >= durationThreshold;

    if (isLarge || isSlow) {
      maybeAction(
        "resource_perf_issue",
        {
          url: res.name,
          initiatorType: res.initiatorType,
          size_kb: sizeKb,
          duration_ms: durationMs,
          large_threshold_kb: sizeThreshold,
          slow_threshold_ms: durationThreshold,
        },
        sampleRate
      );
    }
  }
};

/**
 * Run on initial load, or after route changes if your app lazy-loads assets.
 * Optionally call multiple times in SPA environments.
 */
/**
 * Reports resources on initial load or after route changes, with optional delay and thresholds.
 * @param delayMs - Delay in milliseconds before reporting.
 * @param thresholds - Optional thresholds for size and duration.
 */
export const reportResourcesOnLoad = (
  delayMs = 3000,
  thresholds?: { sizeKbThreshold?: number; durationMsThreshold?: number }
) => {
  setTimeout(() => reportLargeOrSlowResources(thresholds), delayMs);
};

const maybeAction = (
  name: string,
  attrs: Record<string, unknown>,
  rate: number
) => {
  if (Math.random() * 100 < rate) {
    datadogRum.addAction(name, attrs);
  }
};
