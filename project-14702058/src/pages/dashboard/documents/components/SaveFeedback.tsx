interface SaveFeedbackProps {
  /** Success message shown after a save, e.g. "Résumé saved." */
  saveSuccess: string;
  /** Error message shown when a save fails. */
  saveError: string;
  /** True when the just-saved document is ahead of the last AI review. */
  reassessStale?: boolean;
  /** True while the AI review is running, so the action can show its progress. */
  reassessLoading?: boolean;
  /** Re-run the AI review — shares the page's review action. */
  onReassess?: () => void;
}

/**
 * The inline confirmation strip that sits under the manual-edit toolbar. As well
 * as echoing the save result, it offers a one-click "Reassess now" whenever the
 * freshly saved document is ahead of the last AI review — so refreshing the
 * summary needs no hunting back up the page.
 */
export default function SaveFeedback({
  saveSuccess,
  saveError,
  reassessStale = false,
  reassessLoading = false,
  onReassess,
}: SaveFeedbackProps) {
  if (!saveSuccess && !saveError) return null;
  const showReassess = Boolean(saveSuccess && reassessStale && onReassess);
  return (
    <div className="flex items-center gap-2 flex-wrap animate-fade-in-up">
      {saveSuccess && (
        <span className="inline-flex items-center gap-1.5 text-sm text-primary-700">
          <i className="ri-check-line"></i>
          {saveSuccess}
        </span>
      )}
      {saveError && (
        <span className="inline-flex items-center gap-1.5 text-sm text-accent-700">
          <i className="ri-error-warning-line"></i>
          {saveError}
        </span>
      )}
      {showReassess && (
        <button
          type="button"
          onClick={onReassess}
          disabled={reassessLoading}
          title="Re-run the AI review so the summary reflects your saved changes"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-background-50 dark:text-foreground-950 bg-accent-500 hover:bg-accent-600 px-3 py-1.5 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
        >
          {reassessLoading ? (
            <i className="ri-loader-4-line animate-spin"></i>
          ) : (
            <i className="ri-refresh-line"></i>
          )}
          {reassessLoading ? "Reassessing…" : "Reassess now"}
        </button>
      )}
    </div>
  );
}