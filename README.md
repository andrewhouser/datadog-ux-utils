# Datadog UX Utils

A collection of utilities for monitoring, profiling, and improving web application performance and reliability. This library provides wrappers, hooks, and observers for API calls, React components, and browser performance metrics, with Datadog RUM integration.

## Utilities Overview

### API Utilities

- **circuitBreaker.ts**: Protects API calls from repeated failures by implementing a circuit breaker pattern.
- **ddFetch.ts**: Wraps fetch calls with Datadog RUM instrumentation and timing.
- **dedupe.ts**: Deduplicates concurrent API requests to avoid redundant network traffic.
- **rateGuard.ts**: Guards against runaway or excessive API calls by rate-limiting requests.
- **responseSize.ts**: Monitors and checks the size of API responses to prevent large payloads.
- **retry.ts**: Adds retry logic to API calls for improved reliability.

### Error & Telemetry Utilities

- **consoleCapture.ts**: Captures and deduplicates console errors/warnings/logs for telemetry.
- **resourceErrors.ts**: Captures failed resource loads and CSP violations.
- **offlineQueue.ts**: Buffers telemetry events while offline, flushes on reconnect.
- **offlineQueue.persistent.ts**: Persists telemetry events to localStorage while offline.

### Environment Utilities

- **network.ts**: Tracks network conditions and exposes heuristics for constrained networks.

### Performance Utilities

- **idle.ts**: Tracks user idle state and activity for session management and analytics.
- **layoutShifts.ts**: Observes layout shifts to help diagnose visual instability (Cumulative Layout Shift).
- **longTasks.ts**: Monitors long-running tasks in the browser main thread for responsiveness.
- **memory.ts**: Tracks memory usage and trends in the browser.
- **memoryPeak.ts**: Observes peak memory usage for diagnostics.
- **resources.ts**: Reports large or slow-loading resources for optimization.
- **webVitals.ts**: Registers and tracks core web vitals (LCP, FID, CLS, etc.).

### React Utilities

- **ErrorBoundary.tsx**: Provides a React error boundary for catching and reporting component errors.
- **RenderProfiler.tsx**: Profiles React component render times using the React Profiler API.
- **suspenseWatch.tsx**: Monitors Suspense boundaries for slow or unresolved states.
- **useGuardedCall.ts**: React hook for guarded function calls with rate limiting.
- **useGuardFetch.ts**: React hook for guarded fetch calls with rate limiting.
- **RenderDetector.tsx**: Detects React render hotspots and reports when commit frequency or render cost exceeds thresholds.

### UX Utilities

- **flowTimer.ts**: Tracks user flows and timing for analytics and diagnostics.
- **routeTiming.ts**: Hooks into router changes to measure navigation timing and performance.

---

## Performance Impact Table

| Impact Score | Utility/Components                                                                                                                                                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 (Least)    | ErrorBoundary.tsx                                                                                                                                                                                                                                                                                  |
| 2            | circuitBreaker.ts, dedupe.ts, rateGuard.ts, retry.ts, responseSize.ts, RenderProfiler.tsx, suspenseWatch.tsx, useGuardFetch.ts, useGuardedCall.ts, flowTimer.ts, routeTiming.ts, RenderDetector.tsx, consoleCapture.ts, resourceErrors.ts, offlineQueue.ts, offlineQueue.persistent.ts, network.ts |
| 3            | ddFetch.ts                                                                                                                                                                                                                                                                                         |
| 4            | idle.ts, layoutShifts.ts, longTasks.ts, memory.ts, memoryPeak.ts, resources.ts                                                                                                                                                                                                                     |
| 5 (Most)     | webVitals.ts                                                                                                                                                                                                                                                                                       |

---

## Usage

Import and use the utilities as needed in your application. See individual files for API documentation and usage examples.

---

## License

MIT
