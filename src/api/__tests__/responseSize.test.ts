import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config", () => ({
  getUxConfig: () => ({ captureResponseSize: true, apiLargeKb: 0 }),
}));
vi.mock("@datadog/browser-rum", () => ({
  datadogRum: { addAction: vi.fn() },
}));

let withResponseSizeCheck: any;
let datadogRum: any;

beforeEach(async () => {
  vi.resetModules();
  ({ withResponseSizeCheck } = await import("../responseSize.ts"));
  ({ datadogRum } = await import("@datadog/browser-rum"));
  datadogRum.addAction.mockClear();
});

describe("withResponseSizeCheck", () => {
  it("returns response unchanged", async () => {
    const resp = new Response("x".repeat(2048), {
      status: 200,
      headers: { "content-length": "2048" },
    });
    const result = await withResponseSizeCheck(resp, "url");
    expect(result).toBe(resp);
  });

  it("calls addAction for large payload", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const body = new Uint8Array(2048);
    const resp = new Response(body, {
      status: 200,
      headers: { "content-length": "2048" },
    });
    await withResponseSizeCheck(resp, "url");
    expect(datadogRum.addAction).toHaveBeenCalledWith(
      "api_large_payload",
      expect.objectContaining({ url: "url", size_kb: 2 })
    );
    (Math.random as any).mockRestore?.();
  });

  it("handles missing content-length", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const body = new Uint8Array(2048);
    const resp = new Response(body, { status: 200 });
    await withResponseSizeCheck(resp, "url");
    expect(datadogRum.addAction).toHaveBeenCalledWith(
      "api_large_payload",
      expect.objectContaining({ size_kb: 2 })
    );
    (Math.random as any).mockRestore?.();
  });
});
