import { describe, it, expect, vi, beforeEach } from "vitest";

// Dedicated mocks for Datadog helpers (isolated per file)
const addActionMock = vi.fn();
const addErrorMock = vi.fn();
vi.mock("../../datadog", () => ({
  addAction: (...args: any[]) => addActionMock(...args),
  addError: (...args: any[]) => addErrorMock(...args),
}));

async function importConsoleCapture() {
  vi.resetModules();
  return await import("../consoleCapture.ts");
}

describe("consoleCapture", () => {
  beforeEach(() => {
    addActionMock.mockReset();
    addErrorMock.mockReset();
  });

  it("captures console.error as addError without captureInDev", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // force sampling
    const { captureConsole, uninstall } = await importConsoleCapture();
    const origError = console.error;
    captureConsole({ errorRate: 100 });
    const wrappedError = console.error;
    expect(wrappedError).not.toBe(origError);
    const err = new Error("boom");
    console.error("failed", err);
    expect(addErrorMock).toHaveBeenCalledTimes(1);
    const call = addErrorMock.mock.calls[0];
    const forwarded = call[0];
    expect(forwarded).toBeInstanceOf(Error);
    expect((forwarded as Error).message).toBe("boom");
    uninstall();
    expect(typeof console.error).toBe("function");
    (Math.random as any).mockRestore?.();
  });

  it("does not capture warn in dev when captureInDev=false", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { captureConsole, uninstall } = await importConsoleCapture();
    captureConsole({ warnRate: 100, captureInDev: false });
    console.warn("should NOT capture");
    expect(addActionMock).toHaveBeenCalledTimes(0);
    uninstall();
    (Math.random as any).mockRestore?.();
  });

  it("captures warn with captureInDev true and dedupes identical warns", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { captureConsole, uninstall } = await importConsoleCapture();
    captureConsole({
      warnRate: 100,
      captureInDev: true,
      dedupeWindowMs: 10_000,
    });
    console.warn("repeat this", { a: 1 });
    console.warn("repeat this", { a: 1 });
    expect(addActionMock).toHaveBeenCalledTimes(1);
    const call = addActionMock.mock.calls[0];
    expect(call[0]).toBe("console_warn");
    expect(call[1]).toMatchObject({ level: "warn", message: "repeat this" });
    uninstall();
    (Math.random as any).mockRestore?.();
  });

  it("uninstall restores original console methods", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { captureConsole, uninstall } = await importConsoleCapture();
    const oLog = console.log,
      oWarn = console.warn,
      oError = console.error;
    captureConsole({
      logRate: 100,
      warnRate: 100,
      errorRate: 100,
      captureInDev: true,
    });
    expect(console.log).not.toBe(oLog);
    expect(console.warn).not.toBe(oWarn);
    expect(console.error).not.toBe(oError);
    const wrappedLog = console.log,
      wrappedWarn = console.warn,
      wrappedError = console.error;
    uninstall();
    expect(console.log).not.toBe(wrappedLog);
    expect(console.warn).not.toBe(wrappedWarn);
    expect(console.error).not.toBe(wrappedError);
    expect(() => console.log("test restore")).not.toThrow();
    expect(() => console.warn("test restore")).not.toThrow();
    expect(() => console.error("test restore")).not.toThrow();
    (Math.random as any).mockRestore?.();
  });
});
