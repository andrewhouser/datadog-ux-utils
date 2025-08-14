import { onCLS, onFCP, onLCP, onINP, onTTFB } from "web-vitals";
import { datadogRum } from "@datadog/browser-rum";
import { getUxConfig } from "../config";

/**
 * Registers web-vitals listeners and reports metrics to Datadog RUM if enabled in config.
 */
export const registerWebVitals = () => {
  if (!getUxConfig().captureWebVitals) return;

  const send = (name: string, value: number, meta: any = {}) =>
    datadogRum.addAction("web_vital", { name, value, ...meta });

  onCLS(({ value }) => send("CLS", value));
  onLCP(({ value, entries }) =>
    send("LCP", value, { element: entries[0]?.element?.tagName })
  );
  onFCP(({ value }) => send("FCP", value));
  onINP(({ value }) => send("INP", value));
  onTTFB(({ value }) => send("TTFB", value));
};
