import type { FindReplaceNotice, FindReplacePreview } from "@/hooks/useFindReplace";
import type { MatchContext } from "@/lib/findReplace";

interface FindReplacePanelProps {
  /** Whether the tool is expanded. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  find: string;
  onFindChange: (value: string) => void;
  replace: string;
  onReplaceChange: (value: string) => void;
  /** "Match case" toggle — case-sensitive matching. */
  matchCase: boolean;
  onMatchCaseChange: (value: boolean) => void;
  /** "First only" toggle — replace only the first occurrence. */
  firstOnly: boolean;
  onFirstOnlyChange: (value: boolean) => void;
  replacing: boolean;
  /** False when there's no text to find, or a request is in flight. */
  canReplace: boolean;
  /** How many matches the live Find query found in the document (0 = none). */
  matchCount?: number;
  /** Which match is currently focused while stepping (0-based). */
  activeMatch?: number;
  /** The sentence around the active match, shown under the Find box for context. */
  matchContext?: MatchContext | null;
  /** Jump to the next match (Enter). */
  onNextMatch: () => void;
  /** Jump to the previous match (Shift+Enter). */
  onPrevMatch: () => void;
  error: string;
  notice: FindReplaceNotice | null;
  /** A matched swap awaiting confirmation — shown before the version saves. */
  preview: FindReplacePreview | null;
  onClearNotice: () => void;
  onSubmit: () => void;
  /** Confirm the previewed swap and save it as a new version. */
  onConfirm: () => void;
  /** Drop the preview without saving anything. */
  onCancelPreview: () => void;
  /** Re-run the last request after a failure. */
  onRetry: () => void;
  /** id for the Find input, so the editor can focus it when routed here. */
  inputId?: string;
}

/**
 * The deterministic Find & Replace tool. Unlike the AI improve path, this does
 * an exact literal swap through a dedicated endpoint — so "replace X with Y"
 * always lands. It shows a spinner while running, a clear count on success, and
 * an explicit "no matches" message when the text isn't found (the feedback that
 * was missing), plus a retryable error banner on failure.
 */
