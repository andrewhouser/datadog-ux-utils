import React, { useState, useEffect } from "react";
import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";

const addActionMock = vi.fn();
vi.mock("../../datadog", () => ({
  addAction: (...a: any[]) => addActionMock(...a),
}));

import { RenderDetector } from "../RenderDetector";

function Chatty() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => x + 1), 1);
    return () => clearInterval(id);
  }, []);
  return <div>{n}</div>;
}

describe("RenderDetector", () => {
  it("emits hotspot action under rapid commits", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // force sampling
    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);
    root.render(
      <RenderDetector
        id="chatty"
        options={{
          enabled: true,
          windowMs: 100,
          commitsPerSecThreshold: 5,
          renderMsPerSecThreshold: 0,
          minCommits: 3,
          cooldownMs: 50,
          telemetrySampleRate: 100,
        }}
      >
        <Chatty />
      </RenderDetector>
    );
    // allow some commits
    await new Promise((r) => setTimeout(r, 120));
    expect(addActionMock).toHaveBeenCalled();
    root.unmount();
    (Math.random as any).mockRestore?.();
  });
});
