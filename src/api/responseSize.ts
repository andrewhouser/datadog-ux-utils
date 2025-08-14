import { getUxConfig } from "../config";
import { datadogRum } from "@datadog/browser-rum";

/**
 * Checks the response size and adds a Datadog RUM action if the payload is large.
 * @param resp - The fetch response to check.
 * @param hintUrl - Optional URL for context in the RUM action.
 * @returns The original response.
 */
export const withResponseSizeCheck = async (
  resp: Response,
  hintUrl?: string
) => {
  const cfg = getUxConfig();
  if (!cfg.captureResponseSize) return resp;

  try {
    // Prefer Content-Length when present
    const header = resp.headers.get("content-length");
    let sizeBytes = header ? parseInt(header, 10) : NaN;

    if (!Number.isFinite(sizeBytes)) {
      // Fallback only if body is not a stream we must preserve
      const clone = resp.clone();
      const buf = await clone.arrayBuffer();
      sizeBytes = buf.byteLength;
    }

    const kb = Math.round(sizeBytes / 1024);
    if (kb >= cfg.apiLargeKb) {
      datadogRum.addAction("api_large_payload", {
        url: hintUrl,
        size_kb: kb,
        threshold_kb: cfg.apiLargeKb,
        status: resp.status,
      });
    }
  } catch {
    // silent — measuring must never break the app
  }
  return resp;
};
