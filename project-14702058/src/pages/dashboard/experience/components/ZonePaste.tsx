import { useState } from "react";
import { ApiError } from "@/lib/api";
import {
  suggestResumeHighlights,
  tailorErrorMessage,
  type HighlightSuggestion,
} from "@/lib/documents";

interface ZonePasteProps {
  resumeId: string | number;
  jobPostingId?: string;
  pasted: string;
  onPastedChange: (value: string) => void;
  /** Hand the proposed edits to Zone C (the review zone) and scroll the user to it. */
  onSuggested: (suggestions: HighlightSuggestion[]) => void;
}

/**
 * Zone B — Paste results & propose edits. The user pastes whatever their company
 * AI returned; "Turn into edits" runs the suggest endpoint against the current
 * résumé and drops reviewable add / remove / reword edits into Zone C below.
 *
 * Nothing is saved here — the edits are only proposed. An empty paste is refused
 * with a friendly nudge before any call (the API also rejects it with a 400).
 */
export default function ZonePaste({
  resumeId,
  jobPostingId,
  pasted,
  onPastedChange,
  onSuggested,
}: ZonePasteProps) {
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState("");

  async function handleSuggest() {
    if (!pasted.trim()) {
      setError("Paste the output from your work AI first.");
      return;
    }
    setSuggesting(true);
    setError("");
    try {
      const result = await suggestResumeHighlights(resumeId, pasted, jobPostingId);
      if (!result.suggestions.length) {
        setError(
          "We couldn't find any clear edits in that text. Paste more detail from your work AI and try again."
        );
        return;
      }
      onSuggested(result.suggestions);
    } catch (err) {
      // A 400 is the API's own "empty / unusable paste" refusal — surface its
      // message directly so the user gets the exact guidance.
      if (err instanceof ApiError && err.status === 400) {
        setError(err.message || "Paste the output from your work AI first.");
      } else {
        setError(tailorErrorMessage(err, "résumé"));
      }
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <section
      id="my-work-highlights-paste"
      className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden scroll-mt-32"
    >
      <div className="flex items-start gap-3 px-5 py-4 border-b border-background-200">
        <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-accent-100 text-accent-700 flex-shrink-0">
          <i className="ri-clipboard-line text-lg"></i>
        </span>
        <div className="min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-400">
            Zone B
          </span>
          <h2 className="font-heading text-base font-medium text-foreground-950">
            Paste what your assistant returned
          </h2>
          <p className="text-xs text-foreground-500 mt-0.5">
            Drop in the answer — bullets, a list, or a paragraph. We&rsquo;ll turn it into
            reviewable edits against your résumé.
          </p>
        </div>
      </div>

      <div className="p-5 space-y-3">
        <textarea
          value={pasted}
          onChange={(e) => onPastedChange(e.target.value)}
          rows={8}
          placeholder="Paste everything the assistant gave you here…"
          className="w-full px-3.5 py-3 rounded-lg bg-background-50 border border-background-300 text-sm text-foreground-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 resize-y"
        />

        {error && (
          <div className="rounded-lg bg-accent-50 border border-accent-200 border-l-4 border-l-accent-500 px-3.5 py-3 flex items-start gap-3">
            <span className="w-7 h-7 flex items-center justify-center rounded-md bg-accent-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
              <i className="ri-error-warning-line"></i>
            </span>
            <p className="text-sm text-foreground-800">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-foreground-500 flex items-center gap-1.5">
            <i className="ri-information-line"></i>
            Nothing is saved until you review and accept the edits.
          </p>
          <button
            type="button"
            onClick={handleSuggest}
            disabled={suggesting}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
          >
            {suggesting ? (
              <>
                <i className="ri-loader-4-line animate-spin"></i>
                Finding edits…
              </>
            ) : (
              <>
                <i className="ri-sparkling-line"></i>
                Turn into edits
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}