import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  /** Optional fallback to render instead of the default error UI */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          role="alert"
          className="m-8 p-6 bg-rose-50 border border-rose-200 rounded-card max-w-lg dark:bg-rose-950/30 dark:border-rose-900/50"
        >
          <h2 className="text-lg font-semibold text-rose-700 mb-2 dark:text-rose-300">
            Something went wrong
          </h2>
          <p className="text-sm text-pawn-surface-400 mb-4">
            An unexpected error occurred while rendering this section. Try
            refreshing the page.
          </p>
          {this.state.error && (
            <pre className="text-xs text-rose-700 font-mono bg-rose-100 rounded-button p-3 overflow-x-auto whitespace-pre-wrap break-words mb-4 dark:text-rose-400/80 dark:bg-pawn-surface-950">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-rose-100 hover:bg-rose-200 text-rose-700 text-sm font-medium rounded-button border border-rose-300 transition-colors dark:bg-rose-500/20 dark:hover:bg-rose-500/30 dark:text-rose-300 dark:border-rose-500/30"
          >
            Reload page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
