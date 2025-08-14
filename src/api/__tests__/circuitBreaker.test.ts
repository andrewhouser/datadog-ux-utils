import { describe, it, expect, vi } from "vitest";
import { wrapWithBreaker } from "../circuitBreaker";

vi.mock("../datadog", () => ({ addAction: vi.fn() }));

const isApiCircuitOpenError = (e: unknown) =>
  e instanceof Error && e.name === "ApiCircuitOpenError";

describe("wrapWithBreaker", () => {
  it("returns result when closed", async () => {
    const res = await wrapWithBreaker("ok-key", () => Promise.resolve("ok"));
    expect(res).toBe("ok");
  });

  it("opens after failures and blocks", async () => {
    const cfg = { failureThreshold: 2, cooldownMs: 200 } as const;
    const fail = () => Promise.reject("fail");
    await expect(wrapWithBreaker("open-key", fail, cfg)).rejects.toEqual(
      "fail"
    );
    await expect(wrapWithBreaker("open-key", fail, cfg)).rejects.toEqual(
      "fail"
    );
    await expect(
      wrapWithBreaker("open-key", () => Promise.resolve("blocked"), cfg)
    ).rejects.toSatisfy(isApiCircuitOpenError);
  });

  it("half-opens after cooldown", async () => {
    const cfg = { failureThreshold: 2, cooldownMs: 50 } as const;
    const fail = () => Promise.reject("fail");
    await expect(wrapWithBreaker("half-key", fail, cfg)).rejects.toEqual(
      "fail"
    );
    await expect(wrapWithBreaker("half-key", fail, cfg)).rejects.toEqual(
      "fail"
    );
    await expect(
      wrapWithBreaker("half-key", () => Promise.resolve("blocked"), cfg)
    ).rejects.toSatisfy(isApiCircuitOpenError);
    // wait for cooldown to elapse so breaker enters half-open then closed on success
    await new Promise((r) => setTimeout(r, 60));
    await expect(
      wrapWithBreaker("half-key", () => Promise.resolve("half"), cfg)
    ).resolves.toBe("half");
  });
});
