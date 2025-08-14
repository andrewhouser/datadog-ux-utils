import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const addErrorMock = vi.fn();
vi.mock("@datadog/browser-rum", () => ({
  datadogRum: {
    addError: (...a: any[]) => addErrorMock(...a),
    addAction: vi.fn(),
  },
}));
let testCfg: any = { appName: "TestApp" };
vi.mock("../../config", () => ({ getUxConfig: () => testCfg }));

import { ErrorBoundary } from "../ErrorBoundary";

function Boom() {
  throw new Error("nope");
  return null;
}

describe("ErrorBoundary", () => {
  it("reports error and renders fallback", () => {
    render(
      <ErrorBoundary
        fallback={<div data-testid="fb">FB</div>}
        name="MyBoundary"
      >
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByTestId("fb")).toBeInTheDocument();
    expect(addErrorMock).toHaveBeenCalledTimes(1);
    const call = addErrorMock.mock.calls[0];
    expect(call[1]).toMatchObject({ boundary: "MyBoundary", app: "TestApp" });
  });
});
