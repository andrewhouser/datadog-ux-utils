import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let testCfg: any = { env: "prod", version: "1.2.3", appName: "TestApp" };
vi.mock("../../config", () => ({
  getUxConfig: () => testCfg,
  __setUxTestConfig: (c: any) => (testCfg = { ...testCfg, ...c }),
}));

const ddActions: any[] = [];
vi.mock("../../datadog", () => ({
  addAction: vi.fn((name: string, attrs: any) => ddActions.push([name, attrs])),
}));

import {
  initComponentTelemetry,
  reportComponentMount,
  flush,
  _resetComponentTelemetry,
} from "../runtime/componentTelemetry.ts";
// @ts-ignore
import { __setUxTestConfig } from "../../config.ts";
import { addAction } from "../../datadog.ts";

// Avoid real timers
vi.useFakeTimers();

describe.sequential("componentTelemetry", () => {
  beforeEach(() => {
    ddActions.length = 0;
    _resetComponentTelemetry();
    __setUxTestConfig({ env: "prod", version: "1.2.3", appName: "TestApp" });
    (addAction as any).mockClear?.();
  });
  afterEach(() => {
    _resetComponentTelemetry();
  });

  it("does not emit before init", () => {
    reportComponentMount("Button");
    expect(ddActions.length).toBe(0);
  });

  it("samples events", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.6);
    initComponentTelemetry({ sampleRate: 0.5, flushIntervalMs: 0 });
    reportComponentMount("Button"); // sampled out
    expect(ddActions.length).toBe(0);
    (Math.random as any).mockReturnValue(0.1);
    reportComponentMount("Card");
    flush();
    expect(ddActions.length).toBe(1);
    expect(ddActions[0][0]).toBe("ds_component_mount");
  });

  it("flushes automatically at threshold", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // always in sample
    initComponentTelemetry({ sampleRate: 1, flushIntervalMs: 10000 });
    for (let i = 0; i < 50; i++) reportComponentMount("Item" + i);
    // threshold flush triggered
    expect(ddActions.length).toBe(50);
  });

  it("flushes on interval", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // always in sample
    initComponentTelemetry({ sampleRate: 1, flushIntervalMs: 500 });
    reportComponentMount("Widget");
    expect(ddActions.length).toBe(0);
    vi.advanceTimersByTime(500);
    expect(ddActions.length).toBe(1);
  });

  it("respects allowInDev false", () => {
    __setUxTestConfig({ env: "dev" });
    initComponentTelemetry({ sampleRate: 1 });
    reportComponentMount("DevOnly");
    flush();
    expect(ddActions.length).toBe(0);
  });

  it("custom sink invoked", () => {
    const sink = vi.fn();
    vi.spyOn(Math, "random").mockReturnValue(0);
    initComponentTelemetry({ sampleRate: 1, sink, flushIntervalMs: 0 });
    reportComponentMount("Badge");
    flush();
    expect(sink).toHaveBeenCalledTimes(1);
    expect(addAction).not.toHaveBeenCalled();
  });
});
