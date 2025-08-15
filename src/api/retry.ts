/**
 * @file retry.ts
 * @description Adds retry logic to async operations and API calls, with exponential backoff and optional telemetry reporting.
 */
import { addAction, addError } from "../datadog.ts";

export type RetryConfig = {
  /** Number of retries after the initial attempt. Default 3 */
  retries?: number;
  /** Base delay in ms between retries. Default 200 */
  baseMs?: number;
  /** Maximum delay in ms. Default 5000 */
  maxMs?: number;
  /** Exponential backoff factor. Default 2 */
  factor?: number;
  /** Add +/- 0–baseMs random jitter to delay. Default true */
  jitter?: boolean;
  /** Only retry on errors passing this predicate. Default: retry all */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  /** Optional DataDog reporting. Default false */
  report?: boolean | { sampleRate?: number; actionName?: string };
};

const DEFAULTS: Required<RetryConfig> = {
  retries: 3,
  baseMs: 200,
  maxMs: 5000,
  factor: 2,
  jitter: true,
  shouldRetry: () => true,
  report: false,
};

/**
 * Retry an async operation with backoff/jitter.
 * @param label Unique label for telemetry (e.g., "GET /api/items")
 * @param op Function returning a Promise
 * @param cfg RetryConfig
 */
/**
 * Retry an async operation with backoff/jitter.
 *
 * @param label - Unique label for telemetry (e.g., "GET /api/items")
 * @param op - Function returning a Promise
 * @param cfg - RetryConfig
 * @returns The resolved value from the operation, or throws after all retries fail.
 *
 * @example
 * // Retry GET request up to 5 times, with exponential backoff starting at 300ms
 * const data = await retry("GET /api/patients", async () => {
 *   const res = await fetch("/api/patients");
 *   if (!res.ok) throw new Error(`Status ${res.status}`);
 *   return res.json();
 * }, {
 *   retries: 5,
 *   baseMs: 300,
 *   jitter: true,
 *   report: true // enable DataDog telemetry at default 10% sampling
 * });
 */
export async function retry<T>(
  label: string,
  op: () => Promise<T>,
  cfg?: RetryConfig
): Promise<T> {
  const { retries, baseMs, maxMs, factor, jitter, shouldRetry, report } = {
    ...DEFAULTS,
    ...cfg,
  };

  const reportCfg =
    typeof report === "object"
      ? {
          enabled: true,
          sampleRate: report.sampleRate ?? 10,
          actionName: report.actionName ?? "api_retry",
        }
      : report === true
      ? { enabled: true, sampleRate: 10, actionName: "api_retry" }
      : { enabled: false, sampleRate: 0, actionName: "" };

  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= retries) {
    try {
      if (attempt > 0 && reportCfg.enabled) {
        maybeReport(reportCfg, label, attempt);
      }
      return await op();
    } catch (err) {
      lastErr = err;
      if (attempt >= retries || !shouldRetry(err, attempt)) {
        if (reportCfg.enabled) {
          addError(err, { label, attempt, final: true }, reportCfg.sampleRate);
        }
        throw err;
      }
      const delay = computeDelay(baseMs, factor, attempt, maxMs, jitter);
      await sleep(delay);
      attempt++;
    }
  }

  // We should never reach here
  throw lastErr;
}

function computeDelay(
  base: number,
  factor: number,
  attempt: number,
  max: number,
  jitter: boolean
) {
  let delay = Math.min(base * Math.pow(factor, attempt), max);
  if (jitter) {
    const rand = Math.floor(Math.random() * base);
    delay += Math.random() < 0.5 ? -rand : rand;
    delay = Math.max(0, delay);
  }
  return delay;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function maybeReport(
  cfg: { enabled: boolean; sampleRate: number; actionName: string },
  label: string,
  attempt: number
) {
  if (!cfg.enabled) return;
  if (Math.random() * 100 >= cfg.sampleRate) return;
  addAction(cfg.actionName, { label, attempt }, cfg.sampleRate);
}

/**
EXAMPLE

// Retry GET request up to 5 times, with exponential backoff starting at 300ms
const data = await retry("GET /api/patients", async () => {
  const res = await fetch("/api/patients");
  if (!res.ok) throw new Error(`Status ${res.status}`);
  return res.json();
}, {
  retries: 5,
  baseMs: 300,
  jitter: true,
  report: true // enable DataDog telemetry at default 10% sampling
});
*/
