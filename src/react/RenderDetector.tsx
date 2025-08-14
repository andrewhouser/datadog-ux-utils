import {
  Profiler,
  ProfilerOnRenderCallback,
  ReactNode,
  useMemo,
  useRef,
} from "react";
import { addAction } from "../datadog"; // Safe, no-op if your init gates telemetry

/**
 * Options controlling when a subtree is considered a render hotspot.
 */
export type RenderDetectorOptions = {
  /**
   * Enable the detector. Default:
   *  - In development: true
   *  - In production:  false
   */
  enabled?: boolean;

  /**
   * Size of the sliding window (in milliseconds) over which commit metrics
   * are computed. Default: 2000ms (2 seconds).
   */
  windowMs?: number;

  /**
   * Threshold for commits per second that flags a hotspot.
   * Example: if set to 5, more than 5 commits/sec within the window triggers.
   * Default: 5 commits/sec.
   */
  commitsPerSecThreshold?: number;

  /**
   * Threshold for total render time per second (in milliseconds) that flags a hotspot.
   * Example: if set to 24, more than 24ms of render work per second within the window triggers.
   * Default: 24ms/sec (roughly > 40% of a 60fps frame budget).
   */
  renderMsPerSecThreshold?: number;

  /**
   * Minimum number of commits within the window before evaluating thresholds.
   * Prevents noise from one-off commits. Default: 3 commits.
   */
  minCommits?: number;

  /**
   * Cooldown period (ms) after a hotspot is reported before reporting again
   * for the same detector. Default: 5000ms (5s).
   */
  cooldownMs?: number;

  /**
   * Optional sample rate (0–100) for sending telemetry to DataDog via `addAction`.
   * Default: 20 (%). Set to 0 to disable telemetry.
   */
  telemetrySampleRate?: number;

  /**
   * Action name emitted to DataDog when a hotspot is detected.
   * Default: "render_hotspot".
   */
  telemetryActionName?: string;

  /**
   * Optional callback invoked when a hotspot is detected.
   * Use this to log locally, show a dev toast, etc.
   */
  onHotspot?: (info: HotspotInfo) => void;

  /**
   * Include React Profiler baseDuration and phase in telemetry.
   * Default: true. If false, only time-based aggregates are sent.
   */
  includeProfilerDetails?: boolean;

  /**
   * Arbitrary static context to include on every hotspot report.
   * (Kept shallow to avoid heavy serialization.)
   */
  context?: Record<string, unknown>;
};

/**
 * Information passed to `onHotspot` and included in telemetry.
 */
export type HotspotInfo = {
  /** The logical id of this detector (component name, route name, etc.). */
  id: string;
  /** Commits/sec over the sliding window. */
  commitsPerSec: number;
  /** Total render ms per sec (sum of actualDuration) over the window. */
  renderMsPerSec: number;
  /** Number of commits observed within the window. */
  commitsInWindow: number;
  /** Sliding window length (ms). */
  windowMs: number;
  /** Which thresholds were exceeded. */
  reasons: Array<"commits_per_sec" | "render_ms_per_sec">;
  /** Timestamp (ms since navigation start) of the last commit considered. */
  at: number;
  /** Optional extra from the last commit (phase, baseDuration). */
  lastCommit?: {
    phase: "mount" | "update" | "nested-update" | "unknown";
    actualDurationMs: number;
    baseDurationMs?: number;
  };
  /** Static context passed via props.context (if any). */
  context?: Record<string, unknown>;
};

/**
 * Props for RenderDetector.
 */
export type RenderDetectorProps = {
  /**
   * A stable identifier for the subtree you're observing.
   * Keep this short and human-readable; it will appear in logs/telemetry.
   */
  id: string;

  /**
   * Optional options; see `RenderDetectorOptions` for details.
   */
  options?: RenderDetectorOptions;

  /**
   * The subtree to measure.
   */
  children: ReactNode;
};

