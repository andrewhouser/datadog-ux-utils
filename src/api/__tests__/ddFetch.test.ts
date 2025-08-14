import { describe, it, expect, vi, beforeEach } from "vitest";
// Mock dependencies BEFORE importing module under test
let testCfg: any = { apiSlowMs: 0, actionSampleRate: 100 };
vi.mock("../../config", () => ({
  getUxConfig: () => testCfg,
  __setUxTestConfig: (c: any) => (testCfg = { ...testCfg, ...c }),
}));
const ddRumActions: any[] = [];
vi.mock("@datadog/browser-rum", () => ({
  datadogRum: {
    addAction: vi.fn((name: string, attrs: any) =>
      ddRumActions.push([name, attrs])
    ),
    addError: vi.fn(),
  },
}));

import { ddFetch, timePromise } from "../ddFetch";
// bring in test config setter
// @ts-ignore
import { __setUxTestConfig } from "../../config";
import { datadogRum } from "@datadog/browser-rum";
// Silence console noise
vi.spyOn(console, "error").mockImplementation(() => {});

describe("ddFetch", () => {
  beforeEach(() => {
    (datadogRum.addAction as any).mockClear();
    __setUxTestConfig({ apiSlowMs: 0, actionSampleRate: 100 });
  });
  it("returns fetch response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200 });
    const resp = await ddFetch("https://test", { method: "GET" });
    expect(resp.status).toBe(200);
  });

  it("calls addAction for slow requests", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // ensure sampling
    global.fetch = vi.fn().mockResolvedValue({ status: 200 });
    await ddFetch("https://slow", { method: "POST" });
    expect(datadogRum.addAction).toHaveBeenCalledWith(
      "api_slow",
      expect.objectContaining({
        url: "https://slow",
        method: "POST",
        status: 200,
      })
    );
    (Math.random as any).mockRestore?.();
  });

  it("calls addError on fetch error", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("fail"));
    await expect(ddFetch("https://fail")).rejects.toThrow("fail");
    expect(datadogRum.addError).toHaveBeenCalled();
  });
});

describe("timePromise", () => {
  beforeEach(() => {
    (datadogRum.addAction as any).mockClear();
    __setUxTestConfig({ apiSlowMs: 0, actionSampleRate: 100 });
  });
  it("returns resolved value", async () => {
    const result = await timePromise("test", Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("calls addAction for slow promise", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    await timePromise("slow", Promise.resolve("done"));
    expect(datadogRum.addAction).toHaveBeenCalledWith(
      "promise_slow",
      expect.objectContaining({
        label: "slow",
        duration_ms: expect.any(Number),
      })
    );
    (Math.random as any).mockRestore?.();
  });

  it("calls addError on promise rejection", async () => {
    await expect(
      timePromise("fail", Promise.reject(new Error("fail")))
    ).rejects.toThrow("fail");
    expect(datadogRum.addError).toHaveBeenCalled();
  });
});
