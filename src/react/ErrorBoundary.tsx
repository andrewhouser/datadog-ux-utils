import { Component, ErrorInfo, ReactNode } from "react";
import { datadogRum } from "@datadog/browser-rum";
import { getUxConfig } from "../config";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
};

/**
 * React error boundary that reports errors to Datadog RUM.
 */
export class ErrorBoundary extends Component<Props, { hasError: boolean }> {
  readonly props!: Readonly<Props>;
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const { name } = this.props;
    datadogRum.addError(error, {
      boundary: name ?? "ErrorBoundary",
      componentStack: info.componentStack,
      app: getUxConfig().appName,
    });
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
