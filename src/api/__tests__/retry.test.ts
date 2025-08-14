import { describe, it, expect, vi } from "vitest";
import { retry } from "../retry";

vi.mock("../datadog", () => ({ addAction: vi.fn(), addError: vi.fn() }));

describe("retry", () => {
  it("returns result on first try", async () => {
    const result = await retry("label", () => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("retries on failure", async () => {
    let count = 0;
    const op = () =>
      ++count < 3 ? Promise.reject("fail") : Promise.resolve("ok");
    const result = await retry("label", op, {
      retries: 5,
      baseMs: 1,
      jitter: false,
    });
    expect(result).toBe("ok");
    expect(count).toBe(3);
  });

  it("throws after all retries fail", async () => {
    const op = () => Promise.reject("fail");
    await expect(
      retry("label", op, { retries: 2, baseMs: 1, jitter: false })
    ).rejects.toBe("fail");
  });

  it("respects shouldRetry predicate", async () => {
    let count = 0;
    const op = () => {
      count++;
      return Promise.reject("fail");
    };
    const shouldRetry = (err: unknown, attempt: number) => attempt < 1;
    await expect(
      retry("label", op, { retries: 2, baseMs: 1, shouldRetry, jitter: false })
    ).rejects.toBe("fail");
    expect(count).toBe(2); // Called twice: first attempt and one retry
  });
});
