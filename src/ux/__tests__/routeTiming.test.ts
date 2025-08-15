import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { hookRouter } from "../routeTiming.ts";

const addActionMock = vi.fn();
vi.mock("../../datadog", () => ({
  addAction: (...a: any[]) => addActionMock(...a),
}));

let route = "/home";
const getRoute = () => route;

// Update the route var BEFORE calling pushState so the listener sees the new route.
function push(path: string) {
  route = path;
  history.pushState({}, "", path);
}

describe("routeTiming", () => {
  let unhook: (() => void) | null = null;
  beforeEach(() => {
    addActionMock.mockReset();
    route = "/home";
  });
  afterEach(() => {
    if (unhook) {
      unhook();
      unhook = null;
    }
  });

  it("emits route_change_timing on pushState", () => {
    vi.useFakeTimers();
    // mock perf.now sequence (t0=0 at hook, duration calc uses 120 - 0)
    const times = [0, 120, 200];
    let idx = -1;
    vi.spyOn(performance, "now").mockImplementation(() => {
      idx = Math.min(idx + 1, times.length - 1);
      return times[idx];
    });

    // mock resource entries (simulate script loads between routes)
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      {
        responseEnd: 50,
        initiatorType: "script",
        transferSize: 40 * 1024,
      } as any,
      {
        responseEnd: 150,
        initiatorType: "script",
        transferSize: 60 * 1024,
      } as any,
    ]);

    unhook = hookRouter(getRoute);

    // Advance timers so the interval collects resource sizes before route change
    vi.advanceTimersByTime(200);

    push("/dashboard");

    const call = addActionMock.mock.calls.find(
      (c) => c[0] === "route_change_timing"
    );
    expect(call).toBeTruthy();
    const payload = call![1];
    expect(payload).toMatchObject({ from: "/home", to: "/dashboard" });
    expect(payload.duration_ms).toBe(120); // second perf.now - initial
    expect(payload.largest_chunk_kb).toBe(60); // largest script transfer

    vi.useRealTimers();
  });
});
