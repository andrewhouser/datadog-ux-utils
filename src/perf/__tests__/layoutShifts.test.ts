import { describe, it, expect, vi, beforeEach } from "vitest";

const addActionMock = vi.fn();
vi.mock("../../datadog", () => ({
  safeAddAction: (...args: any[]) => addActionMock(...args),
}));

async function importLayoutShifts() {
  vi.resetModules();
  return await import("../layoutShifts.ts");
}

describe("layoutShifts", () => {
  beforeEach(() => {
    addActionMock.mockReset();
  });

  it("accumulates CLS from layout shift entries", async () => {
    if (typeof PerformanceObserver === "undefined") {
      (globalThis as any).PerformanceObserver = class {
        callback: any;
        constructor(cb: any) {
          this.callback = cb;
        }
        observe() {
          /* noop */
        }
        disconnect() {}
      } as any;
    }
    const entries: any[] = [
      { value: 0.1, hadRecentInput: false, sources: [] },
      { value: 0.05, hadRecentInput: false, sources: [] },
      { value: 0.2, hadRecentInput: true, sources: [] }, // ignored
    ];
    (globalThis as any).PerformanceObserver = class {
      callback: any;
      constructor(cb: any) {
        this.callback = cb;
      }
      observe() {
        this.callback({ getEntries: () => entries });
      }
      disconnect() {}
    } as any;
    const { startLayoutShiftTracking, getCLSValue } =
      await importLayoutShifts();
    startLayoutShiftTracking({ reportToDatadog: true });
    expect(getCLSValue()).toBeCloseTo(0.15); // 0.1 + 0.05
  });
});
