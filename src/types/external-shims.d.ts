// Ambient module shims for peer dependencies to silence TS resolution errors during build.
// These are intentionally minimal; real types come from the runtime packages when installed.

// Datadog RUM & Logs
declare module "@datadog/browser-rum" {
  export interface RumActionContext {
    [k: string]: any;
  }
  export interface RumInitConfiguration {
    [k: string]: any;
  }
  export type Context = Record<string, any>;
  export type ContextValue = any;
  export const datadogRum: {
    init: (config: RumInitConfiguration) => void;
    addAction: (name: string, context?: RumActionContext) => void;
    addError: (e: any, context?: any) => void;
    addTiming: (name: string, time?: number) => void;
    startSessionReplayRecording: () => void;
    setUser?: (user: Record<string, any>) => void;
    addFeatureFlagEvaluation?: (key: string, value: any) => void;
    addGlobalContext: (key: string, value: any) => void;
    setGlobalContext?: (ctx: Record<string, any>) => void;
    getGlobalContext?: () => Record<string, any>;
    removeGlobalContext?: (key: string) => void;
  };
}

declare module "@datadog/browser-logs" {
  export interface LogsInitConfiguration {
    [k: string]: any;
  }
  export const datadogLogs: {
    init: (config: LogsInitConfiguration) => void;
    logger?: any;
  };
}

// web-vitals simplified hooks
declare module "web-vitals" {
  export type Metric = {
    name: string;
    value: number;
    id?: string;
    entries?: PerformanceEntry[];
  };
  export type ReportCallback = (metric: Metric) => void;
  export const onCLS: (cb: ReportCallback) => void;
  export const onFCP: (cb: ReportCallback) => void;
  export const onLCP: (cb: ReportCallback) => void;
  export const onINP: (cb: ReportCallback) => void;
  export const onTTFB: (cb: ReportCallback) => void;
}
