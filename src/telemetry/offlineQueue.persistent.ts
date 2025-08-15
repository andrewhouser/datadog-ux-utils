/**
 * @file offlineQueue.persistent.ts
 * @description Buffers telemetry events while offline, persists to localStorage, and flushes when connectivity returns. Designed to cooperate with your datadog.ts via two global hooks set by this module.
 *
 * Usage (after initDatadog):
 *   installPersistentTelemetryQueue({ maxBuffered: 500, storageKey: 'dd_offline_v1' });
 */

type QueuedAction = {
  t: "a"; // action
  n: string; // name
  a?: Record<string, unknown>; // attrs
  s?: number; // sampleRate
  ts: number; // enqueue timestamp
};

type QueuedError = {
  t: "e"; // error
  e: string; // serialized error
  c?: Record<string, unknown>; // context
  s?: number; // sampleRate
  ts: number; // enqueue timestamp
};

type QueuedEvent = QueuedAction | QueuedError;

import { PersistentQueueOptions } from "../types/types.ts";

const DEFAULTS: Required<PersistentQueueOptions> = {
  storageKey: "dd_offline_queue_v1",
  maxBuffered: 400,
  byteCap: 1_500_000, // ~1.5MB, under typical 5MB LS limits
  flushOnInit: true,
  writeDebounceMs: 150,
};

let cfg: Required<PersistentQueueOptions>;
let q: QueuedEvent[] = [];
let installed = false;
let writeTimer: number | null = null;

// Real senders installed by datadog.ts via our global hooks
type SendAction = (
  name: string,
  attrs?: Record<string, unknown>,
  sampleRate?: number
) => void;
type SendError = (
  err: Error,
  context?: Record<string, unknown>,
  sampleRate?: number
) => void;

function getSenders(): { sendAction?: SendAction; sendError?: SendError } {
  const g = globalThis as any;
  return {
    sendAction: g.__DD_SEND_ACTION__ as SendAction | undefined,
    sendError: g.__DD_SEND_ERROR__ as SendError | undefined,
  };
}

/**
 * Installs the persistent offline telemetry queue.
 *
 * Buffers telemetry events (actions/errors) while offline, persists to localStorage, and flushes when connectivity returns.
 * Safe to call multiple times. Returns an uninstall function.
 *
 * @param opts - Persistent queue configuration (see {@link PersistentQueueOptions}).
 * @returns Uninstall function to remove listeners and hooks.
 *
 * @example
 * ```ts
 * import { installPersistentTelemetryQueue } from "datadog-ux-utils/telemetry";
 *
 * installPersistentTelemetryQueue({
 *   maxBuffered: 600,
 *   storageKey: "dd_offline_queue_v1",
 *   byteCap: 2_000_000,
 *   flushOnInit: true,
 *   writeDebounceMs: 120,
 * });
 * ```
 */
export function installPersistentTelemetryQueue(
  opts: PersistentQueueOptions = {}
) {
  if (installed) return uninstall;
  installed = true;
  cfg = { ...DEFAULTS, ...opts };

  // Load existing queue from LS
  q = readLS(cfg.storageKey);

  // Expose enqueue hooks that datadog.ts will call if present
  const g = globalThis as any;
  g.__DD_ENQUEUE_ACTION__ = enqueueAction;
  g.__DD_ENQUEUE_ERROR__ = enqueueError;

  // Listen for connectivity changes
  window.addEventListener("online", tryFlush);
  document.addEventListener("visibilitychange", onVisChange);

  if (cfg.flushOnInit) {
    tryFlush();
  }

  return uninstall;
}

/**
 * Uninstalls the persistent telemetry queue and removes listeners/hooks. Leaves stored events intact in localStorage.
 *
 * @returns void
 */
function uninstall() {
  if (!installed) return;
  installed = false;
  const g = globalThis as any;
  delete g.__DD_ENQUEUE_ACTION__;
  delete g.__DD_ENQUEUE_ERROR__;
  window.removeEventListener("online", tryFlush);
  document.removeEventListener("visibilitychange", onVisChange);
}

function onVisChange() {
  // If the page just became visible and we are online, try to flush.
  if (document.visibilityState === "visible") tryFlush();
}

/* ---------------- enqueue paths ---------------- */

