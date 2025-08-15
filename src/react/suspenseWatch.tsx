/**
 * @file suspenseWatch.tsx
 * @description React Suspense boundary wrapper that reports slow fallbacks and resolutions to telemetry.
 */
import { ReactNode, useEffect, useRef, Suspense } from "react";
import { addAction, addError } from "../datadog.ts";

/**
 * Options that control how SuspenseWatch reports and samples events.
 */
export type SuspenseWatchOptions = {
  /**
   * Milliseconds the fallback may remain visible before it's considered "slow".
   * @default 1200
   */
  timeoutMs?: number;

  /**
   * % sample rate for telemetry (0–100). Set to 0 to disable Datadog reporting.
   * @default 20
   */
  sampleRate?: number;

  /**
   * Emit a second event when content finally resolves after a slow fallback.
   * @default true
   */
  reportResolveAfterSlow?: boolean;

  /**
   * Action names for Datadog. Usually you won't need to change these.
   */
  actionNames?: {
    /** Emitted once when the fallback crosses timeoutMs. */
    slow?: string; // default "suspense_slow"
    /** Emitted when a slow fallback eventually resolves. */
    resolved?: string; // default "suspense_resolved_after_slow"
  };

  /**
   * Optional callback when the fallback crosses timeoutMs.
   * Receives timing info; return value is ignored.
   */
  onSlow?: (info: SuspenseSlowInfo) => void;

  /**
   * Optional callback when the slow fallback eventually resolves.
   */
  onResolvedAfterSlow?: (info: SuspenseResolvedInfo) => void;

  /**
   * If true, also send a Datadog error on slow fallback (grouped as error).
   * Useful when prolonged loading is considered a defect.
   * @default false
   */
  alsoReportError?: boolean;
};

/**
 * Props for SuspenseWatch.
 */
export type SuspenseWatchProps = {
  /**
   * Human-friendly identifier for this boundary (e.g., "SearchResults", "PatientCard").
   */
  id: string;

  /**
   * The content that may suspend.
   */
  children: ReactNode;

  /**
   * The fallback UI to render while suspended.
   */
  fallback: ReactNode;

  /**
   * Reporting / behavior options.
   */
  options?: SuspenseWatchOptions;
};

/**
 * Info passed to `onSlow`.
 */
export type SuspenseSlowInfo = {
  /** Boundary ID. */
  id: string;
  /** Timeout threshold in ms. */
  timeoutMs: number;
  /** When the fallback mounted (ms since page load). */
  fallbackStart: number;
};

/**
 * Info passed to `onResolvedAfterSlow`.
 */
export type SuspenseResolvedInfo = SuspenseSlowInfo & {
  /** How long the fallback was visible (ms). */
  fallbackVisibleMs: number;
};

/**
 * SuspenseWatch
 * -------------
 * Wraps a React.Suspense boundary and reports when the fallback remains visible
 * longer than `timeoutMs`. A "slow" event is emitted once per suspend cycle
 * (even if the fallback remains longer), and an optional "resolved" event is
 * emitted when the content finally appears.
 *
 * Implementation details:
 * - We insert tiny sentinels inside both the fallback and the content tree.
 *   Mount/unmount of those sentinels tell us when the boundary is suspended
 *   or has resolved.
 * - Each time the boundary re-suspends, a new cycle begins and the logic repeats.
 * - Telemetry uses `addAction` (and optionally `addError`) and is sampled.
 *
 * @example
 * ```tsx
 * import { SuspenseWatch } from "@milliman/datadog-ux-utils/react/SuspenseWatch";
 *
 * export function ResultsSection() {
 *   return (
 *     <SuspenseWatch
 *       id="ResultsSection"
 *       fallback={<Spinner label="Loading results…" />}
 *       options={{
 *         timeoutMs: 1500,
 *         sampleRate: 25,
 *         onSlow: ({ id, timeoutMs }) => {
 *           console.warn(`${id} still loading after ${timeoutMs}ms`);
 *         },
 *       }}
 *     >
 *       <ResultsList />
 *     </SuspenseWatch>
 *   );
 * }
 * ```
 */
