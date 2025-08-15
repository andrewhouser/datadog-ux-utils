/**
 * @file webVitals.ts
 * @description Registers web-vitals listeners and reports core metrics (CLS, LCP, FCP, INP, TTFB) to Datadog RUM if enabled in config.
 */
import { onCLS, onFCP, onLCP, onINP, onTTFB } from "web-vitals";
import { datadogRum } from "@datadog/browser-rum";
import { getUxConfig } from "../config.ts";

/**
 * Registers web-vitals listeners and reports metrics to Datadog RUM if enabled in config.
 */
export const registerWebVitals = () => {
  if (!getUxConfig().captureWebVitals) return;

  const send = (name: string, value: number, meta: any = {}) =>
    datadogRum.addAction("web_vital", { name, value, ...meta });

  onCLS(({ value }) => send("CLS", value));
  onLCP(({ value, entries }) => {
    const entry = entries?.[0];
    // Only LargestContentfulPaint entries have 'element'
    const elementTag =
      entry && "element" in entry && (entry as any).element
        ? (entry as any).element.tagName
        : undefined;
    send("LCP", value, { element: elementTag });
  });
  onFCP(({ value }) => send("FCP", value));
  onINP(({ value }) => send("INP", value));
  onTTFB(({ value }) => send("TTFB", value));
};
