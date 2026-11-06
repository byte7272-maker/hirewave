import { useEffect } from "react";

interface LandedInNoticeProps {
  /**
   * Human section names the accepted AI change touched, e.g. ["Summary",
   * "Experience"]. Shown together as "Landed in: Summary / Experience".
   */
  sections: string[];
  /** Called when the notice auto-hides or the user dismisses it. */
  onDismiss: () => void;
  /** How long the notice stays on screen before it fades out. */
  ttlMs?: number;
}

/**
 * A small, self-clearing confirmation shown right after an AI change is accepted
 * (a direct apply or a preview accept). It names the document sections the change
 * actually landed in, so it's obvious where the edit applied. Auto-hides after a
 * few seconds, and can be dismissed at once.
 */
export default function LandedInNotice({
  sections,
  onDismiss,
  ttlMs = 9000,
}: LandedInNoticeProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, ttlMs);
    return () => window.clearTimeout(timer);
  }, [onDismiss, ttlMs]);

  if (sections.length === 0) return null;

  return (
    <div className="animate-fade-in-up flex items-center gap-2.5 rounded-xl border border-primary-200 bg-primary-100/70 px-4 py-2.5 hw-print-hide">
      <span className="w-7 h-7 flex items-center justify-center rounded-md bg-primary-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
        <i className="ri-map-pin-2-line"></i>
      </span>
      <p className="flex-1 min-w-0 text-sm text-foreground-900">
        <span className="font-semibold">Landed in:</span>{" "}
        <span className="text-foreground-700">{sections.join(" / ")}</span>
      </p>
      <button
        type="button"
        onClick={onDismiss}
        title="Dismiss this confirmation"
        className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 bg-background-50 border border-primary-200 hover:bg-background-100 px-2.5 py-1 rounded-full transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
      >
        <i className="ri-check-line"></i>
        Got it
      </button>
    </div>
  );
}