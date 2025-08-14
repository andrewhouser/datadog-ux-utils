import { datadogRum } from "@datadog/browser-rum";
import { getUxConfig } from "../config";

/**
 * Wraps the fetch API to add Datadog RUM actions for slow API calls and errors.
 * @param input - The request info or URL.
 * @param init - Optional request initialization options.
 * @returns The fetch response.
 */
export const ddFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const cfg = getUxConfig();
  const start = performance.now();
  let resp: Response;

  try {
    resp = await fetch(input, init);

    const dur = performance.now() - start;
    if (dur >= cfg.apiSlowMs) {
      maybeAction(
        "api_slow",
        {
          url: String(
            typeof input === "string" ? input : (input as URL).toString()
          ),
          method: init?.method ?? "GET",
          duration_ms: Math.round(dur),
          status: resp.status,
        },
        cfg.actionSampleRate
      );
    }

    // size check done in a separate helper to avoid unnecessary work
    // and only if enabled
    return resp;
  } catch (err) {
    maybeError(err, {
      where: "ddFetch",
      url: String(
        typeof input === "string" ? input : (input as URL).toString()
      ),
    });
    throw err;
  }
};

/**
 * Times a promise and adds a Datadog RUM action if it is slow.
 * @param label - Label for the promise.
 * @param p - The promise to time.
 * @param meta - Optional metadata to include in the RUM action.
 * @returns The resolved value of the promise.
 */
export const timePromise = async <T>(
  label: string,
  p: Promise<T>,
  meta?: Record<string, unknown>
) => {
  const cfg = getUxConfig();
  const start = performance.now();
  try {
    const val = await p;
    const dur = performance.now() - start;
    if (dur >= cfg.apiSlowMs) {
      maybeAction(
        "promise_slow",
        { label, duration_ms: Math.round(dur), ...meta },
        cfg.actionSampleRate
      );
    }
    return val;
  } catch (err) {
    maybeError(err, { label, ...meta });
    throw err;
  }
};

const maybeAction = (
  name: string,
  attrs: Record<string, unknown>,
  rate: number
) => {
  if (Math.random() * 100 < rate) datadogRum.addAction(name, attrs);
};

const maybeError = (err: unknown, ctx?: Record<string, unknown>) => {
  datadogRum.addError(err as Error, ctx);
};
