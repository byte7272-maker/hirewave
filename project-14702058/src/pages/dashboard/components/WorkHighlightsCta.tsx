import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listResumes, type Resume } from "@/lib/documents";
import useRefreshOnFocus from "@/hooks/useRefreshOnFocus";
import {
  dismissWorkHighlightsCta,
  shouldShowWorkHighlightsCta,
  type WorkHighlightsCtaFingerprint,
} from "@/lib/workHighlightsCtaMemory";

/**
 * Dashboard contextual nudge: "Strengthen your résumé: import your work
 * highlights".
 *
 * It only appears when it can actually help — the user has no résumé yet, or a
 * résumé is thin / low-grade (unscored or below the quality bar), or a résumé
 * has no saved versions. It's dismissible, but the dismissal is keyed to the
 * résumé need at that moment (a fingerprint), so the card stays quiet while the
 * need is unchanged and re-surfaces if a résumé's grade later drops or a new thin
 * résumé appears — instead of being gone for good. It re-checks when the tab
 * regains focus, so a grade change made elsewhere shows up on return, and opens
 * the same "My Work Highlights" flow as everywhere else, which routes into the
 * editor so the imported facts go through the review-and-accept save path.
 */
export default function WorkHighlightsCta() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [fingerprint, setFingerprint] = useState<WorkHighlightsCtaFingerprint | null>(
    null
  );

  /** Re-check whether the card should be showing, from the live résumé list. */
  const load = useCallback(async () => {
    try {
      const list: Resume[] = (await listResumes({ archived: false })) ?? [];
      if (!isThinOrEmpty(list)) {
        setVisible(false);
        setFingerprint(null);
        return;
      }
      const fp = fingerprintFor(list);
      setFingerprint(fp);
      setVisible(shouldShowWorkHighlightsCta(fp));
    } catch {
      /* best-effort nudge — a failed load simply hides the card */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-check when the user comes back to this tab, so a grade that dropped
  // elsewhere (an edit / re-review in another tab) re-surfaces the card at once.
  useRefreshOnFocus(load);

  if (!visible) return null;

  function handleDismiss() {
    if (fingerprint) dismissWorkHighlightsCta(fingerprint);
    setVisible(false);
  }

  return (
    <section className="animate-fade-in-up">
      <div className="rounded-2xl border border-accent-200 bg-accent-50/70 p-4 sm:p-5 flex items-start sm:items-center gap-3 sm:gap-4">
        <span className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl bg-accent-500 text-background-50 dark:text-foreground-950">
          <i className="ri-sparkling-2-line text-xl"></i>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground-950">
            Strengthen your résumé: import your work highlights
          </p>
          <p className="mt-0.5 text-xs text-foreground-600 leading-relaxed">
            Pull real accomplishments from your work email &amp; chat into polished bullets —
            you review them before anything is saved.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => navigate("/dashboard/experience")}
            title="Pull real accomplishments from your work email & chat into polished bullets"
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-accent-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-accent-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-sparkling-2-line"></i>
            Import highlights
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss this suggestion"
            title="Dismiss"
            className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-accent-100 hover:text-foreground-900 transition-colors cursor-pointer flex-shrink-0"
          >
            <i className="ri-close-line"></i>
          </button>
        </div>
      </div>
    </section>
  );
}

/** A résumé is "thin" when it's unscored / low-grade, or has no saved versions. */
function isThinResume(r: Resume): boolean {
  const score = typeof r.quality_score === "number" ? r.quality_score : null;
  const lowGrade = score === null || score < 70;
  const noSavedVersions = (r.versions?.length ?? 0) <= 1;
  return lowGrade || noSavedVersions;
}

/**
 * The card is worth showing when there is no résumé yet, or any active résumé is
 * thin (unscored / below the quality bar) or still has no saved versions.
 */
function isThinOrEmpty(list: Resume[]): boolean {
  return list.length === 0 || list.some(isThinResume);
}

/**
 * A snapshot of how much the user needs the card, so a dismissal can decide
 * whether a later change made things worse. `worstScore` is the lowest grade
 * across the active résumés (unscored counts as 0 = worst; null when none yet).
 */
function fingerprintFor(list: Resume[]): WorkHighlightsCtaFingerprint {
  if (list.length === 0) return { worstScore: null, thinCount: 0 };
  let worstScore = Number.POSITIVE_INFINITY;
  let thinCount = 0;
  for (const r of list) {
    const score = typeof r.quality_score === "number" ? r.quality_score : 0;
    if (score < worstScore) worstScore = score;
    if (isThinResume(r)) thinCount += 1;
  }
  return { worstScore, thinCount };
}