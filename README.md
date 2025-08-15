# Datadog UX Utils

[![npm version](https://img.shields.io/npm/v/datadog-ux-utils.svg)](https://www.npmjs.com/package/datadog-ux-utils)
[![bundle size](https://img.shields.io/bundlephobia/minzip/datadog-ux-utils)](https://bundlephobia.com/package/datadog-ux-utils)
[![docs](https://img.shields.io/badge/docs-live-blue)](https://andrewhouser.github.io/datadog-ux-utils/)

**Datadog UX Utils** is a toolkit that helps you measure and improve user experience in web apps. It works with [Datadog RUM](https://www.datadoghq.com/product/real-user-monitoring/) and Logs, and provides simple tools for tracking performance, errors, and user flows.

---

## What’s Included? (Easy Descriptions)

- **Performance Trackers**: Watch for slow parts of your app, like long tasks, layout shifts, memory spikes, and slow resources. These tools help you spot what’s slowing down your site.
- **API Safety Nets**: Prevent problems with your API calls—avoid too many requests, retry failures, and block repeated errors. These keep your app running smoothly even when things go wrong.
- **React Helpers**: Catch errors, measure render speed, and watch for slow loading in your React components. These make your app more reliable and easier to debug.
- **User Flow Timers**: Track how long users spend on key actions or pages. This helps you understand what users do and where they might get stuck.
- **Offline Telemetry**: Save important events when users are offline and send them when they reconnect. You won’t lose data if someone’s internet drops.
- **Error Catchers**: Collect errors from the browser console and failed resource loads. This helps you find and fix problems faster.

---

## Getting Started

Install the package and its Datadog dependencies:

```bash
npm install datadog-ux-utils @datadog/browser-rum @datadog/browser-logs
```

If you use React, make sure you have `react` and `react-dom` installed.

---

## Example Usage

**Initialize Datadog and start tracking:**

```ts
import { initDatadogUx, startFlow } from "datadog-ux-utils";

initDatadogUx({ appName: "MyApp" });

const flow = startFlow("checkout");
// ...when done
flow.end();
```

**React error boundary:**

```tsx
import {
  ErrorBoundary,
  RenderProfiler,
  SuspenseWatch,
} from "datadog-ux-utils/react";

<ErrorBoundary name="AppRoot" fallback={<h1>Something broke.</h1>}>
  <App />
</ErrorBoundary>;
```

You can also combine React helpers:

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

## Subpath Imports

Import only what you need (tree-shake friendly):

`api`, `perf`, `react`, `env`, `errors`, `telemetry`, `ux`

Example:

```ts
import { ddFetch } from "datadog-ux-utils/api";
import { registerWebVitals } from "datadog-ux-utils/perf";
import { ErrorBoundary } from "datadog-ux-utils/react";
import { networkInfo } from "datadog-ux-utils/env";
import { captureConsole } from "datadog-ux-utils/errors";
import { enqueueOffline } from "datadog-ux-utils/telemetry";
import { startFlow } from "datadog-ux-utils/ux";
```

```tsx
import { useComponentTelemetry } from "datadog-ux-utils/react";

export function Button(
  props: { variant?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>
) {
  useComponentTelemetry("Button", { variant: props.variant });
  return <button {...props} />;
}
```

Custom sink example (send batch to your own endpoint instead of individual `addAction` calls):

```ts
initComponentTelemetry({
  sampleRate: 0.5,
  sink(batch) {
    navigator.sendBeacon("/_telemetry/components", JSON.stringify(batch));
  },
});
```

---

## API Surface Overview

### API Utilities

- **circuitBreaker**: Prevents your app from making repeated failing API calls by temporarily blocking requests after too many errors.
- **ddFetch**: Makes network requests and automatically tracks their performance and errors for you.
- **dedupe**: Combines duplicate API requests so your app doesn’t send the same request multiple times.
- **rateGuard**: Limits how often your app can make certain API calls, protecting against overload.
- **responseSize**: Checks the size of data returned from APIs to help avoid slowdowns from large responses.
- **retry**: Automatically tries failed API requests again, making your app more reliable.

### Error & Telemetry Utilities

- **consoleCapture**: Collects errors and warnings from the browser’s console so you can see what went wrong.
- **resourceErrors**: Tracks when images, scripts, or other resources fail to load.
- **offlineQueue**: Saves important events when users are offline and sends them when they reconnect.
- **offlineQueue.persistent**: Keeps offline events safe in local storage until they can be sent.

### Environment Utilities

- **network**: Watches your user’s network connection and lets you know if it’s slow or unreliable.

### Performance Utilities

- **idle**: Detects when users are idle or active in your app.
- **layoutShifts**: Spots unexpected movements on your pages that can annoy users.
- **longTasks**: Finds slow operations that can make your app feel sluggish.
- **memory**: Watches how much memory your app uses over time.
- **memoryPeak**: Reports the highest memory usage for troubleshooting.
- **resources**: Identifies big or slow files that may slow down your site.
- **webVitals**: Tracks key web performance metrics like loading speed and responsiveness.

### React Utilities

- **ErrorBoundary**: Catches errors in your React components and shows a fallback UI.
- **RenderProfiler**: Measures how long your React components take to render.
- **SuspenseWatch**: Alerts you when React Suspense boundaries are slow to resolve.
- **useGuardedCall**: Lets you safely call functions in React, with built-in rate limiting.
- **useGuardFetch**: Makes network requests in React with automatic safety checks.
- **RenderDetector**: Finds React components that render too often or take too long.

### UX Utilities

- **flowTimer**: Measures how long users spend on important actions or pages.
- **routeTiming**: Tracks how quickly users move between pages in your app.

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
npm run size           # Enforce bundle size limits (size-limit)
```

Individual tree‑shaken scenarios (see `size-limit/*`) include telemetry-only usage:

```
size-limit --why --limit 2 KB size-limit/only-componentTelemetry.js
```

`prepublishOnly` runs typecheck, tests, build, and docs to ensure published artifacts are consistent.

Automated releases use semantic-release (Angular commit convention) once `NPM_TOKEN` is configured.

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

```

```
