import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGuardedCall } from "../useGuardedCall.ts";

describe("useGuardedCall", () => {
  it("calls guard.guard and returns value", async () => {
    const guard = {
      guard: vi
        .fn()
        .mockImplementation(async (_key: string, call: any) => call()),
    } as any;
    const { result } = renderHook(() => useGuardedCall(guard));
    let value: number | undefined;
    await act(async () => {
      value = await result.current("x", async () => 42);
    });
    expect(value).toBe(42);
    expect(guard.guard).toHaveBeenCalledWith("x", expect.any(Function));
  });
});