export function SuspenseWatch({
  id,
  children,
  fallback,
  options,
}: SuspenseWatchProps) {
  const opts = useRef<Required<SuspenseWatchOptions>>({
    timeoutMs: options?.timeoutMs ?? 1200,
    sampleRate: clampPct(options?.sampleRate ?? 20),
    reportResolveAfterSlow: options?.reportResolveAfterSlow ?? true,
    actionNames: {
      slow: options?.actionNames?.slow ?? "suspense_slow",
      resolved:
        options?.actionNames?.resolved ?? "suspense_resolved_after_slow",
    },
    onSlow: options?.onSlow ?? noop,
    onResolvedAfterSlow: options?.onResolvedAfterSlow ?? noop,
    alsoReportError: options?.alsoReportError ?? false,
  });

  // Keep latest options without re-mounting sentinels
  useEffect(() => {
    opts.current = {
      ...opts.current,
      timeoutMs: options?.timeoutMs ?? opts.current.timeoutMs,
      sampleRate: clampPct(options?.sampleRate ?? opts.current.sampleRate),
      reportResolveAfterSlow:
        options?.reportResolveAfterSlow ?? opts.current.reportResolveAfterSlow,
      actionNames: {
        slow: options?.actionNames?.slow ?? opts.current.actionNames.slow,
        resolved:
          options?.actionNames?.resolved ?? opts.current.actionNames.resolved,
      },
      onSlow: options?.onSlow ?? opts.current.onSlow,
      onResolvedAfterSlow:
        options?.onResolvedAfterSlow ?? opts.current.onResolvedAfterSlow,
      alsoReportError: options?.alsoReportError ?? opts.current.alsoReportError,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  // Per-cycle state (a “cycle” is fallback mount → content mount)
  const cycleRef = useRef<{
    fallbackStart: number;
    slowEmitted: boolean;
    slowTimer: number | null;
  } | null>(null);

  /** Called when fallback first becomes visible (suspension starts). */
  const onFallbackMount = () => {
    const { timeoutMs } = opts.current;
    const start = performance.now();

    // Begin a new cycle (in case of re-suspends)
    endCycle(false); // clear previous
    cycleRef.current = {
      fallbackStart: start,
      slowEmitted: false,
      slowTimer: null,
    };

    // Schedule slow mark
    const slowTimer = window.setTimeout(() => {
      emitSlow(start);
    }, timeoutMs);
    cycleRef.current.slowTimer = slowTimer;
  };

  /** Called when fallback unmounts (content resolved). */
  const onFallbackUnmount = () => {
    // Nothing here; we’ll handle in content mount
  };

  /** Called when content finally mounts (resolution). */
  const onContentMount = () => {
    const c = cycleRef.current;
    if (!c) return; // no active cycle (shouldn't happen, but safe)
    // If slow already emitted and we want to report resolution, do so.
    if (c.slowEmitted && opts.current.reportResolveAfterSlow) {
      const duration = Math.round(performance.now() - c.fallbackStart);
      const info: SuspenseResolvedInfo = {
        id,
        timeoutMs: opts.current.timeoutMs,
        fallbackStart: c.fallbackStart,
        fallbackVisibleMs: duration,
      };
      try {
        opts.current.onResolvedAfterSlow(info);
      } catch {
        // intentionally ignore
      }
      if (opts.current.sampleRate > 0 && passSample(opts.current.sampleRate)) {
        try {
          addAction(
            opts.current.actionNames.resolved || "suspense_resolved_after_slow",
            info as any,
            opts.current.sampleRate
          );
        } catch {
          // intentionally ignore
        }
      }
    }
    // End the cycle and clear timers
    endCycle(true);
  };

  /** Called when content unmounts (e.g., route away); clear timers. */
  const onContentUnmount = () => {
    endCycle(false);
  };

  /** Emit a single “slow” event for the current cycle. */
  function emitSlow(fallbackStart: number) {
    const c = cycleRef.current;
    if (!c || c.slowEmitted) return;
    c.slowEmitted = true;

    const info: SuspenseSlowInfo = {
      id,
      timeoutMs: opts.current.timeoutMs,
      fallbackStart,
    };

    // Local callback first
    try {
      opts.current.onSlow(info);
    } catch {
      // intentionally ignore
    }

    // Telemetry
    if (opts.current.sampleRate > 0 && passSample(opts.current.sampleRate)) {
      try {
        addAction(
          opts.current.actionNames.slow || "suspense_slow",
          info as any,
          opts.current.sampleRate
        );
      } catch {
        // intentionally ignore
      }
      if (opts.current.alsoReportError) {
        try {
          addError(
            new Error(`[suspense] ${id} exceeded ${opts.current.timeoutMs}ms`),
            info as any,
            opts.current.sampleRate
          );
        } catch {
          // intentionally ignore
        }
      }
    }
  }

  /** Clear timers and close the current cycle. */
  function endCycle(clearRef: boolean) {
    const c = cycleRef.current;
    if (!c) return;
    if (c.slowTimer != null) {
      clearTimeout(c.slowTimer);
      c.slowTimer = null;
    }
    if (clearRef) cycleRef.current = null;
  }

  // Cast Suspense to any to avoid TS JSX component constraint mismatch under current TS + React 19 types.
  const S: any = Suspense as any;
  return (
    <S
      fallback={
        <FallbackSentinel
          onMount={onFallbackMount}
          onUnmount={onFallbackUnmount}
        >
          {fallback}
        </FallbackSentinel>
      }
    >
      <ContentSentinel onMount={onContentMount} onUnmount={onContentUnmount}>
        {children}
      </ContentSentinel>
    </S>
  );
}

/* ---------------------- sentinel components ---------------------- */

/** Mounts while the Suspense fallback is visible. */
function FallbackSentinel({
  onMount,
  onUnmount,
  children,
}: {
  onMount: () => void;
  onUnmount: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    onMount();
    return onUnmount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{children}</>;
}

/** Mounts when the Suspense content resolves. */
function ContentSentinel({
  onMount,
  onUnmount,
  children,
}: {
  onMount: () => void;
  onUnmount: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    onMount();
    return onUnmount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{children}</>;
}

/* ------------------------------ utils ------------------------------ */

function clampPct(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
function passSample(pct: number) {
  return Math.random() * 100 < pct;
}
function noop() {}
