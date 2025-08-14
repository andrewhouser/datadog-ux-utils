import { addAction, addGlobalContext } from "../datadog";

/**
 * Snapshot of client network conditions, normalized across browsers.
 */
export type NetworkInfo = {
  /** true if the browser reports "online" (fallback-only behavior if Network Info API is missing). */
  online: boolean;
  /** e.g., "wifi" | "cellular" | "ethernet" | "none" (normalized best-effort). */
  type?: string;
  /** e.g., "slow-2g" | "2g" | "3g" | "4g" (per Network Info API). */
  effectiveType?: string;
  /** Approx downstream bandwidth in megabits/sec when available. */
  downlinkMbps?: number;
  /** Round-trip time estimate in ms when available. */
  rttMs?: number;
  /** Whether the user enabled "Data Saver" / reduced data mode. */
  saveData?: boolean;
};

/**
 * Configuration for network tracking behavior.
 */
export type TrackNetworkOptions = {
  /**
   * Emit a Datadog action when network conditions change.
   * Default: true (sampled at `changeSampleRate`).
   */
  reportChanges?: boolean;

  /**
   * % sample rate for change events (0–100).
   * Default: 25. Only applies if `reportChanges` is true.
   */
  changeSampleRate?: number;

  /**
   * Treat the following as "constrained" for `isConstrainedNetwork()`.
   * Default: { effectiveTypes: ["slow-2g", "2g"], maxDownlinkMbps: 0.8, minRttMs: 300, respectSaveData: true }
   */
  constrained?: Partial<ConstrainedHeuristics>;

  /**
   * Debounce window in ms for high-churn changes on some devices.
   * Default: 150 ms.
   */
  debounceMs?: number;

  /**
   * Whether to update Datadog global context on every change.
   * Default: true. Context keys: network_effectiveType, network_downlinkMbps, network_rttMs, network_saveData, network_online, network_type
   */
  setGlobalContext?: boolean;
};

/**
 * Heuristics that define a "constrained" network.
 */
export type ConstrainedHeuristics = {
  effectiveTypes: string[]; // i.e., these effectiveTypes are considered constrained
  maxDownlinkMbps: number; // if downlink <= this, consider constrained
  minRttMs: number; // if rtt >= this, consider constrained
  respectSaveData: boolean; // if saveData === true, consider constrained
};

/** Internal module state so `isConstrainedNetwork()` can answer quickly. */
let currentInfo: NetworkInfo = baselineInfo();
let heuristics: ConstrainedHeuristics = defaultHeuristics();
let uninstalled = true;

/**
 * Start tracking network conditions. Safe to call multiple times; returns an
 * uninstaller that removes listeners.
 *
 * - Adds/updates Datadog global context on changes (optional).
 * - Emits a sampled Datadog action "network_change" on meaningful changes (optional).
 * - Listens to `navigator.connection` (when available) and the `online`/`offline` window events.
 *
 * @example
 * ```ts
 * import { trackNetwork, isConstrainedNetwork } from "@milliman/dd-ux-utils/env/network";
 *
 * const stop = trackNetwork({
 *   reportChanges: true,
 *   changeSampleRate: 20,
 *   constrained: { maxDownlinkMbps: 1, effectiveTypes: ["2g", "slow-2g", "3g"] },
 * });
 *
 * // Later, e.g., to adjust image quality:
 * if (isConstrainedNetwork()) loadLowResImages();
 *
 * // On teardown:
 * stop();
 * ```
 */
export function trackNetwork(options: TrackNetworkOptions = {}): () => void {
  const {
    reportChanges = true,
    changeSampleRate = 25,
    constrained,
    debounceMs = 150,
    setGlobalContext = true,
  } = options;

  // Update heuristics if caller customized them
  heuristics = { ...defaultHeuristics(), ...(constrained ?? {}) };

  const conn = getConnection();
  let pendingTimer: number | null = null;
  uninstalled = false;

  const apply = () => {
    const prev = currentInfo;
    const next = readInfo(conn);

    if (!hasMeaningfulChange(prev, next)) return;
    currentInfo = next;

    if (setGlobalContext) {
      addGlobalContext("network_effectiveType", next.effectiveType ?? null);
      addGlobalContext("network_downlinkMbps", next.downlinkMbps ?? null);
      addGlobalContext("network_rttMs", next.rttMs ?? null);
      addGlobalContext("network_saveData", !!next.saveData);
      addGlobalContext("network_online", !!next.online);
      addGlobalContext("network_type", next.type ?? null);
    }

    if (reportChanges && passSample(changeSampleRate)) {
      addAction(
        "network_change",
        {
          ...next,
          constrained: isConstrained(next, heuristics),
        },
        changeSampleRate
      );
    }
  };

  const debouncedApply = () => {
    if (pendingTimer != null) window.clearTimeout(pendingTimer);
    pendingTimer = window.setTimeout(apply, debounceMs);
  };

  // Initial read + context set
  apply();

  // Listeners
  const listeners: Array<() => void> = [];

  // Window online/offline
  const onOnline = () => debouncedApply();
  const onOffline = () => debouncedApply();
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  listeners.push(() => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  });

  // Network Information API (experimental; supported in Chromium, some Android browsers)
  if (conn) {
    const onConnChange = () => debouncedApply();
    conn.addEventListener?.("change", onConnChange as EventListener);
    // Some browsers expose onchange instead of addEventListener
    if (!conn.addEventListener && "onchange" in conn) {
      (conn as any).onchange = onConnChange;
      listeners.push(() => ((conn as any).onchange = null));
    } else {
      listeners.push(() =>
        conn.removeEventListener?.("change", onConnChange as EventListener)
      );
    }
  }

  return () => {
    if (pendingTimer != null) {
      window.clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    for (const off of listeners) off();
    uninstalled = true;
  };
}