function enqueueAction(
  name: string,
  attrs?: Record<string, unknown>,
  sampleRate?: number
) {
  if (navigator.onLine) {
    // If online, send immediately
    const { sendAction } = getSenders();
    if (sendAction) return sendAction(name, attrs, sampleRate);
  }
  // Else queue persistently
  push({ t: "a", n: name, a: attrs, s: sampleRate, ts: Date.now() });
}

function enqueueError(
  err: unknown,
  context?: Record<string, unknown>,
  sampleRate?: number
) {
  if (navigator.onLine) {
    const { sendError } = getSenders();
    if (sendError) return sendError(asError(err), context, sampleRate);
  }
  push({
    t: "e",
    e: serializeError(err),
    c: context,
    s: sampleRate,
    ts: Date.now(),
  });
}

function push(ev: QueuedEvent) {
  q.push(ev);

  // Size controls
  if (q.length > cfg.maxBuffered) {
    q.splice(0, q.length - cfg.maxBuffered);
  }
  shrinkToByteCap();

  scheduleWrite();
}

function scheduleWrite() {
  if (writeTimer != null) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    writeLS(cfg.storageKey, q);
  }, cfg.writeDebounceMs) as unknown as number;
}

/* ---------------- flushing ---------------- */

function tryFlush() {
  if (!navigator.onLine || q.length === 0) return;

  const { sendAction, sendError } = getSenders();
  if (!sendAction || !sendError) return; // datadog not wired yet

  // Send a copy so that if sending throws we do not lose the queue
  const copy = q.slice();
  for (const ev of copy) {
    try {
      if (ev.t === "a") sendAction(ev.n, ev.a, ev.s);
      else sendError(deserializeError(ev.e), ev.c, ev.s);
    } catch {
      // If any send fails, stop flushing to avoid loops
      break;
    }
    // Remove from in-memory queue as we go
    q.shift();
  }

  // Persist the updated queue
  writeLS(cfg.storageKey, q);
}

/* ---------------- storage helpers ---------------- */

function readLS(key: string): QueuedEvent[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Basic shape validation
    return parsed.filter((v) => v && (v.t === "a" || v.t === "e"));
  } catch {
    return [];
  }
}

function writeLS(key: string, events: QueuedEvent[]) {
  try {
    localStorage.setItem(key, JSON.stringify(events));
  } catch {
    // Storage full. Try to shrink aggressively and retry once.
    if (events.length > 0) {
      events.splice(0, Math.ceil(events.length * 0.2)); // drop oldest 20%
      try {
        localStorage.setItem(key, JSON.stringify(events));
      } catch {
        /* give up */
      }
    }
  }
}

function shrinkToByteCap() {
  try {
    let raw = JSON.stringify(q);
    if (raw.length <= cfg.byteCap) return;
    // Drop oldest until under cap
    // Use a coarse 10% chunk drop to avoid O(n^2) re-serializing
    while (q.length && raw.length > cfg.byteCap) {
      q.splice(0, Math.max(1, Math.floor(q.length * 0.1)));
      raw = JSON.stringify(q);
    }
  } catch {
    // If serialization fails, clear queue to avoid lockups
    q = [];
  }
}

/* ---------------- misc utils ---------------- */

function asError(err: unknown): Error {
  if (err instanceof Error) return err;
  try {
    return new Error(typeof err === "string" ? err : JSON.stringify(err));
  } catch {
    return new Error("Unknown error");
  }
}

function serializeError(err: unknown): string {
  if (err instanceof Error) {
    return JSON.stringify({
      n: err.name,
      m: err.message,
      s: (err as any).stack,
    });
  }
  try {
    return JSON.stringify(err);
  } catch {
    return '"Unknown error"';
  }
}

function deserializeError(s: string): Error {
  try {
    const o = JSON.parse(s);
    if (o && typeof o === "object" && ("m" in o || "message" in o)) {
      const e = new Error(o.m ?? o.message ?? "Error");
      if (o.n) e.name = o.n;
      if (o.s) (e as any).stack = o.s;
      return e;
    }
    return new Error(typeof o === "string" ? o : "Error");
  } catch {
    return new Error("Error");
  }
}

/** Example
import { installPersistentTelemetryQueue } from "@milliman/dd-ux-utils/telemetry/offlineQueue.persistent";

installPersistentTelemetryQueue({
  maxBuffered: 600,
  storageKey: "dd_offline_queue_v1",
  byteCap: 2_000_000,
  flushOnInit: true,
  writeDebounceMs: 120,
});
*/
