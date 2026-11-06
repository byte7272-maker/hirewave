interface SparseResumeHighlightsCtaProps {
  /** How many words the résumé currently holds — shown to frame the gap. */
  wordCount: number;
  /** Open the "My Work Highlights" wizard for this résumé. */
  onOpen: () => void;
}

/**
 * The empty / weak-résumé state: when a résumé is barely started, this makes
 * "My Work Highlights" the primary call to action, sitting above the editor so
 * the user's clearest next step is to import real accomplishments instead of
 * staring at a blank page. The wizard runs the same review-and-select flow and
 * the facts are previewed before anything is saved.
 */
export default function SparseResumeHighlightsCta({
  wordCount,
  onOpen,
}: SparseResumeHighlightsCtaProps) {
  return (
    <section className="animate-fade-in-up rounded-2xl border border-accent-200 bg-accent-50/70 p-5 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <span className="w-12 h-12 flex items-center justify-center rounded-xl bg-accent-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
          <i className="ri-sparkling-2-line text-2xl"></i>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-heading text-base md:text-lg font-medium text-foreground-950">
              This résumé looks sparse — fill it with your real work highlights
            </h2>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-900 bg-accent-100 px-2 py-0.5 rounded-full whitespace-nowrap">
              <i className="ri-file-text-line"></i>
              {wordCount} {wordCount === 1 ? "word" : "words"} so far
            </span>
          </div>
          <p className="mt-1 text-sm text-foreground-600 leading-relaxed max-w-[60ch]">
            Don&apos;t start from a blank page — pull real accomplishments from your work email
            &amp; chat and we&apos;ll turn them into polished bullets you review before anything is
            saved.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          title="Pull real accomplishments from your work email & chat into polished bullets"
          className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-accent-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-accent-600 transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
        >
          <i className="ri-sparkling-2-line"></i>
          Add from My Work Highlights
        </button>
      </div>
    </section>
  );
}