import { describe, it, expect, vi, beforeEach } from "vitest";

const addActionMock = vi.fn();
vi.mock("../../datadog", () => ({
  safeAddAction: (...a: any[]) => addActionMock(...a),
}));

async function importMemory() {
  vi.resetModules();
  return await import("../memory");
}

describe("memory tracking", () => {
  beforeEach(() => {
    addActionMock.mockReset();
  });

  it("polls memory and reports metrics when supported", async () => {
    (performance as any).memory = {
      usedJSHeapSize: 10,
      totalJSHeapSize: 20,
      jsHeapSizeLimit: 30,
    };
    vi.useFakeTimers();
    const { startMemoryTracking, stopMemoryTracking } = await importMemory();
    startMemoryTracking({ intervalMs: 100, reportToDatadog: true });
    vi.advanceTimersByTime(250); // a couple intervals
    expect(addActionMock).toHaveBeenCalled();
    stopMemoryTracking();
    vi.useRealTimers();
  });

  it("returns null when unsupported", async () => {
    delete (performance as any).memory;
    const { getMemoryUsage } = await importMemory();
    expect(getMemoryUsage()).toBeNull();
  });
});
