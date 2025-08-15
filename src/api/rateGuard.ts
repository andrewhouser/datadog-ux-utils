/**
 * @file rateGuard.ts
 * @description Guards against runaway or excessive API calls by rate-limiting requests and providing overflow strategies.
 */
import { addAction } from "../datadog.ts";
import { getFlags } from "../flags.ts";

/**
 * Strategy when limit is exceeded:
 * - "block": immediately reject and do NOT call the API (default)
 * - "queue": delay the call until the block window ends (keeps pressure off the backend, but may increase UX delay)
 * - "drop": silently drop and resolve to undefined (not recommended unless the caller handles "undefined")
 */
/**
 * Strategy when API rate limit is exceeded.
 * - "block": immediately reject and do NOT call the API (default)
 * - "queue": delay the call until the block window ends
 * - "drop": silently drop and resolve to undefined
 */
export type GuardOverflowStrategy = "block" | "queue" | "drop";

/**
 * Configuration options for the API rate guard utility.
 */
export type ApiRateGuardConfig = {
  windowMs: number; // e.g., 2000 (2s)
  maxRequests: number; // e.g., 5  (per window)
  blockDurationMs?: number; // e.g., 1500 — how long to block after exceeding (default = windowMs)
  reportDebounceMs?: number; // minimum time between DD reports for the same key (default 5000)
  sampleRate?: number; // % for DataDog action sampling (default 100)

  // How to group requests into a “key.” Default: <METHOD> <pathname> (ignores querystring)
  keyFn?: (input: RequestInfo | URL, init?: RequestInit) => string;

  // Whether to include failed requests in the counting. Default true.
  countOnFailure?: boolean;

  // What to do when the limit is exceeded
  overflowStrategy?: GuardOverflowStrategy;

  // Optional: filter which keys are guarded (e.g., only /api/*)
  allowKey?: (key: string) => boolean;
};

type Bucket = {
  // timestamps in ms since epoch for requests within window
  hits: number[];
  blockedUntil: number; // epoch ms; 0 if not blocked
  lastReportAt: number; // epoch ms; 0 if never reported
  // queue of deferred resolvers if strategy === 'queue'
  waiters?: Array<() => void>;
};

const DEFAULTS: Required<
  Pick<
    ApiRateGuardConfig,
    | "blockDurationMs"
    | "reportDebounceMs"
    | "sampleRate"
    | "countOnFailure"
    | "overflowStrategy"
  >
> = {
  blockDurationMs: 0, // 0 => use windowMs at runtime
  reportDebounceMs: 5000,
  sampleRate: 100,
  countOnFailure: true,
  overflowStrategy: "block",
};

// In-memory moving windows per key
/**
 * API rate guard for limiting requests per time window.
 *
 * @example
 * // Limit to 5 requests per 2 seconds
 * const guard = new ApiRateGuard({ windowMs: 2000, maxRequests: 5 });
 * await guard.guardFetch('/api/patients');
 */
export class ApiRateGuard {
  private cfg: Required<ApiRateGuardConfig>;
  private buckets = new Map<string, Bucket>();

  constructor(config: ApiRateGuardConfig) {
    const keyFn = config.keyFn ?? defaultKeyFn;
    const blockDurationMs = config.blockDurationMs ?? 0;
    this.cfg = {
      ...config,
      keyFn,
      blockDurationMs: blockDurationMs || config.windowMs,
      reportDebounceMs: config.reportDebounceMs ?? DEFAULTS.reportDebounceMs,
      sampleRate: config.sampleRate ?? DEFAULTS.sampleRate,
      countOnFailure: config.countOnFailure ?? DEFAULTS.countOnFailure,
      overflowStrategy: config.overflowStrategy ?? DEFAULTS.overflowStrategy,
      allowKey: config.allowKey ?? (() => true),
    };
  }

  /**
   * Wrap a fetch call. If the guard blocks, it throws ApiRunawayBlockedError
   * (or queues/drops according to strategy).
   */
  async guardFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const key = this.cfg.keyFn(input, init);
    if (!this.cfg.allowKey(key)) {
      return fetch(input, init); // not guarded
    }

    await this.beforeRequest(key);

