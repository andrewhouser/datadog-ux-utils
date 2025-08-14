import { Profiler, ProfilerOnRenderCallback, ReactNode } from "react";
import { datadogRum } from "@datadog/browser-rum";
import { getUxConfig } from "../config";

type Props = {
  id: string;
  children: ReactNode;
};

/**
 * React Profiler wrapper that reports slow renders to Datadog RUM.
 * @param id - Unique identifier for the profiler.
 * @param children - Child React nodes to be profiled.
 * @returns The profiled React children.
 */
export const RenderProfiler = ({ id, children }: Props) => {
  const cfg = getUxConfig();

  const onRender: ProfilerOnRenderCallback = (
    _id,
    _phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime
  ) => {
    if (actualDuration >= cfg.renderSlowMs) {
      datadogRum.addAction("render_slow", {
        id,
        actual_ms: Math.round(actualDuration),
        base_ms: Math.round(baseDuration),
        started_at: Math.round(startTime),
        committed_at: Math.round(commitTime),
        threshold_ms: cfg.renderSlowMs,
      });
    }
  };

  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  );
};
