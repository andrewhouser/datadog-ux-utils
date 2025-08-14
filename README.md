# Datadog UX Utils

Utilities and React helpers for instrumenting real user experience (UX) in web apps with [Datadog RUM](https://www.datadoghq.com/product/real-user-monitoring/) + Logs. Provides:

- Lightweight performance & resource observers (long tasks, layout shifts, memory, large/slow resources, web vitals)
- Guard rails for API usage (circuit breaker, retry, dedupe, rate limiting, response size & latency sampling)
- React components & hooks (error boundary, render profiler / detector, Suspense watcher, guarded fetch/call)
- UX flow & route timing measurement
- Offline (in‑memory & persistent) telemetry queueing
- Console & resource error capture (with de‑dupe & CSP support)

Generated **TypeDoc API docs** live in the repo under [`/docs`](./docs) and can be browsed directly on GitHub: start at [`docs/index.html`](./docs/index.html). (When serving locally, run `npm run docs:serve`).

---

## Installation

```bash
npm install datadog-ux-utils @datadog/browser-rum @datadog/browser-logs
```

Peer deps: `react` & `react-dom` (if you use the React helpers).

---

## Quick Start

Initialize Datadog (simplified example) then wire desired utilities:

```ts
import { initDatadogUx, startFlow, hookRouter } from "datadog-ux-utils";

initDatadogUx({
  appName: "MyApp",
  actionSampleRate: 50, // % sampling for non-critical actions
  apiSlowMs: 500, // threshold for api_slow
  renderSlowMs: 12, // threshold for render_slow
  captureWebVitals: true,
});

// Track a user flow
const flow = startFlow("checkout", { items: 3 });
// ... later
flow.end({ orderId: "123" });

// Route timing (pass a function that returns the current route path)
const unhook = hookRouter(() => window.location.pathname);
```

React component usage:

```tsx
import {
  ErrorBoundary,
  RenderProfiler,
  SuspenseWatch,
} from "datadog-ux-utils/react";

<ErrorBoundary name="AppRoot" fallback={<h1>Something broke.</h1>}>
  <RenderProfiler id="MainShell">
    <SuspenseWatch
      id="MainData"
      fallback={<Spinner />}
      options={{ timeoutMs: 120 }}
    >
      <App />
    </SuspenseWatch>
  </RenderProfiler>
</ErrorBoundary>;
```

---

## API Surface Overview

### API Utilities

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

Impact is an approximate relative cost bucket when enabled with default options (1 = minimal overhead, 5 = highest). Most utilities are event / observer driven and noop when corresponding config flags are disabled.

---

## Generated Documentation

Browse TypeDoc output in the repo:

- [Index](./docs/index.html)
- Modules: [API](./docs/modules/api.html), [Performance](./docs/modules/perf.html), [React](./docs/modules/react.html), [Config](./docs/modules/config.html)
- Examples of function pages: [`ddFetch`](./docs/functions/api_ddFetch.ddFetch.html), [`registerWebVitals`](./docs/functions/perf_webVitals.registerWebVitals.html), [`startLongTaskObserver`](./docs/functions/perf_longTasks.startLongTaskObserver.html)

To regenerate locally:

```bash
npm run docs
```

To watch & rebuild while iterating:

```bash
npm run docs:serve
```

---

## Building & Testing

```bash
npm install
npm run build          # emits ESM + CJS into dist/
npm test               # Vitest unit tests
npm run test:coverage  # Coverage report
```

`prepublishOnly` runs typecheck, tests, build, and docs to ensure published artifacts are consistent.

---

## Configuration Summary

Use `initDatadogUx` (see `config.ts`) to set:

- `appName` – identifier included on actions/errors
- Sampling & thresholds: `actionSampleRate`, `apiSlowMs`, `renderSlowMs`, `apiLargeKb`, `captureWebVitals`, `captureLongTasks`, etc.
- Feature toggles: enable/disable observers individually

See generated docs for all config fields: [`getUxConfig`](./docs/functions/config.getUxConfig.html) and [`initDatadogUx`](./docs/functions/config.initDatadogUx.html).

---

## Contributing

1. Fork & clone
2. `npm install`
3. Create a feature branch
4. Add tests (Vitest)
5. `npm run typecheck && npm test`
6. Open PR

Please see [`CONTRIBUTING.md`](./CONTRIBUTING.md) for full guidelines.

---

## License

MIT – see [`LICENSE`](./LICENSE).

---

## Notes

- All React helpers are compatible with React 19 (uses `createRoot`).
- Observers degrade gracefully in unsupported environments (e.g., memory API).
- Telemetry queue works offline (in-memory) and persistently (`localStorage`).
- All APIs are tree‑shakeable; import only what you need.

---

## Usage

Import and use the utilities as needed in your application. See individual files for API documentation and usage examples.

---

## License

MIT
