# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-08-15

### Added

- Initial public release of `datadog-ux-utils`.
- API guards: circuit breaker, retry, dedupe, rate guard, response size & timing helpers.
- Performance observers: long tasks, layout shifts, memory & memory peak, resource reporting, web vitals.
- React helpers: ErrorBoundary, RenderProfiler, RenderDetector, SuspenseWatch, guarded fetch & call hooks.
- UX utilities: flow timer, route timing.
- Telemetry capture: console capture, resource error & CSP violation capture.
- Offline telemetry queues (in-memory & persistent).
- TypeScript declarations and generated TypeDoc docs (GitHub Pages workflow).
- Comprehensive Vitest test suite.
