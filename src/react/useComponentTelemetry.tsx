/**
 * @file useComponentTelemetry.tsx
 * @description React hook that reports the first mount of a component to the component telemetry queue.
 */
import { useEffect } from "react";
// Explicitly referencing index to avoid any resolution ambiguity in some TS setups
import { reportComponentMount } from "../telemetry/index.ts";

/**
 * @category Telemetry
 * React hook that reports the *first* mount of a component to the component telemetry queue.
 *
 * Usage:
 * ```tsx
 * import { useComponentTelemetry } from 'datadog-ux-utils/react';
 *
 * export function Button(props) {
 *   useComponentTelemetry('Button', { variant: props.variant });
 *   return <button {...props} />;
 * }
 * ```
 * Ensure you called `initComponentTelemetry()` somewhere during app startup.
 */
export function useComponentTelemetry(
  componentName: string,
  opts?: { variant?: string; route?: string; force?: boolean }
) {
  useEffect(() => {
    reportComponentMount(componentName, opts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
