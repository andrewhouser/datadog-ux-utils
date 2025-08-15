/**
 * @file dedupe.ts
 * @description Deduplicates identical async calls and optionally caches results for a short TTL, reducing redundant network traffic and improving efficiency.
 */
import { addAction } from "../datadog.ts";

type State = "pending" | "cached";

type Entry<T> = {
  promise: Promise<T>;
  expireAt: number; // epoch ms when cache entry should be evicted (0 for no cache)
  state: State; // "pending" = in-flight, "cached" = resolved and cached
  startedAt: number; // when the op started (for telemetry)
};

const inFlight = new Map<string, Entry<any>>();

/**
 * Telemetry options for deduplication reporting.
 */
import { DedupeTelemetry, DedupeOptions } from "../types/types.ts";

/**
 * Deduplicate identical async calls and (optionally) cache results for a short TTL.
 *
 * Backward-compatible signatures:
 *   dedupe(key, op)                           // no caching, no telemetry
 *   dedupe(key, op, 5000)                     // ttlMs as number
 *   dedupe(key, op, { ttlMs: 5000, report: true }) // with options & telemetry
 *
 * @param key - Unique key for the operation (e.g., 'GET /api/items?page=1')
 * @param op - Function that returns a Promise
 * @param optionsOrTtl - Either a number (ttlMs) or an options object
 * @returns The resolved value from the operation, or cached value if available.
 *
 * @example
 * // Deduplicate concurrent fetches
 * async function loadPatients() {
 *   return dedupe('GET:/api/patients', async () => {
 *     const resp = await fetch('/api/patients');
 *     return resp.json();
 *   }, 5000); // 5s cache after resolution
 * }
 * // Two simultaneous calls will share the same network request
 * const [a, b] = await Promise.all([loadPatients(), loadPatients()]);
 */
export function dedupe<T>(
  key: string,
  op: () => Promise<T>,
  optionsOrTtl?: number | DedupeOptions
): Promise<T> {
  const { ttlMs, report } = normalizeOptions(optionsOrTtl);
  const now = Date.now();

  const existing = inFlight.get(key) as Entry<T> | undefined;
  if (existing && (existing.state === "pending" || existing.expireAt > now)) {
    // We have a coalesce or a cache hit
    maybeReport(report, existing.state, key, {
      age_ms: now - existing.startedAt,
      ttl_ms: existing.expireAt ? existing.expireAt - now : 0,
    });
    return existing.promise;
  }

  // Start fresh operation
  const startedAt = now;
  const entry: Entry<T> = {
    promise: Promise.resolve().then(op), // ensure async boundary
    expireAt: now + (ttlMs > 0 ? ttlMs : 0),
    state: "pending",
    startedAt,
  };

  inFlight.set(key, entry);

  entry.promise = entry.promise
    .then((res) => {
      if (ttlMs > 0) {
        // Convert to cached entry
        entry.state = "cached";
        entry.expireAt = Date.now() + ttlMs;
        entry.promise = Promise.resolve(res);

        // Schedule eviction
        setTimeout(() => {
          const cur = inFlight.get(key);
          if (cur && cur.state === "cached" && cur.expireAt <= Date.now()) {
            inFlight.delete(key);
          }
        }, ttlMs + 25);
      } else {
        // No caching: remove immediately after resolution
        inFlight.delete(key);
      }
      return res;
    })
    .catch((err) => {
      // On failure, drop the entry so callers can retry
      inFlight.delete(key);
      throw err;
    });

  return entry.promise;
}

/** Clear all deduped entries, or a single key if provided. */
export function clearDedupe(key?: string) {
  if (key) inFlight.delete(key);
  else inFlight.clear();
}

/** Number of active entries (pending + cached). */
export function dedupeSize() {
  return inFlight.size;
}

/* ---------------- internals ---------------- */

function normalizeOptions(opt?: number | DedupeOptions): {
  ttlMs: number;
  report: Required<Exclude<DedupeTelemetry, boolean>> & { enabled: boolean };
} {
  if (typeof opt === "number") {
    return {
      ttlMs: opt,
      report: { enabled: false, sampleRate: 10, actionName: "api_dedupe_hit" },
    };
  }
  const ttlMs = opt?.ttlMs ?? 0;

  // report option may be boolean or object
  let enabled = false;
  let sampleRate = 10;
  let actionName = "api_dedupe_hit";

  if (opt?.report === true) enabled = true;
  else if (typeof opt?.report === "object") {
    enabled = true;
    if (typeof opt.report.sampleRate === "number")
      sampleRate = clampPct(opt.report.sampleRate);
    if (opt.report.actionName) actionName = opt.report.actionName;
  }

  return { ttlMs, report: { enabled, sampleRate, actionName } };
}

function maybeReport(
  report: { enabled: boolean; sampleRate: number; actionName: string },
  kind: State,
  key: string,
  extra?: Record<string, unknown>
) {
  if (!report.enabled) return;
  if (Math.random() * 100 >= report.sampleRate) return;
  try {
    addAction(report.actionName, { key, kind, ...extra }, report.sampleRate);
  } catch {
    // swallow — telemetry must not affect behavior
  }
}

function clampPct(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 EXAMPLE

 // Deduplicate concurrent fetches
async function loadPatients() {
  return dedupe('GET:/api/patients', async () => {
    const resp = await fetch('/api/patients');
    return resp.json();
  }, 5000); // 5s cache after resolution
}

// Two simultaneous calls will share the same network request
const [a, b] = await Promise.all([loadPatients(), loadPatients()]);
 */
