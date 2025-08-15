// Centralized shared types for datadog-ux-utils
export type UxConfig = {
  appName: string;
  service?: string;
  env?: string;
  version?: string;
  apiSlowMs?: number;
  apiLargeKb?: number;
  renderSlowMs?: number;
  captureResponseSize?: boolean;
  captureLongTasks?: boolean;
  captureWebVitals?: boolean;
  actionSampleRate?: number;
  errorSampleRate?: number;
  onRouteChange?: (route: string) => void;
};

export type DdBaseInit = {
  appName: string;
  service?: string;
  env?: string;
  version?: string;
};

export type NetworkInfo = {
  online: boolean;
  type?: string;
  effectiveType?: string;
  downlinkMbps?: number;
  rttMs?: number;
  saveData?: boolean;
};

export type TrackNetworkOptions = {
  reportChanges?: boolean;
  changeSampleRate?: number;
  constrained?: Partial<ConstrainedHeuristics>;
  debounceMs?: number;
  setGlobalContext?: boolean;
};

export type ConstrainedHeuristics = {
  effectiveTypes: string[];
  maxDownlinkMbps: number;
  minRttMs: number;
  respectSaveData: boolean;
};

export interface MemoryMetrics {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface MemoryTrackingOptions {
  intervalMs?: number;
  reportToDatadog?: boolean;
  onChange?: (metrics: MemoryMetrics) => void;
}

export type MemoryPeak = {
  peakUsedBytes: number;
  peakTotalBytes?: number;
  peakLimitBytes?: number;
  at: number;
};

export type MemoryPeakReportMode = "onHide" | "interval" | "manual";

export interface MemoryPeakOptions {
  mode?: MemoryPeakReportMode;
  intervalMs?: number;
  reportToDatadog?: boolean;
  actionName?: string;
  onNewPeak?: (peak: MemoryPeak) => void;
}

export interface LayoutShiftOptions {
  reportToDatadog?: boolean;
  onChange?: (clsValue: number, entry: any) => void;
}

export type DedupeTelemetry =
  | boolean
  | {
      sampleRate?: number;
      actionName?: string;
    };

export type DedupeOptions = {
  ttlMs?: number;
  report?: DedupeTelemetry;
};

export type ResourceErrorOptions = {
  sampleRate?: number;
  dedupeWindowMs?: number;
  maxPerMinute?: number;
  includeElementInfo?: boolean;
  captureCspViolations?: boolean;
  actionName?: string;
  cspActionName?: string;
};

export type PersistentQueueOptions = {
  storageKey?: string;
  maxBuffered?: number;
  byteCap?: number;
  flushOnInit?: boolean;
  writeDebounceMs?: number;
};

export type ConsoleCaptureOptions = {
  errorRate?: number;
  warnRate?: number;
  logRate?: number;
  dedupeWindowMs?: number;
  maxStringLen?: number;
  maxArgs?: number;
  includeTrace?: boolean;
  captureInDev?: boolean;
  sanitize?: (arg: unknown) => unknown;
};

export type Flags = {
  guardEnabled: boolean;
};
