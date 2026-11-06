import { useMemo } from "react";
import type { ReviewResult, ReviewRating, ReviewSuggestion } from "@/lib/documents";
import GradeBadge from "./GradeBadge";
import ReadAloudControl from "@/components/feature/ReadAloudControl";
import NarrationText from "@/components/feature/NarrationText";
import GlossaryText from "@/components/feature/GlossaryText";
import { useGlossary } from "@/components/feature/GlossaryProvider";
import { collectGlossaryEntries } from "@/lib/glossary";

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  important: 1,
  suggestion: 2,
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  important: "Important",
  suggestion: "Suggestion",
};

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-accent-100 text-accent-900",
  important: "bg-secondary-100 text-secondary-900",
  suggestion: "bg-primary-100 text-primary-900",
};

/**
 * Findings that read as a weak or metric-less bullet — the moment of need where
 * importing the user's real work highlights is the one-click remedy. Matches on
 * the kind of advice the review gives when a bullet lacks measurable impact
 * ("Quantify impact", "weak verb", "no outcome", "add numbers", …).
 */
const HIGHLIGHTS_REMEDY_PATTERNS = [
  /quantif/i,
  /metric/i,
  /measur/i,
  /\bimpact\b/i,
  /\bnumbers?\b/i,
  /\bdata\b/i,
  /weak verb/i,
  /\bvague\b/i,
  /\boutcome/i,
  /\bresult/i,
  /\bachievement/i,
  /\baccomplish/i,
  /\bpassive\b/i,
];

/** True when a review finding points at a weak or metric-less bullet. */
function needsWorkHighlights(s: ReviewSuggestion): boolean {
  const text = `${s.title} ${s.detail}`;
  return HIGHLIGHTS_REMEDY_PATTERNS.some((re) => re.test(text));
}

interface JobOption {
  value: string;
  label: string;
}

interface ReviewPanelProps {
  review: ReviewResult | null;
  loading: boolean;
  error: string;
  onReview: () => void;
  jobOptions: JobOption[];
  jobId: string;
  onJobChange: (value: string) => void;
  hasContent: boolean;
  actionLabel?: string;
  contentSummaryLabel?: string;
  /** Hide the "What this résumé says" block when the page already shows it. */
  showContentSummary?: boolean;
  /** Base id for read-aloud controls on this panel's summaries. */
  readAloudId?: string;
  /**
   * True when the document has changed since the last review. Surfaces a
   * "Reassess" action so the summary can be refreshed on demand.
   */
  stale?: boolean;
  /** Re-run the review because the document changed — shares the page's review action. */
  onReassess?: () => void;
  /**
   * True while the SLOW narrative half of the review is still loading, after the
   * deterministic score is already on screen. Shows a small localized spinner in
   * the assessment / content-summary blocks, so a slow LLM never reads as a
   * frozen page — the score is already visible and the narrative fills in after.
   */
  narrativeLoading?: boolean;
  /**
   * One-click remedy for a weak / metric-less bullet finding: import the user's
   * real work highlights. When provided, qualifying suggestions grow an
   * "Add from My Work Highlights" button right where the gap is felt.
   */
  onImportHighlights?: () => void;
}

const selectCls =
  "w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300";

