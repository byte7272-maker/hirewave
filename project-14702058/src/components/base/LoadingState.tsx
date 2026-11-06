/**
 * The design system's loading state. Two shapes, both built from tokens so a
 * load-in-progress looks like a deliberate part of the product rather than a
 * bare spinner:
 *  - default: a centered spinner + label
 *  - `rows > 0`: that many shimmering skeleton rows that hint the content shape
 *
 * See `src/design-system.md` — states (empty / loading / error) compose the same
 * surface language as every card so nothing looks foreign at load time.
 */
export interface LoadingStateProps {
  /** Status text under the spinner. */
  label?: string;
  /** When greater than zero, render that many skeleton rows instead of a spinner. */
  rows?: number;
  className?: string;
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-background-200 bg-background-50 px-4 py-3.5">
      <span className="w-9 h-9 rounded-tile bg-background-200/70 animate-pulse flex-shrink-0"></span>
      <span className="flex-1 min-w-0 space-y-2">
        <span
          className="block h-3 w-2/5 rounded-full bg-background-200/70 animate-pulse"
          style={{ animationDelay: "0.1s" }}
        ></span>
        <span
          className="block h-2.5 w-3/5 rounded-full bg-background-200/50 animate-pulse"
          style={{ animationDelay: "0.2s" }}
        ></span>
      </span>
      <span className="w-16 h-7 rounded-control bg-background-200/60 animate-pulse flex-shrink-0"></span>
    </div>
  );
}

export default function LoadingState({
  label = "Loading…",
  rows = 0,
  className = "",
}: LoadingStateProps) {
  if (rows > 0) {
    return (
      <div className={`space-y-3 ${className}`} role="status" aria-live="polite">
        <span className="sr-only">{label}</span>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`py-14 flex items-center justify-center gap-2.5 text-sm text-foreground-500 ${className}`}
      role="status"
      aria-live="polite"
    >
      <i className="ri-loader-4-line animate-spin text-lg text-primary-600" aria-hidden="true"></i>
      {label}
    </div>
  );
}