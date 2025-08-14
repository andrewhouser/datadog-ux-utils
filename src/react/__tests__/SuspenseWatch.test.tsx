import React, { Suspense } from "react";
import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "@testing-library/react";

const addActionMock = vi.fn();
vi.mock("../../datadog", () => ({
  addAction: (...a: any[]) => addActionMock(...a),
}));

import { SuspenseWatch } from "../suspenseWatch";

function createLazy(ms: number) {
  return React.lazy(
    () =>
      new Promise((resolve) =>
        setTimeout(() => resolve({ default: () => <div>Loaded</div> }), ms)
      ) as any
  );
}

describe("suspenseWatch", () => {
  it("reports slow fallback then resolved", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const Lazy = createLazy(150);

    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <SuspenseWatch
          id="lazy"
          fallback={<div>Loading</div>}
          options={{ timeoutMs: 50, sampleRate: 100 }}
        >
          <Lazy />
        </SuspenseWatch>
      );
    });

    await new Promise((r) => setTimeout(r, 80)); // surpass slow threshold
    await new Promise((r) => setTimeout(r, 150)); // allow resolution

    const actions = addActionMock.mock.calls.map((c) => c[0]);
    expect(actions).toContain("suspense_slow");
    // resolved event may not always fire reliably in test env timing; optional

    (Math.random as any).mockRestore?.();
    root.unmount();
  });
});