export default function FindReplacePanel({
  open,
  onOpenChange,
  find,
  onFindChange,
  replace,
  onReplaceChange,
  matchCase,
  onMatchCaseChange,
  firstOnly,
  onFirstOnlyChange,
  replacing,
  canReplace,
  matchCount,
  activeMatch,
  matchContext,
  onNextMatch,
  onPrevMatch,
  error,
  notice,
  preview,
  onClearNotice,
  onSubmit,
  onConfirm,
  onCancelPreview,
  onRetry,
  inputId,
}: FindReplacePanelProps) {
  const wordDelta = preview ? preview.afterWords - preview.beforeWords : 0;
  const hasMatches = typeof matchCount === "number" && matchCount > 0;
  const currentMatch =
    hasMatches && typeof activeMatch === "number"
      ? (((activeMatch % (matchCount as number)) + (matchCount as number)) %
          (matchCount as number)) +
        1
      : 0;
  const toggleClass = (on: boolean) =>
    `inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
      on
        ? "bg-primary-100 border-primary-300 text-primary-900"
        : "bg-background-50 border-background-200 text-foreground-600 hover:bg-background-100"
    }`;

  return (
    <section className="rounded-xl border border-background-200 bg-background-50 overflow-hidden">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-background-100/60 transition-colors cursor-pointer"
      >
        <span className="w-7 h-7 flex items-center justify-center rounded-md bg-secondary-100 text-secondary-900 flex-shrink-0">
          <i className="ri-find-replace-line"></i>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground-950">
            Find &amp; replace
          </span>
          <span className="block text-xs text-foreground-500">
            Exact, guaranteed text swaps — no AI rewrite.
          </span>
        </span>
        <span className="w-5 h-5 flex items-center justify-center text-foreground-500 flex-shrink-0">
          <i className={open ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}></i>
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-background-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-foreground-600">
                <span>Find</span>
                {find.trim().length > 0 && typeof matchCount === "number" && (
                  <span
                    className={`inline-flex items-center gap-1 whitespace-nowrap ${
                      matchCount > 0 ? "text-primary-700" : "text-foreground-400"
                    }`}
                  >
                    <i
                      className={
                        matchCount > 0
                          ? "ri-checkbox-multiple-line"
                          : "ri-close-circle-line"
                      }
                    ></i>
                    {matchCount} match{matchCount === 1 ? "" : "es"}
                  </span>
                )}
              </span>
              <input
                id={inputId}
                type="text"
                value={find}
                onChange={(e) => onFindChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (e.shiftKey) onPrevMatch();
                    else onNextMatch();
                  }
                }}
                placeholder="Text to find…"
                className="w-full px-3 py-2 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                Replace with
              </span>
              <input
                type="text"
                value={replace}
                onChange={(e) => onReplaceChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onSubmit();
                  }
                }}
                placeholder="Replacement…"
                className="w-full px-3 py-2 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
              />
            </label>
          </div>

          {matchContext && (
            <div className="rounded-lg border border-background-200 bg-background-100/60 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-foreground-500">
                  <i className="ri-text-wrap"></i>
                  Match context
                </span>
                <span className="text-[11px] font-semibold text-foreground-500 tabular-nums whitespace-nowrap">
                  Match {matchContext.index} of {matchContext.total}
                </span>
              </div>
              <p className="text-sm text-foreground-700 leading-[1.7] break-words">
                {matchContext.before}
                <mark className="bg-accent-200 text-accent-900 rounded px-0.5">
                  {matchContext.match}
                </mark>
                {matchContext.after}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center rounded-md border border-background-200 bg-background-50 overflow-hidden">
              <button
                type="button"
                onClick={onPrevMatch}
                disabled={!hasMatches}
                title="Previous match (Shift+Enter)"
                aria-label="Previous match"
                className="w-8 h-8 flex items-center justify-center text-foreground-600 hover:bg-background-100 hover:text-foreground-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <i className="ri-arrow-up-line"></i>
              </button>
              <span className="px-2 text-xs font-semibold text-foreground-700 whitespace-nowrap tabular-nums">
                {hasMatches ? `${currentMatch} / ${matchCount}` : "0 / 0"}
              </span>
              <button
                type="button"
                onClick={onNextMatch}
                disabled={!hasMatches}
                title="Next match (Enter)"
                aria-label="Next match"
                className="w-8 h-8 flex items-center justify-center text-foreground-600 hover:bg-background-100 hover:text-foreground-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <i className="ri-arrow-down-line"></i>
              </button>
            </div>
            <span className="text-xs text-foreground-500 whitespace-nowrap">
              Enter / Shift+Enter to step
            </span>
            <button
              type="button"
              onClick={() => onMatchCaseChange(!matchCase)}
              aria-pressed={matchCase}
              className={toggleClass(matchCase)}
            >
              <i className={matchCase ? "ri-checkbox-line" : "ri-checkbox-blank-line"}></i>
              Match case
            </button>
            <button
              type="button"
              onClick={() => onFirstOnlyChange(!firstOnly)}
              aria-pressed={firstOnly}
              className={toggleClass(firstOnly)}
            >
              <i className={firstOnly ? "ri-checkbox-line" : "ri-checkbox-blank-line"}></i>
              First only
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canReplace}
              className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              <i className={replacing ? "ri-loader-4-line animate-spin" : "ri-find-replace-line"}></i>
              {replacing ? "Replacing…" : "Replace"}
            </button>
            {find.trim().length === 0 && !replacing && (
              <span className="text-xs text-foreground-500 flex items-center gap-1.5">
                <i className="ri-information-line"></i>
                Type the text to find first.
              </span>
            )}
          </div>

          {preview && (
            <div className="rounded-lg border border-primary-200 bg-primary-100/60 px-3.5 py-3 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <span className="w-7 h-7 flex items-center justify-center rounded-md bg-primary-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
                  <i className="ri-find-replace-line"></i>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground-950">
                    {preview.count} occurrence{preview.count === 1 ? "" : "s"} matched — ready to replace
                  </p>
                  <p className="text-xs text-foreground-600 mt-0.5 break-words">
                    “{preview.find}” → “{preview.replace}”
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs text-foreground-600">
                    <span className="inline-flex items-center gap-1.5 bg-background-50 border border-background-200 rounded-md px-2 py-0.5">
                      <i className="ri-file-text-line text-foreground-400"></i>
                      Words
                      <span className="font-semibold text-foreground-900">{preview.beforeWords}</span>
                      <i className="ri-arrow-right-line text-foreground-400"></i>
                      <span className="font-semibold text-foreground-900">{preview.afterWords}</span>
                    </span>
                    {wordDelta !== 0 && (
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          wordDelta > 0 ? "text-accent-700" : "text-primary-700"
                        }`}
                      >
                        <i className={wordDelta > 0 ? "ri-add-line" : "ri-subtract-line"}></i>
                        {Math.abs(wordDelta)} word{Math.abs(wordDelta) === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {preview.lineChanges.length > 0 && (
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground-500">
                    <i className="ri-git-commit-line"></i>
                    What will change
                  </span>
                  <ul className="space-y-1.5">
                    {preview.lineChanges.map((line, index) => (
                      <li
                        key={index}
                        className="rounded-md border border-background-200 bg-background-50 px-2.5 py-1.5 space-y-0.5"
                      >
                        {line.before && (
                          <p className="flex items-start gap-1.5 text-xs text-foreground-500">
                            <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-accent-700">
                              <i className="ri-subtract-line"></i>
                            </span>
                            <span className="min-w-0 line-through break-words">
                              {line.before}
                            </span>
                          </p>
                        )}
                        {line.after && (
                          <p className="flex items-start gap-1.5 text-xs text-foreground-900">
                            <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-primary-700">
                              <i className="ri-add-line"></i>
                            </span>
                            <span className="min-w-0 break-words">{line.after}</span>
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={replacing}
                  className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                >
                  <i className={replacing ? "ri-loader-4-line animate-spin" : "ri-save-3-line"}></i>
                  {replacing ? "Saving…" : "Save version"}
                </button>
                <button
                  type="button"
                  onClick={onCancelPreview}
                  disabled={replacing}
                  className="inline-flex items-center gap-1.5 text-sm font-medium bg-background-50 border border-background-200 text-foreground-700 px-3.5 py-2 rounded-md hover:bg-background-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-close-line"></i>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {notice && (
            <div
              className={`flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-sm ${
                notice.tone === "success"
                  ? "bg-primary-100 text-primary-900"
                  : "bg-secondary-100 text-secondary-900"
              }`}
            >
              <i
                className={`mt-0.5 flex-shrink-0 ${
                  notice.tone === "success" ? "ri-check-line" : "ri-information-line"
                }`}
              ></i>
              <span className="min-w-0 flex-1">{notice.message}</span>
              <button
                type="button"
                onClick={onClearNotice}
                aria-label="Dismiss"
                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-foreground-950/10 transition-colors cursor-pointer flex-shrink-0"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-3.5 py-3 text-sm">
              <i className="ri-error-warning-line mt-0.5 flex-shrink-0"></i>
              <span className="min-w-0 flex-1">{error}</span>
              <button
                type="button"
                onClick={onRetry}
                disabled={replacing}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-900 underline hover:text-foreground-950 disabled:opacity-60 cursor-pointer whitespace-nowrap flex-shrink-0"
              >
                <i className="ri-refresh-line"></i>
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}