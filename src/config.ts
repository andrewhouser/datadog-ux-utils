/**
 * @file config.ts
 * @description Configuration and initialization for Datadog UX utilities and RUM integration.
 */
import { datadogRum } from "@datadog/browser-rum";
import { UxConfig } from "./types/types.ts";

let _config: Required<UxConfig>;

/**
 * Initializes Datadog UX utilities and configures RUM if not already initialized.
 * @param cfg - Partial configuration for UX utilities.
 * @returns The resolved configuration object.
 */
export function initDatadogUx(cfg: UxConfig) {
  _config = {
    actionSampleRate: 100,
    apiLargeKb: 200,
    apiSlowMs: 800,
    captureLongTasks: true,
    captureResponseSize: true,
    captureWebVitals: false,
    env: cfg.env ?? "prod",
    errorSampleRate: 100,
    onRouteChange: cfg.onRouteChange ?? (() => {}),
    renderSlowMs: 50,
    service: cfg.service ?? cfg.appName,
    version: cfg.version ?? "0.0.0",
    ...cfg,
  };

  // Only initialize RUM if the host app hasn't done it
  if (!(datadogRum as any)._isInitialized) {
    datadogRum.init({
      applicationId: "<YOUR_APP_ID>",
      clientToken: "<YOUR_CLIENT_TOKEN>",
      env: _config.env,
      service: _config.service,
      sessionReplaySampleRate: 0,
      sessionSampleRate: 100,
      site: "datadoghq.com",
      trackLongTasks: false, // we do our own lightweight observer
      trackResources: true,
      trackUserInteractions: true,
      version: _config.version,
    });
    datadogRum.startSessionReplayRecording(); // optional
  }

  datadogRum.addAction("ux_utils_initialized", {
    app: _config.appName,
    thresholds: {
      apiSlowMs: _config.apiSlowMs,
      apiLargeKb: _config.apiLargeKb,
      renderSlowMs: _config.renderSlowMs,
    },
  });

  return _config;
}

/**
 * Gets the current UX configuration.
 * @returns The resolved configuration object.
 */
export const getUxConfig = () => {
  if (!_config) {
    // minimal default for tests / uninitialized usage
    _config = {
      actionSampleRate: 100,
      apiLargeKb: 200,
      apiSlowMs: 0,
      captureLongTasks: false,
      captureResponseSize: true,
      captureWebVitals: false,
      env: "test",
      errorSampleRate: 100,
      onRouteChange: () => {},
      renderSlowMs: 50,
      service: "test",
      version: "0.0.0",
      appName: "test",
    } as any;
  }
  return _config;
};
/**
 * Updates the current UX configuration with new values.
 * @param p - Partial configuration to merge.
 * @returns The updated configuration object.
 */
export const setUxConfig = (p: Partial<UxConfig>) =>
  (_config = { ..._config, ...p });

// Test-only helper (not exported in package exports) to prime config without full init
export const __setUxTestConfig = (c: Partial<UxConfig>) => {
  _config = { ...(_config as any), ...c };
};
