import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  /** The React component stack captured when the error was thrown. */
  componentStack: string;
}

/**
 * Catches any render-time error inside the routed app so one broken page can
 * never blank the entire application. Instead of an unexplained white screen the
 * user gets a clear, recoverable state with a one-tap retry — and the failure is
 * logged to the console so it stays diagnosable in a real browser.
 *
 * It also stores the error message and the React component stack, and shows the
 * message beneath the friendly copy, so the exact failing piece is visible (and
 * copyable) instead of hidden behind a generic sentence.
 */
export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the real error visible in devtools rather than silently swallowing it.
    console.error("Route render error:", error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? "" });
  }

  handleRetry = (): void => {
    this.setState({ error: null, componentStack: "" });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const message = this.state.error.message || String(this.state.error);
    // The first component frame in the stack is where the throw originated.
    const topFrame = this.state.componentStack
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)[0];
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-16 bg-background-50">
        <div className="max-w-md w-full text-center rounded-2xl bg-background-100/70 border border-background-200 p-8">
          <div className="w-14 h-14 mx-auto flex items-center justify-center rounded-2xl bg-accent-100 text-accent-700">
            <i className="ri-error-warning-line text-2xl"></i>
          </div>
          <h1 className="mt-4 font-heading text-lg font-medium text-foreground-950">
            Something went wrong on this page
          </h1>
          <p className="mt-2 text-sm text-foreground-600 leading-relaxed">
            This page hit an unexpected error, but the rest of the app is fine. Try again — and if
            it keeps happening, reload the page.
          </p>

          {/* The real cause, surfaced so it can be read or copied verbatim. */}
          <div className="mt-4 text-left rounded-lg bg-background-50 border border-background-200 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-400">
              Details
            </p>
            <pre className="mt-1.5 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-foreground-700">
              {message}
              {topFrame ? `\n${topFrame}` : ""}
            </pre>
          </div>

          <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-refresh-line"></i>
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 text-sm font-semibold text-foreground-700 bg-background-50 border border-background-200 px-4 py-2 rounded-md hover:border-background-300 hover:text-foreground-950 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-restart-line"></i>
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}