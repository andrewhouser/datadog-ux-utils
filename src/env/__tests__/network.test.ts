import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mocks for datadog helpers used by network.ts
const addActionMock = vi.fn();
const addGlobalContextMock = vi.fn();
vi.mock("../../datadog", () => ({
  addAction: (...args: any[]) => addActionMock(...args),
  addGlobalContext: (...args: any[]) => addGlobalContextMock(...args),
}));

// Helper to redefine navigator.onLine before module import (baseline snapshot)
function setNavigatorOnline(val: boolean) {
  Object.defineProperty(navigator, "onLine", {
    value: val,
    configurable: true,
  });
}

// Save original onLine
const originalOnline = navigator.onLine;

// Utility to (re)load module fresh with optional connection shim
async function importFresh(connection?: any) {
  vi.resetModules();
  // Ensure mocks persist after resetModules
  addActionMock.mockClear();
  addGlobalContextMock.mockClear();
  // Attach / override experimental connection API if provided
  if (connection) {
    (navigator as any).connection = connection;
  } else {
    delete (navigator as any).connection;
  }
  return await import("../network");
}

describe("network env utilities", () => {
  afterEach(() => {
    setNavigatorOnline(originalOnline);
    delete (navigator as any).connection;
  });

  it("isConstrainedNetwork returns true when offline (baseline snapshot)", async () => {
    setNavigatorOnline(false);
    const { isConstrainedNetwork } = await importFresh();
    expect(isConstrainedNetwork()).toBe(true);
  });

  it("trackNetwork captures initial info, sets global context and emits action (sampled)", async () => {
    setNavigatorOnline(true);
    vi.spyOn(Math, "random").mockReturnValue(0); // force sampling
    const conn = {
      effectiveType: "3g",
      downlink: 0.7,
      rtt: 350,
      saveData: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const { trackNetwork, isConstrainedNetwork } = await importFresh(conn);

    const stop = trackNetwork({
      reportChanges: true,
      changeSampleRate: 100,
      constrained: { effectiveTypes: ["3g", "slow-2g", "2g"] },
    });

    // Initial apply happens synchronously
    expect(addGlobalContextMock).toHaveBeenCalledWith(
      "network_effectiveType",
      "3g"
    );
    expect(addActionMock).toHaveBeenCalledTimes(1);
    const actionArgs = addActionMock.mock.calls[0];
    expect(actionArgs[0]).toBe("network_change");
    expect(actionArgs[1]).toMatchObject({
      effectiveType: "3g",
      downlinkMbps: 0.7,
      rttMs: 350,
      saveData: true,
      constrained: true, // due to custom heuristics
    });
    expect(isConstrainedNetwork()).toBe(true);
    stop();
    (Math.random as any).mockRestore?.();
  });

  it("debounces rapid change events (single action emitted)", async () => {
    setNavigatorOnline(true);
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const changeListeners: Function[] = [];
    const conn = {
      effectiveType: "4g",
      downlink: 5,
      rtt: 50,
      addEventListener: (event: string, cb: any) => {
        if (event === "change") changeListeners.push(cb);
      },
      removeEventListener: vi.fn(),
    };
    const { trackNetwork } = await importFresh(conn);
    trackNetwork({
      reportChanges: true,
      changeSampleRate: 100,
      debounceMs: 25,
    });
    addActionMock.mockClear(); // ignore initial apply action

    // Fire several rapid changes with modified values before debounce timer flushes
    for (let i = 0; i < 5; i++) {
      conn.downlink = 5 - i * 0.5; // mutate to ensure meaningful change
      changeListeners.forEach((fn) => fn());
    }

    // Fast-forward just before debounce window ends (no action yet)
    vi.advanceTimersByTime(20);
    expect(addActionMock).toHaveBeenCalledTimes(0);

    // Advance past debounce window
    vi.advanceTimersByTime(10);
    expect(addActionMock).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
    (Math.random as any).mockRestore?.();
  });

  it("uninstall stops further actions on events", async () => {
    setNavigatorOnline(true);
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.useFakeTimers();
    const changeListeners: Function[] = [];
    const conn = {
      effectiveType: "4g",
      downlink: 10,
      rtt: 40,
      addEventListener: (event: string, cb: any) => {
        if (event === "change") changeListeners.push(cb);
      },
      removeEventListener: vi.fn(),
    };
    const { trackNetwork } = await importFresh(conn);
    const stop = trackNetwork({
      reportChanges: true,
      changeSampleRate: 100,
      debounceMs: 50,
    });
    addActionMock.mockClear(); // ignore initial apply

    // Trigger a change which would schedule a debounced action
    conn.downlink = 5;
    changeListeners.forEach((fn) => fn());

    // Immediately stop tracking (should clear pending debounce)
    stop();

    // Advance time past debounce window
    vi.advanceTimersByTime(60);
    expect(addActionMock).not.toHaveBeenCalled();

    (Math.random as any).mockRestore?.();
    vi.useRealTimers();
  });
});