export default function ReviewPanel({
  review,
  loading,
  error,
  onReview,
  jobOptions,
  jobId,
  onJobChange,
  hasContent,
  actionLabel = "Review résumé",
  contentSummaryLabel = "What this résumé says",
  showContentSummary = true,
  readAloudId = "review",
  stale = false,
  onReassess,
  onImportHighlights,
  narrativeLoading = false,
}: ReviewPanelProps) {
  const { openTerm } = useGlossary();
  const sorted = review
    ? [...review.suggestions].sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
      )
    : [];

  // Every glossary term that actually shows up in this review's advice.
  const keyTerms = useMemo(() => {
    if (!review) return [];
    return collectGlossaryEntries([
      review.content_summary,
      review.summary,
      ...review.strengths,
      ...review.suggestions.flatMap((s) => [s.title, s.detail]),
      ...(review.ratings ?? []).map((r) => r.note),
    ]);
  }, [review]);

  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-300 overflow-hidden">
      <div className="px-5 py-4 border-b border-background-200">
        <h2 className="font-heading text-lg font-medium text-foreground-950 flex items-center gap-2">
          <i className="ri-sparkling-2-line text-primary-600"></i>
          AI Review
        </h2>
        <p className="text-xs text-foreground-500 mt-0.5">
          Get a plain-language assessment and a list of suggested changes.
        </p>
      </div>

      <div className="p-5 space-y-4">
        {jobOptions.length > 0 && (
          <div className="rounded-xl border border-background-200 bg-background-50 p-3.5">
            <label className="block">
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                Review against a job{" "}
                <span className="text-foreground-400 font-normal">(optional)</span>
              </span>
              <select
                value={jobId}
                onChange={(e) => onJobChange(e.target.value)}
                className={selectCls}
              >
                <option value="">General review</option>
                {jobOptions.map((j) => (
                  <option key={j.value} value={j.value}>
                    {j.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <button
          onClick={onReview}
          disabled={loading || !hasContent}
          className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
        >
          {loading ? (
            <>
              <i className="ri-loader-4-line animate-spin"></i>
              Reviewing…
            </>
          ) : (
            <>
              <i className="ri-sparkling-line"></i>
              {actionLabel}
            </>
          )}
        </button>

        {stale && onReassess && (
          <div className="rounded-lg bg-accent-50 border border-accent-200 border-l-4 border-l-accent-500 px-3.5 py-3 flex items-start justify-between gap-3 flex-wrap animate-fade-in-up">
            <p className="text-xs text-foreground-700 flex items-start gap-2 min-w-0 flex-1">
              <i className="ri-refresh-line text-accent-600 mt-0.5"></i>
              <span>
                This document changed since the last review — reassess for an updated summary.
              </span>
            </p>
            <button
              type="button"
              onClick={onReassess}
              disabled={loading || !hasContent}
              title="Re-run the AI review for an updated summary"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-background-50 dark:text-foreground-950 bg-accent-500 hover:bg-accent-600 px-3 py-1.5 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              {loading ? (
                <i className="ri-loader-4-line animate-spin"></i>
              ) : (
                <i className="ri-refresh-line"></i>
              )}
              {loading ? "Reassessing…" : "Reassess"}
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
            <i className="ri-error-warning-line text-base mt-0.5"></i>
            <span>{error}</span>
          </div>
        )}

        {review && !loading && (
          <div className="space-y-4 animate-fade-in-up">
            <ReviewHeadline review={review} />

            {keyTerms.length > 0 && (
              <div className="rounded-xl bg-background-50 border border-background-200 p-4">
                <div className="flex items-center gap-1.5">
                  <i className="ri-book-open-line text-accent-500 text-sm"></i>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-500">
                    Key terms
                  </h4>
                </div>
                <p className="mt-1 text-xs text-foreground-400">
                  Jargon from this advice — tap one to learn more.
                </p>
                <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                  {keyTerms.map((term) => (
                    <button
                      key={term.key}
                      type="button"
                      onClick={() => openTerm(term)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-secondary-900 bg-secondary-100 border border-secondary-200 hover:bg-secondary-200 px-2.5 py-1 rounded-full transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-question-line"></i>
                      {term.term}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <RatingsBreakdown ratings={review.ratings} />

            {showContentSummary && review.content_summary && (
              <div className="rounded-xl bg-background-50 border border-background-200 p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-500">
                    {contentSummaryLabel}
                  </h4>
                  <ReadAloudControl
                    id={`${readAloudId}-content`}
                    text={review.content_summary}
                    label="content summary"
                  />
                </div>
                <p className="mt-2 text-sm text-foreground-800 leading-[1.7] max-w-[68ch]">
                  <NarrationText id={`${readAloudId}-content`} text={review.content_summary} />
                </p>
              </div>
            )}

            {showContentSummary && !review.content_summary && narrativeLoading && (
              <div className="rounded-xl bg-background-50 border border-background-200 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-500">
                  {contentSummaryLabel}
                </h4>
                <p className="mt-2 text-sm text-foreground-500 inline-flex items-center gap-2">
                  <i className="ri-loader-4-line animate-spin"></i>
                  Analyzing…
                </p>
              </div>
            )}

            {typeof review.word_count === "number" && (
              <p className="text-xs text-foreground-500">
                {review.word_count} words
              </p>
            )}

            {review.summary ? (
              <div className="rounded-xl bg-background-50 border border-background-200 p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-500">
                    Assessment
                  </h4>
                  <ReadAloudControl
                    id={`${readAloudId}-assessment`}
                    text={review.summary}
                    label="review summary"
                  />
                </div>
                <p className="mt-2 text-sm text-foreground-800 leading-[1.7] max-w-[68ch]">
                  <NarrationText id={`${readAloudId}-assessment`} text={review.summary} />
                </p>
              </div>
            ) : narrativeLoading ? (
              <div className="rounded-xl bg-background-50 border border-background-200 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-500">
                  Assessment
                </h4>
                <p className="mt-2 text-sm text-foreground-500 inline-flex items-center gap-2">
                  <i className="ri-loader-4-line animate-spin"></i>
                  Analyzing…
                </p>
              </div>
            ) : null}

            {review.strengths.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-500">
                  Strengths
                </h4>
                <ul className="space-y-1.5">
                  {review.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground-800">
                      <i className="ri-checkbox-circle-line text-primary-600 text-base mt-0.5"></i>
                      <span>
                        <GlossaryText text={s} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {review.missing_keywords && review.missing_keywords.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-500">
                  <GlossaryText text="Missing keywords" />
                </h4>
                <p className="text-xs text-foreground-500 mt-1">
                  Add these if you genuinely have them — don&apos;t pad.
                </p>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {review.missing_keywords.map((k, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 text-xs font-medium text-accent-900 bg-accent-100 px-2.5 py-1 rounded-full whitespace-nowrap"
                    >
                      <i className="ri-add-line"></i>
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {sorted.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-500">
                  Suggestions
                </h4>
                {sorted.map((s, i) => (
                  <div
                    key={i}
                    className="rounded-xl bg-background-50 border border-background-200 p-4"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                          SEVERITY_TONE[s.severity] ?? "bg-background-200 text-foreground-700"
                        }`}
                      >
                        {SEVERITY_LABEL[s.severity] ?? s.severity}
                      </span>
                      <span className="inline-flex items-center text-xs font-medium text-foreground-600 bg-background-200/70 px-2 py-0.5 rounded-full whitespace-nowrap">
                        {s.category}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-foreground-900">
                      <GlossaryText text={s.title} />
                    </p>
                    <p className="mt-1 text-sm text-foreground-600 leading-relaxed">
                      <GlossaryText text={s.detail} />
                    </p>
                    {onImportHighlights && needsWorkHighlights(s) && (
                      <button
                        type="button"
                        onClick={onImportHighlights}
                        title="Pull real accomplishments from your work email & chat into polished bullets"
                        className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-background-50 dark:text-foreground-950 bg-accent-500 hover:bg-accent-600 px-3 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-sparkling-2-line"></i>
                        Add from My Work Highlights
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function gradeSolidTone(grade: string) {
  const g = (grade || "").trim().toUpperCase();
  if (g.startsWith("A")) return "bg-primary-500 text-background-50 dark:text-foreground-950";
  if (g.startsWith("B")) return "bg-secondary-500 text-background-50 dark:text-foreground-950";
  return "bg-accent-500 text-background-50 dark:text-foreground-950";
}

function barTone(score: number) {
  if (score >= 75) return { bar: "bg-primary-500" };
  if (score >= 50) return { bar: "bg-secondary-500" };
  return { bar: "bg-accent-500" };
}

function ReviewHeadline({ review }: { review: ReviewResult }) {
  const grade = (review.grade || "").trim().toUpperCase() || null;
  const score = Math.round(review.score || 0);
  return (
    <div className="flex items-center gap-4">
      <div
        className={`w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 ${
          grade ? gradeSolidTone(grade) : "bg-background-200 text-foreground-700"
        }`}
      >
        <span className="font-heading text-3xl font-semibold">{grade ?? score}</span>
      </div>
      <div className="flex-1 min-w-0">
        <span className="block text-xs font-medium text-foreground-500">Quality rating</span>
        <div className="flex items-baseline gap-1">
          <span className="font-heading text-3xl font-medium text-foreground-950">{score}</span>
          <span className="text-sm text-foreground-400">/100</span>
        </div>
      </div>
    </div>
  );
}

function RatingsBreakdown({ ratings }: { ratings?: ReviewRating[] }) {
  if (!ratings || ratings.length === 0) return null;
  return (
    <div className="space-y-2.5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-500">
        Rating breakdown
      </h4>
      <div className="space-y-2">
        {ratings.map((r, i) => {
          const clamped = Math.max(0, Math.min(100, Math.round(r.score || 0)));
          const tone = barTone(clamped);
          return (
            <div key={i} className="rounded-xl bg-background-50 border border-background-200 p-3.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground-900 flex-1 min-w-0 truncate">
                  {r.standard}
                </span>
                <GradeBadge grade={r.grade} score={r.score} />
              </div>
              <div className="mt-2 w-full h-1.5 rounded-full bg-background-200 overflow-hidden">
                <div
                  className={`h-full ${tone.bar} rounded-full transition-all duration-500`}
                  style={{ width: `${clamped}%` }}
                />
              </div>
              {r.note && (
                <p className="mt-2 text-xs text-foreground-500 leading-relaxed">
                  <GlossaryText text={r.note} />
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}