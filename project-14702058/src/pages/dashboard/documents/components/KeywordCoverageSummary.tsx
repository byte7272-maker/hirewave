import GlossaryText from "@/components/feature/GlossaryText";

interface KeywordCoverageSummaryProps {
  /** The gaps captured during the tailoring analysis (résumé gaps / cover-letter missing points). */
  gaps: string[];
  /** The saved document text to measure the gaps against. */
  text: string;
  /** What to call the gaps in the copy, e.g. "gaps" or "missing points". */
  label?: string;
  /** Optional display label for the job the version was tailored to. */
  jobLabel?: string | null;
  /** When provided, "Still missing" chips become buttons that insert the term into the editor. */
  onInsert?: (keyword: string) => void;
  /** When provided, the summary can be pinned as a one-line note onto the saved version. */
  onSaveNote?: (note: string) => void;
  onDismiss: () => void;
}

/**
 * Before/after summary shown once a tailored version is saved: how many of the
 * job's gaps are now present in the saved document, e.g. "3 of 5 gaps now covered".
 */
export default function KeywordCoverageSummary({
  gaps,
  text,
  label = "gaps",
  jobLabel = null,
  onInsert,
  onSaveNote,
  onDismiss,
}: KeywordCoverageSummaryProps) {
  const total = gaps.length;
  if (total === 0) return null;

  const haystack = (text ?? "").toLowerCase();
  const covered: string[] = [];
  const missing: string[] = [];
  for (const gap of gaps) {
    if (haystack.includes(gap.toLowerCase())) covered.push(gap);
    else missing.push(gap);
  }
  const pct = Math.round((covered.length / total) * 100);
  const noteText = jobLabel
    ? `Tailored to ${jobLabel} \u2014 ${covered.length} of ${total} ${label} covered`
    : `${covered.length} of ${total} ${label} covered`;

  return (
    <section className="rounded-2xl bg-primary-50 border border-primary-200 overflow-hidden animate-fade-in-up">
      <div className="px-5 py-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-base font-medium text-foreground-950 flex items-center gap-2">
            <i className="ri-checkbox-circle-line text-primary-600"></i>
            <GlossaryText text="Tailoring result" />
          </h3>
          <p className="text-xs text-foreground-500 mt-0.5">
            {jobLabel
              ? `Saved as a version tailored to ${jobLabel}.`
              : "Saved as a new tailored version."}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-foreground-500 hover:text-foreground-900 hover:bg-background-100 cursor-pointer flex-shrink-0"
        >
          <i className="ri-close-line"></i>
        </button>
      </div>

      <div className="px-5 pb-5 space-y-4">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <span className="font-heading text-2xl font-semibold text-foreground-950">
            {covered.length} of {total}
          </span>
          <span className="text-sm text-foreground-600">
            <GlossaryText text={label} /> now covered
          </span>
        </div>

        <div className="w-full h-2 rounded-full bg-background-200 overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        {covered.length > 0 && (
          <div>
            <span className="block text-xs font-medium text-foreground-500 mb-1.5">
              Now covered
            </span>
            <div className="flex flex-wrap gap-1.5">
              {covered.map((k, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary-900 bg-primary-100 px-2.5 py-1 rounded-full whitespace-nowrap"
                >
                  <i className="ri-check-line"></i>
                  {k}
                </span>
              ))}
            </div>
          </div>
        )}

        {missing.length > 0 && (
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs font-medium text-foreground-500">
                Still missing
              </span>
              {onInsert && (
                <span className="text-[11px] text-foreground-400">
                  Tap a term to add it to your document
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {onInsert
                ? missing.map((k, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onInsert(k)}
                      title={`Add \u201c${k}\u201d to your document`}
                      className="group inline-flex items-center gap-1 text-xs font-medium text-accent-900 bg-accent-100 px-2.5 py-1 rounded-full border border-accent-200 hover:bg-accent-200 hover:border-accent-300 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-add-line group-hover:rotate-90 transition-transform"></i>
                      {k}
                    </button>
                  ))
                : missing.map((k, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 text-xs font-medium text-accent-900 bg-accent-100 px-2.5 py-1 rounded-full whitespace-nowrap"
                    >
                      <i className="ri-close-line"></i>
                      {k}
                    </span>
                  ))}
            </div>
          </div>
        )}

        {onSaveNote && (
          <div className="pt-1 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[11px] text-foreground-400 inline-flex items-center gap-1">
              <i className="ri-sticky-note-line"></i>
              Pin this as a note on the saved version
            </span>
            <button
              type="button"
              onClick={() => onSaveNote(noteText)}
              title={noteText}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-background-50 text-foreground-900 border border-background-200 px-3 py-1.5 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-bookmark-line"></i>
              Save one-line note
            </button>
          </div>
        )}
      </div>
    </section>
  );
}