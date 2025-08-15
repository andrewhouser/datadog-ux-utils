import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { installTelemetryQueue } from "../offlineQueue.ts";

// Provide a controllable online flag
Object.defineProperty(window.navigator, "onLine", {
  value: true,
  writable: true,
} as any);

const addActionReal = vi.fn();
const addErrorReal = vi.fn();
vi.mock("../../datadog", () => ({
  addAction: (...a: any[]) => addActionReal(...a),
  addError: (...a: any[]) => addErrorReal(...a),
}));

function setOnline(v: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    value: v,
    writable: true,
  } as any);
}

describe("offlineQueue (in-memory)", () => {
  let uninstallFns: Array<() => void> = [];
  beforeEach(() => {
    addActionReal.mockReset();
    addErrorReal.mockReset();
    uninstallFns = [];
  });
  afterEach(() => {
    uninstallFns.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  });

  it("passes through when online", () => {
    setOnline(true);
    const uninstall = installTelemetryQueue();
    uninstallFns.push(uninstall);
    (globalThis as any).addAction("event_one", { a: 1 }, 100);
    expect(addActionReal).toHaveBeenCalledWith("event_one", { a: 1 }, 100);
    uninstall();
  });

  it("queues while offline then flushes on online event", () => {
    setOnline(false);
    const uninstall = installTelemetryQueue(10);
    uninstallFns.push(uninstall);
    (globalThis as any).addAction("queued_action", { q: 1 }, 50);
    (globalThis as any).addError(new Error("boom"), { ctx: true }, 80);
    expect(addActionReal).not.toHaveBeenCalled();
    expect(addErrorReal).not.toHaveBeenCalled();

    setOnline(true);
    window.dispatchEvent(new Event("online"));

    expect(addActionReal).toHaveBeenCalledWith("queued_action", { q: 1 }, 50);
    expect(addErrorReal).toHaveBeenCalled();
    uninstall();
  });

  it("respects max buffer dropping oldest", () => {
    setOnline(false);
    const uninstall = installTelemetryQueue(3);
    uninstallFns.push(uninstall);
    (globalThis as any).addAction("a1");
    (globalThis as any).addAction("a2");
    (globalThis as any).addAction("a3");
    (globalThis as any).addAction("a4"); // should evict a1
    setOnline(true);
    window.dispatchEvent(new Event("online"));
    const sent = addActionReal.mock.calls.map((c) => c[0]);
    expect(sent).not.toContain("a1");
    expect(sent).toEqual(expect.arrayContaining(["a2", "a3", "a4"]));
    uninstall();
  });
});
