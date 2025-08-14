import {
  datadogRum,
  RumInitConfiguration,
  Context,
  ContextValue,
} from "@datadog/browser-rum";
import { getFlags, setFlags } from "./flags";
import type { LogsInitConfiguration } from "@datadog/browser-logs";
// import { datadogLogs } from "@datadog/browser-logs"; // optional

type User = {
  id?: string;
  name?: string;
  email?: string;
  [k: string]: unknown;
};

export type DdBaseInit = {
  applicationId: string;
  clientToken: string;

  site?:
    | "datadoghq.com"
    | "datadoghq.eu"
    | "us3.datadoghq.com"
    | "us5.datadoghq.com"
    | "ap1.datadoghq.com";
  service?: string;
  env?: string;
  version?: string;

  sessionSampleRate?: number; // %
  sessionReplaySampleRate?: number; // %

  actionSampleRate?: number; // % used by addAction
  errorSampleRate?: number; // % used by addError

  enableSessionReplay?: boolean;
  enableLogs?: boolean;

  rumOverrides?: Partial<RumInitConfiguration>;
  logsOverrides?: Partial<LogsInitConfiguration>;
};

let _isInitialized = false;
let _actionSampleRate = 100;
let _errorSampleRate = 100;

/** Toggle global telemetry on or off at runtime. */
export function setTelemetryEnabled(enabled: boolean) {
  setFlags({ telemetryEnabled: enabled });
}

/** True if initDatadog has completed on this page. */
export function isDatadogInitialized() {
  return _isInitialized;
}

/** Guarded, SSR-safe initialization. No-ops if already initialized. */
export function initDatadog(base: DdBaseInit) {
  if (_isInitialized) return;

  if (typeof window === "undefined") {
    _isInitialized = true; // SSR guard so imports will not throw on server

    (globalThis as any).__DD_SEND_ACTION__ = (
      name: string,
      attrs?: Record<string, unknown>,
      _sr?: number
    ) => datadogRum.addAction(name, attrs);
    (globalThis as any).__DD_SEND_ERROR__ = (
      err: Error,
      ctx?: Record<string, unknown>,
      _sr?: number
    ) => datadogRum.addError(err, ctx);

    // Pick up sampling defaults even on SSR for consistent helpers
    _actionSampleRate = clampPct(base.actionSampleRate ?? 100);
    _errorSampleRate = clampPct(base.errorSampleRate ?? 100);
    return;
  }

  datadogRum.init({
    applicationId: base.applicationId,
    clientToken: base.clientToken,
    site: base.site ?? "datadoghq.com",
    service: base.service,
    env: base.env,
    version: base.version,

    trackResources: true,
    trackLongTasks: false, // we use our own optional long-task observer
    trackUserInteractions: true,

    sessionSampleRate: base.sessionSampleRate ?? 100,
    sessionReplaySampleRate: base.sessionReplaySampleRate ?? 0,

    ...(base.rumOverrides ?? {}),
  });

  if (base.enableSessionReplay) {
    try {
      datadogRum.startSessionReplayRecording();
    } catch {
      // optional feature
    }
  }

  // Optional logs init
  // if (base.enableLogs) {
  //   datadogLogs.init({
  //     clientToken: base.clientToken,
  //     site: base.site ?? "datadoghq.com",
  //     service: base.service,
  //     env: base.env,
  //     forwardErrorsToLogs: true,
  //     sampleRate: base.sessionSampleRate ?? 100,
  //     ...(base.logsOverrides ?? {}),
  //   });
  // }

  _actionSampleRate = clampPct(base.actionSampleRate ?? 100);
  _errorSampleRate = clampPct(base.errorSampleRate ?? 100);

  _isInitialized = true;

  // Small breadcrumb so you can confirm init in RUM
  safeAddAction(
    "dd_utils_initialized",
    {
      service: base.service,
      env: base.env,
      version: base.version,
      actionSampleRate: _actionSampleRate,
      errorSampleRate: _errorSampleRate,
    },
    100
  );
}

/* ----------------- public helpers ----------------- */
/* Sampling-aware action helper. Never throws. Honors telemetry kill switch. */

export function addAction(
  name: string,
  attrs?: Record<string, unknown>,
  sampleRate?: number
) {
  safeAddAction(name, attrs, sampleRate ?? _actionSampleRate);
}

/** Add or replace global context for the session. Keep it small and flat. */
export function setGlobalContext(ctx: Context) {
  if (!_isInitialized || !getFlags().telemetryEnabled) return;
  try {
    datadogRum.setGlobalContext(ctx);
  } catch {}
}

/** Add a single key to the global context. */
export function addGlobalContext(key: string, value: ContextValue) {
  if (!_isInitialized || !getFlags().telemetryEnabled) return;
  try {
    datadogRum.setGlobalContext({ [key]: value });
  } catch {}
}

/** Associate the current RUM session with a user. */
export function setUser(user: User) {
  if (!_isInitialized || !getFlags().telemetryEnabled) return;
  try {
    datadogRum.setUser(user);
    // datadogLogs.setUser?.(user); // if logs enabled
  } catch {}
}

/** Optional breadcrumb for SPA navigations. Call from your router listener. */
export function trackRouteChange(from: string | null, to: string) {
  addAction("route_change", { from, to });
}

/** Escape hatch for advanced consumers. Prefer the helpers above in library code. */
export function getRum() {
  return datadogRum;
}

/* ----------------- internals ----------------- */

export function safeAddAction(
  name: string,
  attrs?: Record<string, unknown>,
  sampleRate = 100
) {
  if (!_isInitialized || !passSample(sampleRate)) return;
  if (!getFlags().telemetryEnabled) return;

  const g = globalThis as any;
  const enqueue = g.__DD_ENQUEUE_ACTION__ as
    | ((n: string, a?: Record<string, unknown>, s?: number) => void)
    | undefined;
  const coreSend = g.__DD_SEND_ACTION__ as
    | ((n: string, a?: Record<string, unknown>, s?: number) => void)
    | undefined;

  try {
    if (!navigator.onLine && enqueue) enqueue(name, attrs, sampleRate);
    else if (coreSend) coreSend(name, attrs, sampleRate);
  } catch {
    /* swallow */
  }
}

export function addError(
  err: unknown,
  context?: Record<string, unknown>,
  sampleRate?: number
) {
  if (!_isInitialized || !passSample(sampleRate ?? _errorSampleRate)) return;
  if (!getFlags().telemetryEnabled) return;

  const g = globalThis as any;
  const enqueue = g.__DD_ENQUEUE_ERROR__ as
    | ((e: unknown, c?: Record<string, unknown>, s?: number) => void)
    | undefined;
  const coreSend = g.__DD_SEND_ERROR__ as
    | ((e: Error, c?: Record<string, unknown>, s?: number) => void)
    | undefined;

  try {
    if (!navigator.onLine && enqueue) enqueue(err, context, sampleRate);
    else if (coreSend) coreSend(asError(err), context, sampleRate);
  } catch {
    /* swallow */
  }
}

function passSample(pct: number) {
  return Math.random() * 100 < clampPct(pct);
}

function clampPct(n: number) {
  if (Number.isNaN(n)) return 100;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function asError(err: unknown): Error {
  if (err instanceof Error) return err;
  try {
    return new Error(typeof err === "string" ? err : JSON.stringify(err));
  } catch {
    return new Error("Unknown error");
  }
}
