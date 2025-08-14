import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGuardedFetch } from "../useGuardFetch";

describe("useGuardedFetch", () => {
  it("delegates to guard.guardFetch", async () => {
    const guard = {
      guardFetch: vi.fn().mockResolvedValue(new Response("ok")),
    } as any;
    const { result } = renderHook(() => useGuardedFetch(guard));
    let response: Response | undefined;
    await act(async () => {
      response = await result.current("https://example.com");
    });
    expect(response).toBeInstanceOf(Response);
    expect(guard.guardFetch).toHaveBeenCalledWith(
      "https://example.com",
      undefined
    );
  });
});
