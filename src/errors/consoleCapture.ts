import { addAction, addError } from "../datadog";
import { ConsoleCaptureOptions } from "../types/types";

type Originals = {
  log: typeof console.log;
  warn: typeof console.warn;
  error: typeof console.error;
};

let installed = false;
let originals: Originals | null = null;
let opts: Required<ConsoleCaptureOptions>;
const recent = new Map<string, number>(); // key -> lastTimestamp

const DEFAULTS: Required<ConsoleCaptureOptions> = {
  errorRate: 20,
  warnRate: 5,
  logRate: 0,
  dedupeWindowMs: 5000,
  maxStringLen: 1000,
  maxArgs: 5,
  includeTrace: false,
  captureInDev: false,
  sanitize: defaultSanitize,
};

/**
 * Installs console capture. Call once at app startup after initDatadog().
 * Returns an uninstall function that restores the original console methods.
 */
export function captureConsole(options: ConsoleCaptureOptions = {}) {
  if (installed) return uninstall;
  installed = true;
  opts = { ...DEFAULTS, ...options };

  originals = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  console.error = wrap("error", originals.error, opts.errorRate);
  console.warn = wrap("warn", originals.warn, opts.warnRate);
  console.log = wrap("log", originals.log, opts.logRate);

  return uninstall;
}

/** Restores original console methods and clears dedupe memory. */
export function uninstall() {
  if (!installed) return;
  installed = false;
  if (originals) {
    console.log = originals.log;
    console.warn = originals.warn;
    console.error = originals.error;
    originals = null;
  }
  recent.clear();
}

/* ---------------- internals ---------------- */

function wrap(
  level: "error" | "warn" | "log",
  original: (...args: any[]) => void,
  rate: number
) {
  const pass = (pct: number) => Math.random() * 100 < clampPct(pct);

  return function patched(this: unknown, ...args: unknown[]) {
    // Always call the original immediately (never block the console)
    try {
      original.apply(console, args as any);
    } catch {
      // ignore
    }

    // Skip telemetry in dev unless explicitly enabled (but still send errors)
    const isDev =
      typeof process !== "undefined" &&
      process.env &&
      process.env.NODE_ENV !== "production";
    if (isDev && !opts.captureInDev && level !== "error") return;

    if (rate <= 0) return;
    if (!pass(rate)) return;

    // Prepare a minimal, safe payload
    const sliced = args.slice(0, opts.maxArgs).map((a) => opts.sanitize(a));
    const msg = toPrimaryMessage(sliced);
    const key = `${level}:${msg}`;

    // Deduplicate within the configured window
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < opts.dedupeWindowMs) return;
    recent.set(key, now);

    // Build context
    const ctx: Record<string, unknown> = {
      level,
      message: truncate(msg, opts.maxStringLen),
      arg_count: args.length,
    };

    if (opts.includeTrace && level !== "error") {
      const trace = new Error().stack;
      if (trace) ctx.trace = trimStack(trace);
    }

    // If one of the args is an Error, route via addError for better grouping
    const errObj = extractError(args);
    if (level === "error" || errObj) {
      addError(errObj ?? new Error(ctx.message as string), {
        ...ctx,
        // include sanitized arguments for context
        args: sliced,
      });
    } else {
      addAction(level === "warn" ? "console_warn" : "console_log", {
        ...ctx,
        args: sliced,
      });
    }
  };
}

function extractError(args: unknown[]): Error | null {
  for (const a of args) {
    if (a instanceof Error) return a;
    // common error-like objects
    if (
      a &&
      typeof a === "object" &&
      ("message" in (a as any) || "stack" in (a as any))
    ) {
      try {
        const e = new Error((a as any).message ?? "Error");
        if ((a as any).name) e.name = (a as any).name;
        if ((a as any).stack) (e as any).stack = (a as any).stack;
        return e;
      } catch {
        // ignore
      }
    }
  }
  return null;
}

function toPrimaryMessage(args: unknown[]): string {
  if (!args.length) return "";
  const first = args[0];
  if (typeof first === "string") return first;
  try {
    return JSON.stringify(first);
  } catch {
    return String(first);
  }
}

function defaultSanitize(arg: unknown): unknown {
  if (arg == null) return arg;
  const t = typeof arg;
  if (t === "string") return truncate(arg as string, DEFAULTS.maxStringLen);
  if (t === "number" || t === "boolean") return arg;
  if (arg instanceof Error) {
    return {
      name: arg.name,
      message: truncate(arg.message, DEFAULTS.maxStringLen),
      stack: trimStack(arg.stack ?? ""),
    };
  }
  if (Array.isArray(arg)) return arg.slice(0, 10).map(defaultSanitize);
  if (t === "function") return "[function]";
  if (t === "object") {
    // Shallow copy with truncated values
    const out: Record<string, unknown> = {};
    const src = arg as Record<string, unknown>;
    let count = 0;
    for (const k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      out[k] = defaultSanitize(src[k]);
      if (++count >= 30) break; // cap object breadth
    }
    return out;
  }
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

function trimStack(stack: string) {
  // Keep first line + a few frames to reduce payload size
  const lines = stack.split("\n");
  return lines.slice(0, 5).join("\n");
}

function clampPct(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Example
import { captureConsole } from "@milliman/dd-ux-utils/errors/consoleCapture";

captureConsole({
  errorRate: 25,
  warnRate: 10,
  logRate: 0,          // keep 0 to disable log capture
  includeTrace: true,  // attach a short stack to warns/logs
  captureInDev: false, // keep dev noise low
});
 */
