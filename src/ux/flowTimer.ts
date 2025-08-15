/**
 * @file flowTimer.ts
 * @description Tracks user flows and timing for analytics and diagnostics, reporting start, end, and error events to telemetry.
 */
import { addAction, addError } from "../datadog.ts";

/**
 * Internal representation of a flow timer instance.
 */
type FlowInstance = {
  /** Name of the flow (e.g., "checkout", "search_to_results") */
  name: string;
  /** Start timestamp (ms since navigation start) */
  start: number;
  /** Context object included in all events for this flow */
  context: Record<string, unknown>;
  /** Whether the flow has ended or failed */
  ended: boolean;
};

/**
 * Map of active flow instances by their unique ID.
 */
const activeFlows = new Map<string, FlowInstance>();

/**
 * Starts a flow timer for a named user or app flow (e.g., "checkout", "search_to_results").
 * Returns an object with `end()` and `fail()` methods to mark completion or failure.
 *
 * @param name - A unique name for this flow type (e.g., "checkout", "search_to_results")
 * @param ctx - Optional initial context to include in all events for this flow
 * @returns An object with `end()` and `fail()` methods
 *
 * @example
 * ```ts
 * const flow = startFlow("checkout", { userId });
 * // ... user completes checkout
 * flow.end({ orderId });
 * // or, on error:
 * flow.fail(new Error("Payment failed"), { step: "payment" });
 * ```
 */
export function startFlow(name: string, ctx: Record<string, unknown> = {}) {
  const id = genId();
  const inst: FlowInstance = {
    name,
    start: performance.now(),
    context: { ...ctx, flow_id: id },
    ended: false,
  };
  activeFlows.set(id, inst);

  // Send breadcrumb for start
  addAction("flow_start", { name, ...inst.context });

  return {
    /**
     * Ends the flow successfully and sends a `flow_end` action.
     *
     * @param extra - Optional extra context to include in the event
     * @example
     * flow.end({ orderId });
     */
    end(extra?: Record<string, unknown>) {
      if (inst.ended) return;
      inst.ended = true;
      activeFlows.delete(id);
      const duration = Math.round(performance.now() - inst.start);
      addAction("flow_end", {
        name,
        duration_ms: duration,
        ...inst.context,
        ...extra,
      });
    },

    /**
     * Marks the flow as failed and sends a `flow_fail` action and error telemetry.
     *
     * @param err - The error or reason for failure
     * @param extra - Optional extra context to include in the event
     * @example
     * flow.fail(new Error("Payment failed"), { step: "payment" });
     */
    fail(err: unknown, extra?: Record<string, unknown>) {
      if (inst.ended) return;
      inst.ended = true;
      activeFlows.delete(id);
      const duration = Math.round(performance.now() - inst.start);
      addAction("flow_fail", {
        name,
        duration_ms: duration,
        ...inst.context,
        ...extra,
      });
      addError(err, { flow: name, ...inst.context, ...extra });
    },
  };
}

/**
 * Force-end all active flows, e.g., on route change or app teardown.
 * Sends a `flow_cancel` action for each active flow.
 *
 * @param reason - Reason for cancellation (default: "cancelled")
 *
 * @example
 * cancelAllFlows("route_change");
 */
export function cancelAllFlows(reason = "cancelled") {
  const now = performance.now();
  for (const [id, inst] of activeFlows.entries()) {
    activeFlows.delete(id);
    if (!inst.ended) {
      addAction("flow_cancel", {
        name: inst.name,
        duration_ms: Math.round(now - inst.start),
        ...inst.context,
        reason,
      });
    }
  }
}

/**
 * Generates a random flow ID.
 */
function genId() {
  return Math.random().toString(36).slice(2, 10);
}
