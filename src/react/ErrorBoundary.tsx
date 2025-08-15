/**
 * @file ErrorBoundary.tsx
 * @description React error boundary that catches errors in child components and reports them to Datadog RUM.
 */
import { Component, ErrorInfo, ReactNode } from "react";
import { datadogRum } from "@datadog/browser-rum";
import { getUxConfig } from "../config.ts";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
};

/**
 * React error boundary that catches errors in its child components and reports them to Datadog RUM.
 *
 * @remarks
 * Use this component to wrap any part of your React app where you want to catch and report errors.
 * When an error is caught, the fallback UI is rendered (if provided).
 *
 * @example
 * ```tsx
 * import { ErrorBoundary } from 'datadog-ux-utils/react';
 *
 * <ErrorBoundary name="AppRoot" fallback={<h1>Something broke.</h1>}>
 *   <App />
 * </ErrorBoundary>
 * ```
 *
 * @param props -
 *  - `children`: The subtree to protect with the error boundary.
 *  - `fallback`: Optional React node to render when an error is caught.
 *  - `name`: Optional identifier for this boundary (included in telemetry).
 */
export class ErrorBoundary extends Component<Props, { hasError: boolean }> {
  state = { hasError: false };

  /**
   * Updates state so the next render shows the fallback UI.
   */
  static getDerivedStateFromError() {
    return { hasError: true };
  }

  /**
   * Reports the error to Datadog RUM with boundary name, stack, and app name.
   * @param error - The error thrown by a child component.
   * @param info - React error info (component stack).
   */
  componentDidCatch(error: Error, info: ErrorInfo) {
    const { name } = this.props;
    datadogRum.addError(error, {
      boundary: name ?? "ErrorBoundary",
      componentStack: info.componentStack,
      app: getUxConfig().appName,
    });
  }

  /**
   * Renders the fallback UI if an error was caught, otherwise renders children.
   */
  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
