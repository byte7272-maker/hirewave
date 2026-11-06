import { Component, type ErrorInfo, type ReactNode } from "react";

interface WidgetBoundaryProps {
  /** A short name for the section, used for the log and the fallback copy. */
  label?: string;
  children: ReactNode;
  /**
   * Which surface the fallback sits on. `dark` is for a dark / gradient section
   * (e.g. the versions rail), so the quiet retry note looks intentional there
   * instead of painting a light card on a dark background.
   */
  tone?: "light" | "dark";
}

interface WidgetBoundaryState {
  failed: boolean;
}

/**
 * A small, per-section error boundary for the dashboard. The app already has a
 * top-level boundary that keeps a broken PAGE from blanking the whole app — but
 * that still replaces everything on the page with one card. This one is narrower:
 * it wraps a SINGLE dashboard section, so if that one widget throws the rest of
 * the dashboard (header, other widgets, navigation) keeps rendering, and the
 * failing section shows a quiet, retryable note instead of taking the page down.
 *
 * The error is still logged to the console with its component stack so it stays
 * diagnosable. "Try again" clears the failure and re-mounts the section.
 */
export default class WidgetBoundary extends Component<
  WidgetBoundaryProps,
  WidgetBoundaryState
> {
  state: WidgetBoundaryState = { failed: false };

  static getDerivedStateFromError(): WidgetBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const where = this.props.label ? ` (${this.props.label})` : "";
    console.error(`Dashboard section failed${where}:`, error, info.componentStack);
  }

  handleRetry = (): void => {
    this.setState({ failed: false });
  };

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const dark = this.props.tone === "dark";
    return (
      <section
        className={`rounded-2xl px-5 py-6 flex flex-col items-center text-center gap-1.5 ${
          dark
            ? "bg-background-50/5 border border-background-50/15"
            : "bg-background-100/60 border border-background-200"
        }`}
      >
        <span
          className={`w-9 h-9 flex items-center justify-center rounded-lg ${
            dark ? "bg-accent-500/20 text-accent-200" : "bg-accent-100 text-accent-700"
          }`}
        >
          <i className="ri-error-warning-line text-lg"></i>
        </span>
        <p
          className={`text-sm font-medium ${dark ? "text-background-50" : "text-foreground-900"}`}
        >
          {this.props.label ? `${this.props.label} couldn’t load` : "This section couldn’t load"}
        </p>
        <p className={`text-xs ${dark ? "text-background-200" : "text-foreground-500"}`}>
          The rest of the page is fine — try this section again.
        </p>
        <button
          type="button"
          onClick={this.handleRetry}
          className={`mt-1 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
            dark
              ? "text-accent-200 hover:text-background-50 hover:bg-background-50/10"
              : "text-primary-700 hover:text-primary-900 hover:bg-background-100"
          }`}
        >
          <i className="ri-refresh-line"></i>
          Try again
        </button>
      </section>
    );
  }
}