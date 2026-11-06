import Button from "@/components/base/Button";

export type ErrorStateTone = "accent" | "primary";

export interface ErrorStateProps {
  title?: string;
  /** The failure detail — usually the thrown error's message. */
  message?: string;
  /** When provided, renders a retry button wired to this handler. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Remix Icon class for the leading tile. */
  icon?: string;
  tone?: ErrorStateTone;
  className?: string;
}

const TONE: Record<ErrorStateTone, { tile: string; ring: string }> = {
  accent: { tile: "bg-accent-100 text-accent-700", ring: "ring-accent-200/70" },
  primary: { tile: "bg-primary-100 text-primary-700", ring: "ring-primary-200/70" },
};

/**
 * The design system's error state — the sibling of `EmptyState` and
 * `LoadingState`. A soft token tile, a clear title, the actual failure detail and
 * an optional retry action, so a failed load reads as intentional and recoverable
 * instead of a dead end. Composes `Button` so the retry keeps the canonical look.
 */
export default function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
  icon = "ri-error-warning-line",
  tone = "accent",
  className = "",
}: ErrorStateProps) {
  const t = TONE[tone];

  return (
    <div className={`animate-rise py-12 px-6 text-center ${className}`} role="alert">
      <div className="relative w-20 h-20 mx-auto" aria-hidden="true">
        <span className={`absolute inset-0 rounded-full ${t.tile} opacity-40`}></span>
        <span className="absolute inset-0 flex items-center justify-center">
          <span
            className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-background-50 ring-4 ${t.tile} ${t.ring}`}
          >
            <i className={`${icon} text-2xl`}></i>
          </span>
        </span>
      </div>
      <p className="mt-5 text-sm font-semibold text-foreground-950">{title}</p>
      {message && (
        <p className="mt-1.5 text-xs text-foreground-600 max-w-sm mx-auto leading-relaxed">
          {message}
        </p>
      )}
      {onRetry && (
        <div className="mt-5 flex items-center justify-center gap-2">
          <Button variant="outline" icon="ri-refresh-line" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}