/**
 * Returns `true` if current network conditions meet the "constrained" heuristics.
 * This is a fast, synchronous check based on the last observed snapshot.
 *
 * @example
 * ```ts
 * if (isConstrainedNetwork()) {
 *   // Skip auto-playing HD video, fetch smaller images, etc.
 *   enableDataLightMode();
 * }
 * ```
 */
export function isConstrainedNetwork(): boolean {
  return isConstrained(currentInfo, heuristics);
}

/* --------------------------- internals --------------------------- */

/** Get the NetworkInformation object if supported. */
function getConnection(): NetworkInformationLike | null {
  const nav = navigator as any;
  return nav.connection || nav.mozConnection || nav.webkitConnection || null;
}

/** Normalize current network info from browser APIs. */
function readInfo(conn: NetworkInformationLike | null): NetworkInfo {
  const online =
    typeof navigator.onLine === "boolean" ? navigator.onLine : true;
  const info: NetworkInfo = { online };

  if (conn) {
    // Normalize fields safely
    const eff = asString(conn.effectiveType);
    const type = asString(conn.type);
    const down = asNumber(conn.downlink);
    const rtt = asNumber(conn.rtt);
    const sd = !!(conn as any).saveData;

    if (eff) info.effectiveType = eff;
    if (type) info.type = type;
    if (!Number.isNaN(down)) info.downlinkMbps = down;
    if (!Number.isNaN(rtt)) info.rttMs = rtt;
    info.saveData = sd;
  }

  return info;
}

function baselineInfo(): NetworkInfo {
  return {
    online: typeof navigator.onLine === "boolean" ? navigator.onLine : true,
  };
}

function hasMeaningfulChange(a: NetworkInfo, b: NetworkInfo): boolean {
  return (
    a.online !== b.online ||
    a.effectiveType !== b.effectiveType ||
    a.type !== b.type ||
    !nearlyEqual(a.downlinkMbps, b.downlinkMbps, 0.1) ||
    !nearlyEqual(a.rttMs, b.rttMs, 15) ||
    !!a.saveData !== !!b.saveData
  );
}

function nearlyEqual(a?: number, b?: number, eps = 0): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= eps;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

function asNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number.NaN;
  return n;
}

function passSample(pct: number) {
  return Math.random() * 100 < clampPct(pct);
}

function clampPct(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function defaultHeuristics(): ConstrainedHeuristics {
  return {
    effectiveTypes: ["slow-2g", "2g"],
    maxDownlinkMbps: 0.8, // ~under 1 Mbps is quite constrained for modern apps
    minRttMs: 300, // very high RTT often correlates with poor UX
    respectSaveData: true,
  };
}

function isConstrained(info: NetworkInfo, h: ConstrainedHeuristics): boolean {
  if (!info.online) return true;
  if (h.respectSaveData && info.saveData) return true;
  if (
    info.effectiveType &&
    h.effectiveTypes.includes(info.effectiveType.toLowerCase())
  )
    return true;
  if (
    typeof info.downlinkMbps === "number" &&
    info.downlinkMbps <= h.maxDownlinkMbps
  )
    return true;
  if (typeof info.rttMs === "number" && info.rttMs >= h.minRttMs) return true;
  return false;
}

/* ------------------------ type shims ------------------------ */
/**
 * Partial shape of the experimental NetworkInformation API.
 * We keep it local so the file doesn’t require `dom` lib updates.
 */
type NetworkInformationLike = {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  type?: string;
  addEventListener?: (type: "change", listener: EventListener) => void;
  removeEventListener?: (type: "change", listener: EventListener) => void;
} & Record<string, unknown>;

/**
EXAMPLES

Basic setup (recommended defaults)
import { trackNetwork, isConstrainedNetwork } from "@milliman/dd-ux-utils/env/network";

const stopTracking = trackNetwork(); // reports sampled "network_change" events, sets global context

if (isConstrainedNetwork()) {
  // Choose lighter assets on first render
  enableLowBandwidthMode();
}

// Later, to clean up (e.g., on SPA unmount):
stopTracking();

Custom heuristics and sampling
trackNetwork({
  reportChanges: true,
  changeSampleRate: 10,
  constrained: {
    effectiveTypes: ["slow-2g", "2g", "3g"], // treat 3g as constrained for our app
    maxDownlinkMbps: 1.2,                    // <=1.2 Mbps is constrained
    minRttMs: 250,                           // RTT >= 250ms is constrained
  },
});

Disable Datadog action spam, keep global context fresh
trackNetwork({
  reportChanges: false,
  setGlobalContext: true,
});

Defer heavy images when constrained
const constrained = isConstrainedNetwork();
const heroSrc = constrained ? "/img/hero-800w.jpg" : "/img/hero-2000w.jpg";

*/
