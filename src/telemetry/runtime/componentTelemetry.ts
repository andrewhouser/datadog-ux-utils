/**
 * @file componentTelemetry.ts
 * @description Runtime component telemetry instrumentation for sampled mount events and UX component adoption tracking.
 */
// Runtime component telemetry instrumentation.
// Lightweight, sampled mount events for design system / UX component adoption tracking.

import { addAction } from "../../datadog.js";
import { getUxConfig } from "../../config.js";

/** Configuration for runtime component telemetry (subset; extended externally if needed). */
/** @category Telemetry */
export interface ComponentTelemetryConfig {
  /**
   * Fraction (0..1) of mount events to sample.
   * @default 0.25
   */
  sampleRate?: number;
  /**
   * Flush interval (ms) for queued events.
   * Set to 0 to disable interval flushing (still flushes on threshold / visibility hidden).
   * @default 5000
   */
  flushIntervalMs?: number;
  /**
   * By default events are suppressed when `env === "dev"` to avoid local noise.
   * Set `allowInDev` true to always record.
   * @default false
   */
  allowInDev?: boolean;
  /**
   * Optional custom sink callback.
   * If provided each flush will pass a batch array; returning void.
   * When present the internal Datadog `addAction` forwarding is skipped.
   */
  sink?: (batch: ComponentMountEvent[]) => void;
}

/** Shape recorded for each component mount (only first mount per component instance). */
/** @category Telemetry */
export interface ComponentMountEvent {
  /** Event type discriminator */
  t: "component_mount";
  /** Epoch timestamp (ms) when component mounted */
  ts: number;
  /** Component name identifier (keep stable across versions) */
  component: string;
  /** Library version pulled from `getUxConfig().version` */
  libVersion: string;
  /** Current route / pathname (best effort) */
  route?: string;
  /** Optional variant (e.g. size, theme) for A/B style analysis */
  variant?: string;
  /** App name from config */
  app?: string;
  /** Environment from config */
  env?: string;
}

let _cfg: Required<ComponentTelemetryConfig> | null = null;
let _queue: ComponentMountEvent[] = [];
let _timer: number | null = null;
let _initialized = false;
const DEFAULTS: Required<ComponentTelemetryConfig> = {
  sampleRate: 0.25,
  flushIntervalMs: 5000,
  allowInDev: false,
  sink: (batch) => {
    // Default sink: forward each event as an action (lower cardinality grouping with action name)
    batch.forEach((evt) => {
      try {
        addAction(
          "ds_component_mount",
          evt as any,
          Math.round((_cfg?.sampleRate ?? 1) * 100)
        );
      } catch {
        /* swallow */
      }
    });
  },
};

/**
 * Initialize component runtime telemetry (idempotent).
 *
 * Call once during app bootstrap (after `initDatadogUx`).
 * Skips activation in `dev` unless `allowInDev` true.
 *
 * Example:
 * ```ts
 * import { initDatadogUx } from 'datadog-ux-utils';
 * import { initComponentTelemetry } from 'datadog-ux-utils/telemetry';
 *
 * initDatadogUx({ appName: 'Shop', actionSampleRate: 50 });
 * initComponentTelemetry({ sampleRate: 0.2 });
 * ```
 */
/** @category Telemetry */
export function initComponentTelemetry(config: ComponentTelemetryConfig = {}) {
  if (_initialized) return;
  const merged: Required<ComponentTelemetryConfig> = {
    ...DEFAULTS,
    ...config,
  } as any;
  const env = getUxConfig().env;
  if (!merged.allowInDev && env === "dev") {
    _initialized = true; // mark to avoid re-init attempts
    return;
  }
  _cfg = merged;
  _initialized = true;
  if (!_timer && _cfg.flushIntervalMs > 0) {
    _timer = window.setInterval(() => flush(), _cfg.flushIntervalMs);
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush(true);
    });
  }
}

/**
 * Report a component mount.
 * Usually invoked automatically via the `useComponentTelemetry` React hook.
 * Safe no-op if not initialized or sampled out.
 *
 * Example (manual call):
 * ```ts
 * reportComponentMount('Button', { variant: 'primary', route: '/checkout' });
 * ```
 */
/** @category Telemetry */
export function reportComponentMount(
  component: string,
  options?: { variant?: string; route?: string; force?: boolean }
) {
  if (!_initialized) return;
  if (!_cfg) return;
  if (!options?.force && Math.random() > _cfg.sampleRate) return;

  const ux = getUxConfig();
  _queue.push({
    t: "component_mount",
    ts: Date.now(),
    component,
    libVersion: ux.version,
    app: ux.appName,
    env: ux.env,
    route: options?.route ?? safeRoute(),
    variant: options?.variant,
  });
  if (_queue.length >= 50) flush();
}

/**
 * Flush queued events to the configured sink immediately.
 * Automatically invoked on size threshold, interval, and page hide.
 */
/** @category Telemetry */
export function flush(useBeacon = false) {
  if (!_cfg || _queue.length === 0) return;
  const batch = _queue.splice(0, _queue.length);
  try {
    _cfg.sink(batch);
  } catch {
    /* swallow */
  }
}

function safeRoute() {
  try {
    return window.location.pathname;
  } catch {
    return undefined;
  }
}

/**
 * Test helper: reset internal state & timers.
 * Not part of the public API (subject to change).
 */
/** @category Telemetry */
export function _resetComponentTelemetry() {
  if (_timer) clearInterval(_timer);
  _timer = null;
  _queue = [];
  _cfg = null;
  _initialized = false;
}
