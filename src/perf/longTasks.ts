/**
 * @file longTasks.ts
 * @description Observes long tasks in the browser main thread and reports them to Datadog RUM.
 */
import { datadogRum } from "@datadog/browser-rum";
import { getUxConfig } from "../config.ts";

let obs: PerformanceObserver | null = null;

/**
 * Starts observing long tasks and reports them to Datadog RUM if enabled.
 */
export const startLongTaskObserver = () => {
  const cfg = getUxConfig();
  if (!cfg.captureLongTasks || obs || !("PerformanceObserver" in window))
    return;

  obs = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as PerformanceEntryList) {
      // report only the very long ones to keep noise low
      if ((entry as any).duration >= 100) {
        datadogRum.addAction("long_task", {
          name: entry.name,
          duration_ms: Math.round((entry as any).duration),
          startTime: Math.round(entry.startTime),
        });
      }
    }
  });
  try {
    obs.observe({ type: "longtask", buffered: true as any });
  } catch {
    /* older browsers */
  }
};
/**
 * Stops the long task observer.
 */
export const stopLongTaskObserver = () => {
  obs?.disconnect();
  obs = null;
};
