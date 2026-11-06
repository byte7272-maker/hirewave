import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@/lib/api";
import {
  CLIENT_ONLY_STEPS,
  markCtaPending,
  orderSteps,
  resolveResumeKey,
  setOnboardingDismissed,
  setOnboardingStepStatus,
  stepCopy,
  withWorkHighlightsStep,
  type OnboardingStep,
  type OnboardingView,
} from "@/lib/onboarding";
import { useBrandName } from "@/hooks/useBranding";

interface OnboardingWizardProps {
  view: OnboardingView;
  onClose: () => void;
  onViewChange: (view: OnboardingView) => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** A numbered step in the progress rail. */
function RailItem({
  step,
  index,
  active,
  onSelect,
}: {
  step: OnboardingStep;
  index: number;
  active: boolean;
  onSelect: (key: string) => void;
}) {
  const brandName = useBrandName();
  const copy = stepCopy(step.key, brandName);
  return (
    <button
      type="button"
      onClick={() => onSelect(step.key)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors cursor-pointer ${
        active ? "bg-primary-100 text-primary-900" : "text-foreground-700 hover:bg-background-100"
      }`}
    >
      <span
        className={`w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-semibold flex-shrink-0 ${
          step.done
            ? "bg-primary-500 text-background-50"
            : active
              ? "bg-primary-200 text-primary-800"
              : "bg-background-200 text-foreground-500"
        }`}
      >
        {step.done ? <i className="ri-check-line text-xs"></i> : index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium truncate">{copy.title}</span>
        {step.done && (
          <span className="flex items-center gap-1 text-[11px] text-primary-600 mt-0.5">
            <i className={step.detected ? "ri-magic-line" : "ri-check-double-line"}></i>
            {step.detected ? "Auto-detected" : "Marked done"}
          </span>
        )}
      </span>
    </button>
  );
}

export default function OnboardingWizard({
  view,
  onClose,
  onViewChange,
}: OnboardingWizardProps) {
  const brandName = useBrandName();
  // Inject the client-side "Add your work highlights" step when the backend view
  // doesn't include it, so new users hit it between the résumé upload and matches.
  const steps = useMemo(() => withWorkHighlightsStep(view.steps ?? []), [view.steps]);
  const coreSteps = useMemo(() => steps.filter((s) => s.core), [steps]);
  const moreSteps = useMemo(() => steps.filter((s) => !s.core), [steps]);
  const ordered = useMemo(() => orderSteps(steps), [steps]);
  const allCoreDone = coreSteps.length > 0 && coreSteps.every((s) => s.done);
  const allDone = ordered.length > 0 && ordered.every((s) => s.done);

  const [activeKey, setActiveKey] = useState<string>(() => resolveResumeKey(view));
  const [showDone, setShowDone] = useState<boolean>(allDone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef<string>("");

  // Best-effort: tell the backend the user opened this step so its pointer
  // (resume_step) follows them. The response advances resume_step past any
  // completed steps, so we simply adopt the refreshed view — no client guessing.
  useEffect(() => {
    if (!activeKey || showDone) return;
    if (startedRef.current === activeKey) return;
    // Client-only steps aren't tracked by the backend — never PUT for them.
    if (CLIENT_ONLY_STEPS.has(activeKey)) return;
    startedRef.current = activeKey;
    setOnboardingStepStatus(activeKey, "started")
      .then((next) => {
        if (next) onViewChange(next);
      })
      .catch(() => {
        /* non-blocking */
      });
  }, [activeKey, showDone, onViewChange]);

  // Esc to close + focus trap + restore focus on unmount.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    firstFocusable?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const activeIndex = ordered.findIndex((s) => s.key === activeKey);
  const activeStep = activeIndex >= 0 ? ordered[activeIndex] : ordered[0];

  // Header progress meter — mirrors the launcher bar (core completion).
  const corePercent = Math.min(100, Math.max(0, view.percent ?? 0));
  const activeCoreIndex = coreSteps.findIndex((s) => s.key === activeStep?.key);
  const currentStepNumber = activeCoreIndex >= 0 ? activeCoreIndex + 1 : coreSteps.length || 1;

  const goTo = useCallback(
    (key: string) => {
      setShowDone(false);
      setActiveKey(key);
    },
    [],
  );

  /** After a status change, follow the server's resume_step to the next step. */
  const advanceToResume = useCallback((nextView: OnboardingView) => {
    const list = nextView.steps ?? [];
    const everythingDone = list.length > 0 && list.every((s) => s.done);
    if (everythingDone) {
      setShowDone(true);
      return;
    }
    const target = resolveResumeKey(nextView);
    if (target) {
      setShowDone(false);
      setActiveKey(target);
    } else {
      setShowDone(true);
    }
  }, []);

  async function applyStatus(status: "completed" | "dismissed") {
    if (!activeStep || saving) return;
    // A client-only step advances locally — the backend doesn't know its key.
    if (CLIENT_ONLY_STEPS.has(activeStep.key)) {
      setError("");
      const idx = ordered.findIndex((s) => s.key === activeStep.key);
      if (idx >= 0 && idx < ordered.length - 1) {
        goTo(ordered[idx + 1].key);
      } else {
        setShowDone(true);
      }
      return;
    }
    setSaving(true);
    setError("");
    try {
      const next = await setOnboardingStepStatus(activeStep.key, status);
      if (next) {
        onViewChange(next);
        advanceToResume(next);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update this step.");
    } finally {
      setSaving(false);
    }
  }

  async function handleFinishLater() {
    try {
      const next = await setOnboardingDismissed(true);
      if (next) onViewChange(next);
    } catch {
      // Even if the dismiss call fails, close the dialog.
    } finally {
      onClose();
    }
  }

  const copy = activeStep ? stepCopy(activeStep.key, brandName) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4">
      <div
        className="absolute inset-0 bg-foreground-950/50 dark:bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      ></div>

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Finish your setup"
        className="relative w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-4xl bg-background-50 sm:rounded-2xl border border-background-200 animate-fade-in-up flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary-100 text-primary-700">
              <i className="ri-flag-line text-lg"></i>
            </span>
            <div>
              <h3 className="font-heading text-lg font-medium text-foreground-950">
                Finish your setup
              </h3>
              {coreSteps.length > 0 && (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="w-28 h-1.5 bg-background-200 rounded-full overflow-hidden">
                    <span
                      className="block h-full bg-primary-500 rounded-full transition-all duration-500"
                      style={{ width: `${corePercent}%` }}
                    ></span>
                  </span>
                  <span className="text-xs text-foreground-500 whitespace-nowrap">
                    Step {currentStepNumber} of {coreSteps.length}
                  </span>
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 cursor-pointer flex-shrink-0"
            aria-label="Close"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* Progress rail */}
          <aside className="lg:w-72 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-background-200 bg-background-100/50 p-4 overflow-y-auto">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-400 px-3 mb-2">
              Essentials
            </p>
            <div className="space-y-1">
              {coreSteps.map((step, i) => (
                <RailItem
                  key={step.key}
                  step={step}
                  index={i}
                  active={!showDone && step.key === activeStep?.key}
                  onSelect={goTo}
                />
              ))}
            </div>

            {/* Non-core steps unlock once the essentials are done. */}
            {allCoreDone && moreSteps.length > 0 && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setMoreOpen((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-[11px] font-semibold uppercase tracking-wide text-foreground-400 hover:text-foreground-700 cursor-pointer"
                >
                  More options
                  <i className={moreOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}></i>
                </button>
                {moreOpen && (
                  <div className="space-y-1">
                    {moreSteps.map((step, i) => (
                      <RailItem
                        key={step.key}
                        step={step}
                        index={coreSteps.length + i}
                        active={!showDone && step.key === activeStep?.key}
                        onSelect={goTo}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </aside>

          {/* Main panel */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5 md:p-7">
            {error && (
              <div className="mb-4 flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
                <i className="ri-error-warning-line text-base mt-0.5"></i>
                <span className="flex-1">{error}</span>
              </div>
            )}

            {showDone ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-6">
                <div className="w-16 h-16 flex items-center justify-center rounded-full bg-accent-100 text-accent-700">
                  <i className="ri-check-line text-3xl"></i>
                </div>
                <h4 className="font-heading text-xl font-medium text-foreground-950 mt-4">
                  You&rsquo;ve finished the essentials!
                </h4>
                <p className="text-sm text-foreground-600 mt-2 max-w-md leading-relaxed">
                  Nice work — your core setup is done. You can head to your dashboard now, or go
                  a little further to get even more out of {brandName}.
                </p>
                {moreSteps.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(true);
                      const first = moreSteps[0];
                      if (first) goTo(first.key);
                    }}
                    className="mt-5 inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-add-circle-line"></i>
                    Explore more options
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-3 text-sm font-semibold text-foreground-600 hover:text-foreground-900 px-4 py-2 rounded-md hover:bg-background-100 cursor-pointer whitespace-nowrap"
                >
                  Back to dashboard
                </button>
              </div>
            ) : activeStep && copy ? (
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-400">
                    Step {Math.max(1, activeIndex + 1)} of {ordered.length}
                  </span>
                  {activeStep.done && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary-100 text-primary-800 whitespace-nowrap">
                      <i className="ri-check-line"></i>
                      {activeStep.detected ? "Auto-detected" : "Marked done"}
                    </span>
                  )}
                </div>

                <span className="mt-4 w-14 h-14 flex items-center justify-center rounded-2xl bg-primary-100 text-primary-700">
                  <i className={`${copy.icon} text-2xl`}></i>
                </span>

                <h4 className="font-heading text-xl md:text-2xl font-medium text-foreground-950 mt-4">
                  {copy.title}
                </h4>
                <p className="text-sm text-foreground-600 mt-2 leading-relaxed">
                  {copy.description}
                </p>

                {activeStep.done ? (
                  <div className="mt-6 rounded-xl bg-primary-100/60 border border-primary-200 px-4 py-3 flex items-start gap-2.5">
                    <i className="ri-checkbox-circle-fill text-primary-600 mt-0.5"></i>
                    <p className="text-sm text-foreground-700">
                      You&rsquo;re already set here — feel free to revisit anytime.
                    </p>
                  </div>
                ) : (
                  <p className="mt-6 text-xs text-foreground-500 flex items-center gap-1.5">
                    <i className="ri-information-line"></i>
                    We&rsquo;ll detect it automatically once it&rsquo;s done — or you can mark it
                    yourself below.
                  </p>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Link
                    to={copy.route}
                    onClick={() => {
                      // Remember the hand-off so the wizard can auto-detect this
                      // step's completion when the user comes back.
                      if (!activeStep.done) markCtaPending(activeStep.key);
                      onClose();
                    }}
                    className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className={activeStep.done ? "ri-external-link-line" : "ri-arrow-right-line"}></i>
                    {activeStep.done ? `Open ${copy.ctaLabel.toLowerCase()}` : copy.ctaLabel}
                  </Link>
                  {!activeStep.done && (
                    <>
                      <button
                        type="button"
                        onClick={() => applyStatus("completed")}
                        disabled={saving}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700 border border-primary-200 bg-primary-100/50 px-4 py-2.5 rounded-md hover:bg-primary-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                      >
                        {saving ? (
                          <i className="ri-loader-4-line animate-spin"></i>
                        ) : (
                          <i className="ri-check-line"></i>
                        )}
                        Mark done
                      </button>
                      <button
                        type="button"
                        onClick={() => applyStatus("dismissed")}
                        disabled={saving}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-foreground-600 px-4 py-2.5 rounded-md hover:bg-background-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-skip-forward-line"></i>
                        Skip
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center py-10 text-center">
                <p className="text-sm text-foreground-500">
                  You&rsquo;re all set — nothing left to finish.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-background-200 flex items-center justify-between gap-3 flex-shrink-0 flex-wrap">
          <button
            type="button"
            onClick={handleFinishLater}
            className="text-sm font-semibold text-foreground-600 hover:text-foreground-900 px-3 py-2 rounded-md hover:bg-background-100 cursor-pointer whitespace-nowrap"
          >
            I&rsquo;ll finish later
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (showDone) {
                  setShowDone(false);
                  return;
                }
                if (activeIndex > 0) goTo(ordered[activeIndex - 1].key);
              }}
              disabled={!showDone && activeIndex <= 0}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground-700 border border-background-200 px-4 py-2.5 rounded-md hover:bg-background-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              <i className="ri-arrow-left-line"></i>
              Back
            </button>
            {allCoreDone && !showDone ? (
              <button
                type="button"
                onClick={() => setShowDone(true)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-flag-2-line"></i>
                Finish
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (showDone) return;
                  if (activeIndex >= 0 && activeIndex < ordered.length - 1) {
                    goTo(ordered[activeIndex + 1].key);
                  }
                }}
                disabled={showDone || activeIndex >= ordered.length - 1}
                className="inline-flex items-center gap-1.5 text-sm font-semibold border border-background-200 text-foreground-800 px-4 py-2.5 rounded-md hover:bg-background-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                Next
                <i className="ri-arrow-right-line"></i>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}