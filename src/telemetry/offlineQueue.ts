import {
  addAction as realAddAction,
  addError as realAddError,
} from "../datadog";

type QueuedAction = {
  type: "action" | "error";
  name?: string; // only for type=action
  attrs?: Record<string, unknown>;
  err?: unknown; // only for type=error
  context?: Record<string, unknown>;
  sampleRate?: number;
};

let queue: QueuedAction[] = [];
let maxBuffered = 200;
let installed = false;

/**
 * Wraps addAction/addError so that they queue events when offline and flush on reconnect.
 * @param maxBufferedEvents - Max number of events to keep in memory while offline.
 * @returns A cleanup function to uninstall the queue wrapper.
 */
export function installTelemetryQueue(maxBufferedEvents = 200) {
  if (installed) return uninstall;
  installed = true;
  maxBuffered = maxBufferedEvents;

  // Monkey-patch our telemetry functions
  (globalThis as any).__dd_addAction = realAddAction;
  (globalThis as any).__dd_addError = realAddError;

  (globalThis as any).addAction = function (
    name: string,
    attrs?: Record<string, unknown>,
    sampleRate?: number
  ) {
    if (navigator.onLine) {
      realAddAction(name, attrs, sampleRate);
    } else {
      enqueue({ type: "action", name, attrs, sampleRate });
    }
  };

  (globalThis as any).addError = function (
    err: unknown,
    context?: Record<string, unknown>,
    sampleRate?: number
  ) {
    if (navigator.onLine) {
      realAddError(err, context, sampleRate);
    } else {
      enqueue({ type: "error", err, context, sampleRate });
    }
  };

  window.addEventListener("online", flushQueue);

  return uninstall;
}

/** Uninstalls the queue wrapper and restores original addAction/addError. */
function uninstall() {
  if (!installed) return;
  installed = false;
  (globalThis as any).addAction = (globalThis as any).__dd_addAction;
  (globalThis as any).addError = (globalThis as any).__dd_addError;
  window.removeEventListener("online", flushQueue);
  queue = [];
}

function enqueue(ev: QueuedAction) {
  if (queue.length >= maxBuffered) {
    queue.shift(); // drop oldest
  }
  queue.push(ev);
}

function flushQueue() {
  if (!navigator.onLine || !queue.length) return;
  const toFlush = queue.slice();
  queue = [];

  for (const ev of toFlush) {
    if (ev.type === "action") {
      realAddAction(ev.name!, ev.attrs, ev.sampleRate);
    } else {
      realAddError(ev.err, ev.context, ev.sampleRate);
    }
  }
}

/**
 * Example usage:
import { installTelemetryQueue } from "dd-ux-utils/telemetry/offlineQueue";

installTelemetryQueue(300); // keep up to 300 events while offline
*/