/**
 * RenderDetector
 * --------------
 * Wraps a subtree in a React Profiler, tracks commit frequency and render cost in a sliding window,
 * and reports when thresholds are exceeded. Intended primarily for development; can be force-enabled
 * in production for targeted diagnostics.
 *
 * ## What it measures
 * - **commits/sec** over the last `windowMs` (default 2s)
 * - **render ms/sec** (sum of `actualDuration`) over the last `windowMs`
 *
 * ## When it reports
 * - When `commitsPerSec > commitsPerSecThreshold` OR
 * - When `renderMsPerSec > renderMsPerSecThreshold`
 * - Only after at least `minCommits` commits within the window
 * - At most once per `cooldownMs`
 *
 * ## Telemetry
 * - Sends a single DataDog action (sampled) per hotspot with:
 *   `{ id, commitsPerSec, renderMsPerSec, commitsInWindow, reasons, windowMs, ... }`
 * - Defaults: `telemetryActionName = "render_hotspot"`, `telemetrySampleRate = 20`
 * - You can disable telemetry by setting `telemetrySampleRate: 0`
 *
 * ## Example
 * ```tsx
 * import { RenderDetector } from "@milliman/dd-ux-utils/react/dev/RenderDetector";
 *
 * function ResultsPanel() {
 *   return (
 *     <RenderDetector
 *       id="ResultsPanel"
 *       options={{
 *         commitsPerSecThreshold: 6,
 *         renderMsPerSecThreshold: 30,
 *         onHotspot: info => console.warn("Render hotspot:", info),
 *       }}
 *     >
 *       <ExpensiveResults />
 *     </RenderDetector>
 *   );
 * }
 * ```
 *
 * ## Example (force-enable in production, different thresholds)
 * ```tsx
 * <RenderDetector
 *   id="SearchResults"
 *   options={{
 *     enabled: true,                   // opt-in for prod
 *     windowMs: 3000,
 *     commitsPerSecThreshold: 4,
 *     renderMsPerSecThreshold: 20,
 *     telemetrySampleRate: 10,
 *     context: { route: "/search" },
 *   }}
 * >
 *   <SearchResults />
 * </RenderDetector>
 * ```
 */
