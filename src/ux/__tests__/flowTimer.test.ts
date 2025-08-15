import { describe, it, expect, vi, beforeEach } from "vitest";
import { startFlow, cancelAllFlows } from "../flowTimer.ts";

const addActionMock = vi.fn();
const addErrorMock = vi.fn();
vi.mock("../../datadog", () => ({
  addAction: (...a: any[]) => addActionMock(...a),
  addError: (...a: any[]) => addErrorMock(...a),
}));

function mockPerfSequence(increments: number[]) {
  let idx = -1;
  vi.spyOn(performance, "now").mockImplementation(() => {
    idx = Math.min(idx + 1, increments.length - 1);
    return increments[idx];
  });
}

describe("flowTimer", () => {
  beforeEach(() => {
    addActionMock.mockReset();
    addErrorMock.mockReset();
    vi.restoreAllMocks();
  });

  it("starts and ends a flow emitting start and end actions with duration", () => {
    mockPerfSequence([0, 250]);
    const flow = startFlow("checkout", { user: 1 });
    flow.end({ orderId: 9 });
    const names = addActionMock.mock.calls.map((c) => c[0]);
    expect(names).toEqual(["flow_start", "flow_end"]);
    const endPayload = addActionMock.mock.calls[1][1];
    expect(endPayload).toMatchObject({ name: "checkout", orderId: 9 });
    expect(endPayload.duration_ms).toBe(250);
  });

  it("fails a flow emitting flow_fail and error", () => {
    mockPerfSequence([10, 70]);
    const flow = startFlow("search");
    const err = new Error("boom");
    flow.fail(err, { step: "results" });
    const actionNames = addActionMock.mock.calls.map((c) => c[0]);
    expect(actionNames).toEqual(["flow_start", "flow_fail"]);
    expect(addErrorMock).toHaveBeenCalled();
    const failPayload = addActionMock.mock.calls[1][1];
    expect(failPayload).toMatchObject({ name: "search", step: "results" });
  });

  it("cancelAllFlows emits flow_cancel for active flows only", () => {
    mockPerfSequence([0, 20, 40, 60]);
    const a = startFlow("A");
    const b = startFlow("B");
    a.end(); // ended so should not cancel
    cancelAllFlows("route_change");
    const names = addActionMock.mock.calls.map((c) => c[0]);
    // Expect: start A, start B, end A, cancel B
    expect(names).toEqual([
      "flow_start",
      "flow_start",
      "flow_end",
      "flow_cancel",
    ]);
    const cancelPayload = addActionMock.mock.calls.find(
      (c) => c[0] === "flow_cancel"
    )?.[1];
    expect(cancelPayload).toMatchObject({ name: "B", reason: "route_change" });
  });

  it("end or fail is idempotent", () => {
    mockPerfSequence([0, 30, 60]);
    const flow = startFlow("idempotent");
    flow.end();
    flow.end();
    flow.fail(new Error("later"));
    const names = addActionMock.mock.calls.map((c) => c[0]);
    expect(names.filter((n) => n === "flow_end").length).toBe(1);
    expect(names).not.toContain("flow_fail");
    expect(addErrorMock).not.toHaveBeenCalled();
  });
});
