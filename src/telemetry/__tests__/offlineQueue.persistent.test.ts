import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { installPersistentTelemetryQueue } from "../offlineQueue.persistent";

// Mock localStorage (jsdom provides) but reset between tests
let uninstallFns: Array<() => void> = [];
beforeEach(() => {
  localStorage.clear();
  uninstallFns = [];
});
afterEach(() => {
  for (const fn of uninstallFns) {
    try {
      fn();
    } catch {}
  }
  vi.useRealTimers();
});

// Provide a controllable online flag
Object.defineProperty(window.navigator, "onLine", {
  value: true,
  writable: true,
} as any);
function setOnline(v: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    value: v,
    writable: true,
  } as any);
}

// Mock datadog senders wiring
function wireSenders(actionFn = vi.fn(), errorFn = vi.fn()) {
  (globalThis as any).__DD_SEND_ACTION__ = actionFn;
  (globalThis as any).__DD_SEND_ERROR__ = errorFn;
  return { actionFn, errorFn };
}

describe("persistent offline queue", () => {
  it("queues while offline and flushes when online & senders present", async () => {
    setOnline(false);
    const { actionFn, errorFn } = wireSenders();
    uninstallFns.push(
      installPersistentTelemetryQueue({
        storageKey: "tq",
        maxBuffered: 10,
        flushOnInit: false,
        writeDebounceMs: 10,
      })
    );

    (globalThis as any).__DD_ENQUEUE_ACTION__("act1", { a: 1 }, 100);
    (globalThis as any).__DD_ENQUEUE_ERROR__(new Error("x"), { e: 1 }, 50);

    expect(actionFn).not.toHaveBeenCalled();
    expect(errorFn).not.toHaveBeenCalled();
    // allow debounce write
    await new Promise((r) => setTimeout(r, 20));
    expect(localStorage.getItem("tq")).toContain("act1");

    setOnline(true);
    window.dispatchEvent(new Event("online"));
    expect(actionFn).toHaveBeenCalled();
    expect(errorFn).toHaveBeenCalled();
  });

  it("loads existing events from storage and flushes on init when flushOnInit=true", async () => {
    localStorage.setItem(
      "seed",
      JSON.stringify([{ t: "a", n: "seedAct", ts: Date.now() }])
    );
    setOnline(true);
    const { actionFn, errorFn } = wireSenders();
    uninstallFns.push(
      installPersistentTelemetryQueue({ storageKey: "seed", flushOnInit: true })
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(actionFn.mock.calls.map((c) => c[0])).toContain("seedAct");
    expect(errorFn).not.toHaveBeenCalled();
  });

  it("trims to maxBuffered and byteCap", async () => {
    vi.useFakeTimers();
    setOnline(false);
    wireSenders();
    uninstallFns.push(
      installPersistentTelemetryQueue({
        storageKey: "trim",
        maxBuffered: 5,
        flushOnInit: false,
        byteCap: 200,
        writeDebounceMs: 20,
      })
    );
    for (let i = 0; i < 20; i++) {
      (globalThis as any).__DD_ENQUEUE_ACTION__("a" + i, { i }, 1);
      vi.advanceTimersByTime(1);
    }
    // allow debounce write
    vi.advanceTimersByTime(25);
    const raw = localStorage.getItem("trim");
    expect(raw).toBeTruthy();
    const arr = JSON.parse(raw!);
    expect(arr.length).toBeLessThanOrEqual(5);
    // timers restored in afterEach
  });
});