export function RenderDetector({ id, options, children }: RenderDetectorProps) {
  const opts = useMemo<Required<RenderDetectorOptions>>(
    () => ({
      enabled:
        options?.enabled ??
        (typeof process !== "undefined" &&
          process.env &&
          process.env.NODE_ENV !== "production"),
      windowMs: options?.windowMs ?? 2000,
      commitsPerSecThreshold: options?.commitsPerSecThreshold ?? 5,
      renderMsPerSecThreshold: options?.renderMsPerSecThreshold ?? 24,
      minCommits: options?.minCommits ?? 3,
      cooldownMs: options?.cooldownMs ?? 5000,
      telemetrySampleRate:
        typeof options?.telemetrySampleRate === "number"
          ? clampPct(options.telemetrySampleRate)
          : 20,
      telemetryActionName: options?.telemetryActionName ?? "render_hotspot",
      onHotspot: options?.onHotspot ?? noop,
      includeProfilerDetails: options?.includeProfilerDetails ?? true,
      context: options?.context ?? {},
    }),
    [options]
  );

  // A ring buffer would be fine; an array with head pruning is simpler and tiny here.
  const commitsRef = useRef<
    Array<{
      t: number;
      d: number;
      bd?: number;
      ph: NonNullable<HotspotInfo["lastCommit"]>["phase"];
    }>
  >([]);
  const lastReportAtRef = useRef(0);

  const onRender: ProfilerOnRenderCallback = (
    _id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    _commitTime
  ) => {
    if (!opts.enabled) return;

    const now = startTime; // perf timestamp when render started (ms since page load)
    const windowStart = now - opts.windowMs;

    // Record this commit
    commitsRef.current.push({
      t: now,
      d: actualDuration,
      bd: opts.includeProfilerDetails ? baseDuration : undefined,
      ph: (phase as any) ?? "unknown",
    });

    // Prune old commits outside the sliding window
    const buf = commitsRef.current;
    while (buf.length && buf[0].t < windowStart) buf.shift();

    // Bail early if not enough signal
    if (buf.length < opts.minCommits) return;

    // Aggregate metrics over the current window
    const commitsInWindow = buf.length;
    const durationSum = buf.reduce((acc, c) => acc + c.d, 0);
    // Normalize to per-second rates
    const seconds = opts.windowMs / 1000;
    const commitsPerSec = commitsInWindow / seconds;
    const renderMsPerSec = durationSum / seconds;

    const reasons: HotspotInfo["reasons"] = [];
    if (commitsPerSec > opts.commitsPerSecThreshold)
      reasons.push("commits_per_sec");
    if (renderMsPerSec > opts.renderMsPerSecThreshold)
      reasons.push("render_ms_per_sec");
    if (reasons.length === 0) return;

    // Cooldown gating
    const lastAt = lastReportAtRef.current;
    if (now - lastAt < opts.cooldownMs) return;
    lastReportAtRef.current = now;

    const last = buf[buf.length - 1];
    const info: HotspotInfo = {
      id,
      commitsPerSec: round2(commitsPerSec),
      renderMsPerSec: round2(renderMsPerSec),
      commitsInWindow,
      windowMs: opts.windowMs,
      reasons,
      at: now,
      lastCommit: opts.includeProfilerDetails
        ? {
            phase: last.ph,
            actualDurationMs: round2(last.d),
            baseDurationMs: last.bd != null ? round2(last.bd) : undefined,
          }
        : undefined,
      context: opts.context,
    };

    // Local callback
    try {
      opts.onHotspot(info);
    } catch {
      // never let diagnostics break app code
    }

    // Optional telemetry
    if (opts.telemetrySampleRate > 0 && passSample(opts.telemetrySampleRate)) {
      try {
        addAction(
          opts.telemetryActionName,
          info as unknown as Record<string, unknown>,
          opts.telemetrySampleRate
        );
      } catch {
        // swallow
      }
    }
  };

  if (!opts.enabled) {
    // Fast path: no Profiler wrapper if disabled
    return <>{children}</>;
  }

  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  );
}

/* ----------------------------- helpers ----------------------------- */

function noop() {}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function clampPct(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
function passSample(pct: number) {
  return Math.random() * 100 < pct;
}

/* ------------------------------------------------------------------ */
/**
 * ## Additional Examples
 *
 * ### 1) Detect chatty lists (development-only default)
 * ```tsx
 * <RenderDetector id="LargeList">
 *   <LargeList items={items} />
 * </RenderDetector>
 * ```
 *
 * ### 2) Tighten thresholds for a known hot area
 * ```tsx
 * <RenderDetector
 *   id="AutoComplete"
 *   options={{
 *     commitsPerSecThreshold: 8,     // allow more commits/sec
 *     renderMsPerSecThreshold: 16,   // stricter time budget
 *     minCommits: 5,
 *     cooldownMs: 3000,
 *     onHotspot: ({ commitsPerSec, renderMsPerSec }) => {
 *       console.warn("AutoComplete hotspot", { commitsPerSec, renderMsPerSec });
 *     },
 *   }}
 * >
 *   <AutoComplete />
 * </RenderDetector>
 * ```
 *
 * ### 3) Disable telemetry but keep local warnings
 * ```tsx
 * <RenderDetector
 *   id="Chart"
 *   options={{
 *     telemetrySampleRate: 0, // disable DataDog sends
 *     onHotspot: info => console.table(info),
 *   }}
 * >
 *   <Chart />
 * </RenderDetector>
 * ```
 *
 * ### 4) Add static context fields for grouping
 * ```tsx
 * <RenderDetector
 *   id="DashboardCards"
 *   options={{ context: { route: "/dashboard", area: "cards" } }}
 * >
 *   <DashboardCards />
 * </RenderDetector>
 * ```
 */
