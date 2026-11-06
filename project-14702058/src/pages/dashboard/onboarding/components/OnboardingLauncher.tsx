import { useState } from "react";
import {
  orderedStepsWithHighlights,
  resolveResumeKey,
  setOnboardingDismissed,
  stepCopy,
} from "@/lib/onboarding";
import { useBrandName } from "@/hooks/useBranding";
import { useOnboarding } from "@/pages/dashboard/onboarding/OnboardingProvider";

/**
 * Slim, dismissible setup launcher for the dashboard home. Replaces the old
 * inline checklist — it only appears while setup is unfinished and not
 * dismissed, and opens the wizard dialog when clicked.
 */
export default function OnboardingLauncher() {
  const { view, open, refresh } = useOnboarding();
  const brandName = useBrandName();
  const [dismissing, setDismissing] = useState(false);

  if (!view || view.dismissed || (view.percent ?? 0) >= 100) return null;

  const coreCompleted = view.core_completed ?? 0;
  const coreTotal = view.core_total ?? 0;
  const percent = Math.min(100, Math.max(0, view.percent ?? 0));
  const resumeKey = resolveResumeKey(view);
  const resumeTitle = resumeKey ? stepCopy(resumeKey, brandName).title : "";
  const firstStepKey = orderedStepsWithHighlights(view)[0]?.key ?? "";
  // "Start here" when there's no real progress yet, otherwise "continue" wording.
  const resuming = Boolean(view.resume_step) && view.resume_step !== firstStepKey;

  async function handleDismiss() {
    if (dismissing) return;
    setDismissing(true);
    try {
      await setOnboardingDismissed(true);
    } catch {
      // Dismiss is best-effort; refresh still reconciles with the server.
    } finally {
      setDismissing(false);
      refresh();
    }
  }

  return (
    <section className="animate-fade-in-up">
      <div className="rounded-2xl bg-background-50 border border-background-200 p-3.5 sm:p-4 flex items-center gap-3 sm:gap-4">
        <span className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl bg-primary-100 text-primary-700">
          <i className="ri-flag-line text-xl"></i>
        </span>

        <button
          type="button"
          onClick={open}
          className="flex-1 min-w-0 text-left cursor-pointer group"
        >
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground-950 group-hover:text-primary-700 transition-colors">
              Finish setting up
            </span>
            <span className="text-xs text-foreground-500">
              {coreCompleted} of {coreTotal} essentials done
            </span>
          </span>
          <span className="mt-2 block h-1.5 max-w-sm bg-background-200 rounded-full overflow-hidden">
            <span
              className="block h-full bg-primary-500 rounded-full transition-all duration-500"
              style={{ width: `${percent}%` }}
            ></span>
          </span>
          {resumeTitle && (
            <span className="mt-1.5 flex items-center gap-1.5 text-xs text-foreground-500">
              <i className={resuming ? "ri-history-line" : "ri-play-circle-line"}></i>
              {resuming ? "Continue where you left off — " : "Start here — "}
              {resumeTitle}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={open}
          className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
        >
          Continue
          <i className="ri-arrow-right-line"></i>
        </button>

        <button
          type="button"
          onClick={handleDismiss}
          disabled={dismissing}
          aria-label="Dismiss setup checklist"
          title="Dismiss for now"
          className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-md text-foreground-400 hover:bg-background-100 hover:text-foreground-700 transition-colors cursor-pointer disabled:opacity-50"
        >
          <i className={dismissing ? "ri-loader-4-line animate-spin" : "ri-close-line"}></i>
        </button>
      </div>
    </section>
  );
}