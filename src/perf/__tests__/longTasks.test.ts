import { describe, it, expect, vi, beforeEach } from "vitest";

const addActionMock = vi.fn();
vi.mock("@datadog/browser-rum", () => ({
  datadogRum: { addAction: (...a: any[]) => addActionMock(...a) },
}));

let testCfg: any = { captureLongTasks: true, actionSampleRate: 100 };
vi.mock("../../config", () => ({ getUxConfig: () => testCfg }));

async function importLongTasks() {
  vi.resetModules();
  return await import("../longTasks.ts");
}

describe("longTasks observer", () => {
  beforeEach(() => {
    addActionMock.mockReset();
  });

  it("reports long tasks above 100ms", async () => {
    const entries: any[] = [
      { name: "task1", duration: 50, startTime: 10 },
      { name: "task2", duration: 150, startTime: 20 },
    ];
    (globalThis as any).PerformanceObserver = class {
      cb: any;
      constructor(cb: any) {
        this.cb = cb;
      }
      observe() {
        this.cb({ getEntries: () => entries });
      }
      disconnect() {}
    };
    (globalThis as any).window = globalThis as any; // ensure window exists
    const { startLongTaskObserver } = await importLongTasks();
    startLongTaskObserver();
    expect(addActionMock).toHaveBeenCalledTimes(1);
    const call = addActionMock.mock.calls[0];
    expect(call[0]).toBe("long_task");
    expect(call[1]).toMatchObject({ name: "task2", duration_ms: 150 });
  });
});
