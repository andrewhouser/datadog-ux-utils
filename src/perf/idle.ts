/**
 * @file idle.ts
 * @description Tracks user idle/active state in the browser. Useful for:
 * - Detecting long periods of inactivity to pause expensive operations.
 * - Reporting idle sessions to Datadog for UX metrics.
 * - Automatically logging out users after inactivity.
 *
 * This uses `mousemove`, `keydown`, and visibility changes to detect activity.
 */

import { safeAddAction } from "../datadog.ts";

/**
 * Configuration options for idle tracking.
 */
export interface IdleTrackerOptions {
  /**
   * Time in milliseconds before the user is considered idle.
   * @default 60000 (1 minute)
   */
  idleAfterMs?: number;

  /**
   * Whether to automatically send an action to Datadog when idle/active state changes.
   * @default true
   */
  reportToDatadog?: boolean;

  /**
   * Optional callback fired when the idle state changes.
   * @param isIdle - `true` if the user is now idle, `false` if active.
   */
  onChange?: (isIdle: boolean) => void;
}

let _idleTimeout: ReturnType<typeof setTimeout> | null = null;
let _isIdle = false;
let _opts: Required<IdleTrackerOptions>;

/**
 * Starts tracking user idle state.
 *
 * @param opts - Idle tracking configuration.
 * @returns A function to stop idle tracking.
 *
 * @example
 * ```ts
 * import { startIdleTracker } from "datadog-ux-utils/idle";
 *
 * const stop = startIdleTracker({
 *   idleAfterMs: 2 * 60 * 1000, // 2 minutes
 *   onChange: (isIdle) => {
 *     console.log(isIdle ? "User is idle" : "User is active");
 *   },
 * });
 *
 * // Later, if you want to stop tracking:
 * stop();
 * ```
 */
export function startIdleTracker(opts: IdleTrackerOptions = {}): () => void {
  _opts = {
    idleAfterMs: opts.idleAfterMs ?? 60_000,
    reportToDatadog: opts.reportToDatadog ?? true,
    onChange: opts.onChange ?? (() => {}),
  };

  const resetIdleTimer = () => {
    if (_isIdle) {
      _isIdle = false;
      _opts.onChange(false);
      if (_opts.reportToDatadog) {
        safeAddAction("user_active");
      }
    }

    if (_idleTimeout) {
      clearTimeout(_idleTimeout);
    }

    _idleTimeout = setTimeout(() => {
      _isIdle = true;
      _opts.onChange(true);
      if (_opts.reportToDatadog) {
        safeAddAction("user_idle", { idleAfterMs: _opts.idleAfterMs });
      }
    }, _opts.idleAfterMs);
  };

  const activityEvents = ["mousemove", "keydown", "mousedown", "touchstart"];
  activityEvents.forEach((event) =>
    window.addEventListener(event, resetIdleTimer, { passive: true })
  );
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      resetIdleTimer();
    }
  });

  // Kick off initial timer
  resetIdleTimer();

  return () => {
    if (_idleTimeout) {
      clearTimeout(_idleTimeout);
      _idleTimeout = null;
    }
    activityEvents.forEach((event) =>
      window.removeEventListener(event, resetIdleTimer)
    );
    document.removeEventListener("visibilitychange", resetIdleTimer);
  };
}

/**
 * Returns whether the user is currently considered idle.
 *
 * @example
 * ```ts
 * import { isUserIdle } from "datadog-ux-utils/idle";
 * console.log("Is idle?", isUserIdle());
 * ```
 */
export function isUserIdle(): boolean {
  return _isIdle;
}
