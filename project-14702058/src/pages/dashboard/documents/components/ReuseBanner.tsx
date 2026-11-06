import type { ReuseResult } from "@/lib/documents";

interface ReuseBannerProps {
  reuse: ReuseResult;
  activating: boolean;
  onUse: () => void;
  onDismiss: () => void;
}

export default function ReuseBanner({
  reuse,
  activating,
  onUse,
  onDismiss,
}: ReuseBannerProps) {
  return (
    <div className="rounded-xl bg-primary-50 border border-primary-200 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <i className="ri-sparkling-2-line text-primary-600 text-lg mt-0.5"></i>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground-950">
              A previous version already covers this job
            </p>
            {reuse.recommendation && (
              <p className="mt-1 text-sm text-foreground-700 leading-relaxed">
                {reuse.recommendation}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="w-7 h-7 flex items-center justify-center text-foreground-400 hover:text-foreground-700 cursor-pointer flex-shrink-0"
          aria-label="Dismiss"
        >
          <i className="ri-close-line"></i>
        </button>
      </div>

      {reuse.missing && reuse.missing.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-foreground-500">Tweaks still needed:</span>
          {reuse.missing.map((m, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-xs font-medium text-accent-900 bg-accent-100 px-2.5 py-1 rounded-full whitespace-nowrap"
            >
              <i className="ri-add-line"></i>
              {m}
            </span>
          ))}
        </div>
      )}

      <button
        onClick={onUse}
        disabled={activating}
        className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
      >
        {activating ? (
          <i className="ri-loader-4-line animate-spin"></i>
        ) : (
          <i className="ri-history-line"></i>
        )}
        {activating ? "Activating…" : `Use '${reuse.best_label ?? "saved"}' version`}
      </button>
    </div>
  );
}