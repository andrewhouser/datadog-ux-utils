import { describe, it, expect, vi, beforeEach } from "vitest";

const addActionMock = vi.fn();
vi.mock("../../datadog", () => ({
  safeAddAction: (...a: any[]) => addActionMock(...a),
}));

async function importPeak() {
  vi.resetModules();
  return await import("../memoryPeak");
}

describe("memoryPeak", () => {
  beforeEach(() => {
    addActionMock.mockReset();
  });

  it("records peak and reports on manual call", async () => {
    (performance as any).memory = {
      usedJSHeapSize: 11,
      totalJSHeapSize: 22,
      jsHeapSizeLimit: 33,
    };
    const { startMemoryPeakTracking, reportMemoryPeak, getMemoryPeak } =
      await importPeak();
    startMemoryPeakTracking({ mode: "manual", reportToDatadog: true });
    expect(getMemoryPeak()).not.toBeNull();
    reportMemoryPeak();
    expect(addActionMock).toHaveBeenCalledTimes(1);
  });

  it("resetMemoryPeak clears recorded peak", async () => {
    (performance as any).memory = {
      usedJSHeapSize: 5,
      totalJSHeapSize: 10,
      jsHeapSizeLimit: 15,
    };
    const { startMemoryPeakTracking, resetMemoryPeak, getMemoryPeak } =
      await importPeak();
    startMemoryPeakTracking({ mode: "manual" });
    expect(getMemoryPeak()).not.toBeNull();
    resetMemoryPeak();
    expect(getMemoryPeak()).toBeNull();
  });
});
