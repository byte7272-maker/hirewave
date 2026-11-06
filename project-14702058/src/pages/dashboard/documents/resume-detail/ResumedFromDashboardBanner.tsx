interface ResumedFromDashboardBannerProps {
  /** Dismiss the banner. */
  onDismiss: () => void;
}

/** Subtle, self-clearing confirmation shown after resuming the wizard from the dashboard. */
export default function ResumedFromDashboardBanner({
  onDismiss,
}: ResumedFromDashboardBannerProps) {
  return (
    <div className="animate-fade-in-up flex items-center gap-2.5 rounded-xl bg-secondary-100 text-secondary-900 px-4 py-2.5 text-sm">
      <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
        <i className="ri-history-line"></i>
      </span>
      <span className="flex-1 min-w-0">
        Resumed from dashboard — picked up your “My Work Highlights” wizard where you
        left off.
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="w-7 h-7 flex items-center justify-center rounded-md text-secondary-900 hover:bg-secondary-200 transition-colors cursor-pointer flex-shrink-0"
      >
        <i className="ri-close-line"></i>
      </button>
    </div>
  );
}