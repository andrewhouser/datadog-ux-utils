import { describe, it, expect, vi, beforeEach } from "vitest";

const addActionMock = vi.fn();
vi.mock("@datadog/browser-rum", () => ({
  datadogRum: { addAction: (...a: any[]) => addActionMock(...a) },
}));
let testCfg: any = { captureWebVitals: true };
vi.mock("../../config", () => ({ getUxConfig: () => testCfg }));

// Mock web-vitals exports
vi.mock("web-vitals", () => ({
  onCLS: (cb: any) => cb({ value: 0.05 }),
  onFCP: (cb: any) => cb({ value: 100 }),
  onLCP: (cb: any) =>
    cb({ value: 2500, entries: [{ element: { tagName: "IMG" } }] }),
  onINP: (cb: any) => cb({ value: 180 }),
  onTTFB: (cb: any) => cb({ value: 50 }),
}));

async function importWebVitals() {
  vi.resetModules();
  return await import("../webVitals");
}

describe("webVitals", () => {
  beforeEach(() => {
    addActionMock.mockReset();
  });

  it("registers and sends vitals when enabled", async () => {
    const { registerWebVitals } = await importWebVitals();
    registerWebVitals();
    expect(addActionMock).toHaveBeenCalled();
    const names = addActionMock.mock.calls.map((c) => c[1].name).sort();
    expect(names).toEqual(["CLS", "FCP", "INP", "LCP", "TTFB"]);
  });

  it("no-op when disabled", async () => {
    testCfg.captureWebVitals = false;
    const { registerWebVitals } = await importWebVitals();
    registerWebVitals();
    expect(addActionMock).not.toHaveBeenCalled();
  });
});
