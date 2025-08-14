import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiRateGuard } from "../rateGuard";

vi.mock("../../flags", () => ({ getFlags: () => ({ guardEnabled: true }) }));

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ status: 200 }) as any;
});

describe("ApiRateGuard", () => {
  it("allows requests under limit", async () => {
    const guard = new ApiRateGuard({ windowMs: 100, maxRequests: 2 });
    const url = "https://example.com/a";
    await expect(guard.guardFetch(url)).resolves.not.toThrow();
    await expect(guard.guardFetch(url)).resolves.not.toThrow();
  });

  it("blocks requests over limit", async () => {
    const guard = new ApiRateGuard({ windowMs: 100, maxRequests: 1 });
    const url = "https://example.com/block";
    await guard.guardFetch(url);
    await expect(guard.guardFetch(url)).rejects.toThrow();
  });

  it("queues requests if strategy is queue", async () => {
    const guard = new ApiRateGuard({
      windowMs: 50,
      maxRequests: 1,
      overflowStrategy: "queue",
    });
    const testUrl = "https://example.com/queue";
    await guard.guardFetch(testUrl);
    const p = guard.guardFetch(testUrl);
    await expect(p).resolves.not.toThrow();
  });
});