    let resp: Response;
    try {
      resp = await fetch(input, init);
      // Count successful requests
      this.afterRequest(key, true);
      return resp;
    } catch (err) {
      // Optionally count failed requests too
      this.afterRequest(key, this.cfg.countOnFailure);
      throw err;
    }
  }

  /**
   * Generic guard for arbitrary async API calls (Axios, graphql-request, etc.)
   * Usage:
   *   await apiGuard.guard('POST /api/items', () => axios.post(...));
   */
  async guard<T>(key: string, call: () => Promise<T>): Promise<T | undefined> {
    if (!this.cfg.allowKey(key)) return call();

    await this.beforeRequest(key);

    try {
      const res = await call();
      this.afterRequest(key, true);
      return res;
    } catch (e) {
      this.afterRequest(key, this.cfg.countOnFailure);
      throw e;
    }
  }

  /** Clear counters for testing or when navigating away. */
  reset(key?: string) {
    if (key) this.buckets.delete(key);
    else this.buckets.clear();
  }

  /* ----------------- internals ----------------- */

  private getBucket(key: string): Bucket {
    let b = this.buckets.get(key);
    if (!b) {
      b = { hits: [], blockedUntil: 0, lastReportAt: 0 };
      this.buckets.set(key, b);
    }
    return b;
  }

  private async beforeRequest(key: string) {
    const now = Date.now();

    // Kill switch: if disabled, do nothing (no counting, no blocking, no reports)
    if (!getFlags().guardEnabled) return;

    const b = this.getBucket(key);
    this.prune(now, b);

    if (b.blockedUntil > now) {
      if (this.cfg.overflowStrategy === "queue") {
        await this.waitUntil(b.blockedUntil, b);
        // fallthrough; request proceeds after block expires
      } else if (this.cfg.overflowStrategy === "drop") {
        this.maybeReport(key, now, b, /*reason*/ "blocked_active");
        return Promise.resolve(undefined as never);
      } else {
        this.maybeReport(key, now, b, "blocked_active");
        throw new ApiRunawayBlockedError(key, this.cfg, b);
      }
    }

    // Tentatively count the request at the front of the call (protecting backend)
    b.hits.push(now);

    // Check if limit exceeded inside the window
    this.prune(now, b);
    if (b.hits.length > this.cfg.maxRequests) {
      // Enter block state and back out this attempt according to strategy
      b.blockedUntil = now + this.cfg.blockDurationMs;
      this.maybeReport(key, now, b, "threshold_exceeded");

      if (this.cfg.overflowStrategy === "queue") {
        // Remove the tentative hit; it will be re-added after waiting
        b.hits.pop();
        await this.waitUntil(b.blockedUntil, b);
        // After waiting, re-add and continue
        b.hits.push(Date.now());
        this.prune(Date.now(), b);
      } else if (this.cfg.overflowStrategy === "drop") {
        b.hits.pop();
        return Promise.resolve(undefined as never);
      } else {
        // "block"
        b.hits.pop();
        throw new ApiRunawayBlockedError(key, this.cfg, b);
      }
    }
  }

  private afterRequest(_key: string, count: boolean) {
    // No-op except we kept the timestamp if `count` is true.
    // If count=false (e.g., failed request and countOnFailure=false),
    // we should remove the last timestamp we pushed.
    if (!count) {
      const b = this.getBucket(_key);
      b.hits.pop();
    }
  }

  private prune(now: number, b: Bucket) {
    const wStart = now - this.cfg.windowMs;
    // Remove timestamps older than window start
    while (b.hits.length && b.hits[0] < wStart) b.hits.shift();
  }

  private maybeReport(
    key: string,
    now: number,
    b: Bucket,
    reason: "threshold_exceeded" | "blocked_active"
  ) {
    if (now - b.lastReportAt < this.cfg.reportDebounceMs) return;
    b.lastReportAt = now;

    if (passSample(this.cfg.sampleRate)) {
      addAction(
        "api_runaway_blocked",
        {
          key,
          reason, // "threshold_exceeded" or "blocked_active"
          window_ms: this.cfg.windowMs,
          max_requests: this.cfg.maxRequests,
          block_ms: this.cfg.blockDurationMs,
          count_in_window: b.hits.length,
        },
        this.cfg.sampleRate
      );
    }
  }

  private waitUntil(ts: number, b: Bucket) {
    if (Date.now() >= ts) return Promise.resolve();
    if (!b.waiters) b.waiters = [];
    return new Promise<void>((resolve) => {
      b.waiters!.push(resolve);
      const delay = ts - Date.now();
      setTimeout(() => {
        // Flush all waiters once block ends
        const w = b.waiters!;
        b.waiters = [];
        w.forEach((fn) => fn());
      }, delay);
    });
  }
}

/* ----------------- helpers & defaults ----------------- */

/**
 * Error thrown when API requests are blocked by the rate guard.
 */
export class ApiRunawayBlockedError extends Error {
  public readonly key: string;
  public readonly until: number;
  public readonly windowMs: number;
  public readonly maxRequests: number;
  constructor(key: string, cfg: Required<ApiRateGuardConfig>, b: Bucket) {
    super(
      `API requests blocked by guard for key "${key}" until ${new Date(
        b.blockedUntil
      ).toISOString()}`
    );
    this.name = "ApiRunawayBlockedError";
    this.key = key;
    this.until = b.blockedUntil;
    this.windowMs = cfg.windowMs;
    this.maxRequests = cfg.maxRequests;
  }
}

function defaultKeyFn(input: RequestInfo | URL, init?: RequestInit): string {
  // METHOD + PATHNAME (ignore querystring to avoid splitting by params)
  const method = (init?.method ?? "GET").toUpperCase();
  try {
    const u =
      typeof input === "string"
        ? new URL(input, location.origin)
        : new URL((input as URL).toString(), location.origin);
    return `${method} ${u.pathname}`;
  } catch {
    return `${method} ${String(input)}`;
  }
}

function passSample(pct: number) {
  return Math.random() * 100 < Math.max(0, Math.min(100, Math.round(pct)));
}
