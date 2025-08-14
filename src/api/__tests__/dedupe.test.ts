import { describe, it, expect, vi, beforeEach } from "vitest";
import { dedupe } from "../dedupe";

vi.mock("../datadog", () => ({ addAction: vi.fn() }));

beforeEach(() => {
  // Clear inFlight cache between tests
  // @ts-ignore
  import("../dedupe").then((mod) => mod["inFlight"]?.clear?.());
});

describe("dedupe", () => {
  it("deduplicates concurrent calls", async () => {
    let count = 0;
    const op = () => Promise.resolve(++count);
    const [a, b] = await Promise.all([dedupe("key", op), dedupe("key", op)]);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("caches result for ttl", async () => {
    let count = 0;
    const op = () => Promise.resolve(++count);
    const first = await dedupe("cache", op, 50);
    expect(first).toBe(1);
    const second = await dedupe("cache", op, 50);
    expect(second).toBe(1);
    await new Promise((r) => setTimeout(r, 60));
    const third = await dedupe("cache", op, 50);
    expect(third).toBe(2);
  });

  it("supports options object", async () => {
    let count = 0;
    const op = () => Promise.resolve(++count);
    const result = await dedupe("opt", op, { ttlMs: 10, report: true });
    expect(result).toBe(1);
  });
});
