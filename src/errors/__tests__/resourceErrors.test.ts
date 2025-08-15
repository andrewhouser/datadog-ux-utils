import { describe, it, expect, vi, beforeEach } from "vitest";

const addActionMock = vi.fn();
const addErrorMock = vi.fn();
vi.mock("../../datadog", () => ({
  addAction: (...args: any[]) => addActionMock(...args),
  addError: (...args: any[]) => addErrorMock(...args),
}));

async function importResourceErrors() {
  vi.resetModules();
  return await import("../resourceErrors.ts");
}

describe("resourceErrors", () => {
  beforeEach(() => {
    addActionMock.mockReset();
    addErrorMock.mockReset();
  });

  it("captures image load error as action with element snapshot", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { captureResourceErrors } = await importResourceErrors();
    const uninstall = captureResourceErrors({
      sampleRate: 100,
      includeElementInfo: true,
    });

    const img = document.createElement("img");
    img.src = "https://example.com/pic.png";
    const ev = new Event("error");
    Object.defineProperty(ev, "target", { value: img });
    window.dispatchEvent(ev);

    expect(addActionMock).toHaveBeenCalledTimes(1);
    const [name, payload] = addActionMock.mock.calls[0];
    expect(name).toBe("resource_error");
    expect(payload).toMatchObject({
      tag: "img",
      url: "https://example.com/pic.png",
      reason: "load_error",
    });
    expect(payload.el).toBeDefined();

    uninstall();
    (Math.random as any).mockRestore?.();
  });

  it("dedupes identical resource errors within window", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { captureResourceErrors } = await importResourceErrors();
    const uninstall = captureResourceErrors({
      sampleRate: 100,
      dedupeWindowMs: 60_000,
    });

    const img = document.createElement("img");
    img.src = "https://example.com/dup.png";
    const fire = () => {
      const ev = new Event("error");
      Object.defineProperty(ev, "target", { value: img });
      window.dispatchEvent(ev);
    };
    fire();
    fire();
    expect(addActionMock).toHaveBeenCalledTimes(1);
    uninstall();
    (Math.random as any).mockRestore?.();
  });

  it("uninstall stops further reporting", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { captureResourceErrors } = await importResourceErrors();
    const uninstall = captureResourceErrors({ sampleRate: 100 });
    const img = document.createElement("img");
    img.src = "https://example.com/a.png";
    const ev = new Event("error");
    Object.defineProperty(ev, "target", { value: img });
    window.dispatchEvent(ev);
    expect(addActionMock).toHaveBeenCalledTimes(1);
    uninstall();
    addActionMock.mockClear();
    const ev2 = new Event("error");
    Object.defineProperty(ev2, "target", { value: img });
    window.dispatchEvent(ev2);
    expect(addActionMock).toHaveBeenCalledTimes(0);
    (Math.random as any).mockRestore?.();
  });

  it("captures CSP violations when supported", async () => {
    (window as any).SecurityPolicyViolationEvent = function () {};
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { captureResourceErrors } = await importResourceErrors();
    const uninstall = captureResourceErrors({
      sampleRate: 100,
      captureCspViolations: true,
    });

    const ev: any = new Event("securitypolicyviolation");
    ev.effectiveDirective = "script-src";
    ev.blockedURI = "https://evil.com/x.js";
    ev.lineNumber = 10;
    ev.sourceFile = "https://example.com/app.js";
    ev.statusCode = 200;
    ev.sample = "sample";
    ev.disposition = "report";
    ev.originalPolicy = "default-src self";
    window.dispatchEvent(ev);

    expect(addActionMock).toHaveBeenCalledTimes(1);
    const [name, payload] = addActionMock.mock.calls[0];
    expect(name).toBe("csp_violation");
    expect(payload).toMatchObject({
      reason: "csp_violation",
      effectiveDirective: "script-src",
    });
    uninstall();
    (Math.random as any).mockRestore?.();
  });
});
