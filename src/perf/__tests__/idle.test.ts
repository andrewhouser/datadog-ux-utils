import { describe, it, expect, vi, beforeEach } from "vitest";

const addActionMock = vi.fn();
vi.mock("../../datadog", () => ({
  safeAddAction: (...args: any[]) => addActionMock(...args),
}));

async function importIdle() {
  vi.resetModules();
  return await import("../idle.ts");
}

describe("idle tracker", () => {
  beforeEach(() => {
    addActionMock.mockReset();
  });

  it("marks user idle after timeout and active again on activity", async () => {
    vi.useFakeTimers();
    const { startIdleTracker, isUserIdle } = await importIdle();
    startIdleTracker({ idleAfterMs: 100, reportToDatadog: true });
    expect(isUserIdle()).toBe(false);
    // advance just before idle
    vi.advanceTimersByTime(90);
    expect(isUserIdle()).toBe(false);
    // become idle
    vi.advanceTimersByTime(20);
    expect(isUserIdle()).toBe(true);
    // simulate activity event
    window.dispatchEvent(new Event("mousemove"));
    expect(isUserIdle()).toBe(false);
    vi.useRealTimers();
  });
});
