import React from "react";
import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "@testing-library/react";

const addActionMock = vi.fn();
vi.mock("@datadog/browser-rum", () => ({
  datadogRum: { addAction: (...a: any[]) => addActionMock(...a) },
}));
let testCfg: any = { renderSlowMs: 5 };
vi.mock("../../config", () => ({ getUxConfig: () => testCfg }));

import { RenderProfiler } from "../RenderProfiler";

function SlowOnce() {
  const t = performance.now();
  while (performance.now() - t < 8) {}
  return <div>slow</div>;
}

describe("RenderProfiler", () => {
  it("reports slow render", async () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <RenderProfiler id="slow">
          <SlowOnce />
        </RenderProfiler>
      );
    });
    expect(addActionMock).toHaveBeenCalled();
    root.unmount();
    const payload = addActionMock.mock.calls[0][1];
    expect(payload).toMatchObject({ id: "slow", threshold_ms: 5 });
  });
});
