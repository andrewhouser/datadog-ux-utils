import { describe, it, expect, vi, beforeEach } from "vitest";

const addActionMock = vi.fn();
vi.mock("@datadog/browser-rum", () => ({
  datadogRum: { addAction: (...a: any[]) => addActionMock(...a) },
}));
let testCfg: any = { actionSampleRate: 100 };
vi.mock("../../config", () => ({ getUxConfig: () => testCfg }));

async function importResources() {
  vi.resetModules();
  return await import("../resources.ts");
}

describe("resources perf reporting", () => {
  beforeEach(() => {
    addActionMock.mockReset();
  });

  it("reports large and slow resources", async () => {
    (performance as any).getEntriesByType = (type: string) => {
      if (type !== "resource") return [];
      return [
        {
          name: "https://cdn.example.com/large.js",
          transferSize: 400 * 1024,
          duration: 1500,
          initiatorType: "script",
        },
        {
          name: "https://cdn.example.com/slow.css",
          transferSize: 10 * 1024,
          duration: 3000,
          initiatorType: "link",
        },
        {
          name: "data:abc",
          transferSize: 5,
          duration: 50,
          initiatorType: "img",
        },
      ];
    };
    const { reportLargeOrSlowResources } = await importResources();
    vi.spyOn(Math, "random").mockReturnValue(0); // force sampling
    reportLargeOrSlowResources({
      sizeKbThreshold: 250,
      durationMsThreshold: 2000,
      sampleRate: 100,
    });
    expect(addActionMock).toHaveBeenCalledTimes(2);
    const urls = addActionMock.mock.calls.map((c) => c[1].url).sort();
    expect(urls).toEqual([
      "https://cdn.example.com/large.js",
      "https://cdn.example.com/slow.css",
    ]);
    (Math.random as any).mockRestore?.();
  });
});
