import { api } from "./api";

// ---- Types ----

export interface OnboardingStep {
  key: string;
  /** Core steps count toward the essential progress bar; the rest are "more options". */
  core: boolean;
  /** A step is done when it was auto-detected or explicitly marked completed. */
  done: boolean;
  /** True when the backend detected the step was completed without the user marking it. */
  detected: boolean;
  /** The user's explicit override, if any ("completed" | "dismissed" | "started"). */
  marked: string;
}

export interface OnboardingView {
  dismissed: boolean;
  core_total: number;
  core_completed: number;
  /** Essential progress, 0–100. */
  percent: number;
  steps: OnboardingStep[];
  /**
   * Server-suggested step to open at. Already advances past completed steps, so
   * it points at the next unfinished one; "" means start from the first step.
   */
  resume_step?: string;
}

export type OnboardingStepStatus = "started" | "completed" | "dismissed";

// ---- API calls ----

export function getOnboarding() {
  return api<OnboardingView>("/api/v1/onboarding");
}

/** Hide or restore the whole setup wizard. */
export function setOnboardingDismissed(dismissed: boolean) {
  return api<OnboardingView>("/api/v1/onboarding", {
    method: "PUT",
    body: { dismissed },
  });
}

/** Override a single step's status. Returns the refreshed view. */
export function setOnboardingStepStatus(key: string, status: OnboardingStepStatus) {
  return api<OnboardingView>(`/api/v1/onboarding/${key}`, {
    method: "PUT",
    body: { status },
  });
}

/**
 * Backwards-compatible helper retained for the standalone highlight/resume
 * wizards, which dismiss their own step when the user skips.
 */
export function dismissOnboardingStep(key: string) {
  return setOnboardingStepStatus(key, "dismissed");
}

// ---- Client-side step copy (titles, descriptions, CTA routes) ----

export interface StepCopy {
  title: string;
  description: string;
  ctaLabel: string;
  route: string;
  icon: string;
}

/** Placeholder in step copy, swapped for the live brand name when it is read. */
const BRAND_TOKEN = "{brand}";

export const STEP_COPY: Record<string, StepCopy> = {
  profile: {
    title: "Complete your profile",
    description: "Add your roles, skills, and preferences so your matches actually fit you.",
    ctaLabel: "Edit profile",
    route: "/dashboard/profile",
    icon: "ri-user-settings-line",
  },
  find_jobs: {
    title: "Find matching jobs",
    description: "Browse roles tailored to your experience, skills, and goals.",
    ctaLabel: "Browse matches",
    route: "/dashboard/search",
    icon: "ri-radar-line",
  },
  apply: {
    title: "Apply to your first role",
    description: "Send a tailored application and start building your pipeline.",
    ctaLabel: "See your matches",
    route: "/dashboard/matches",
    icon: "ri-send-plane-line",
  },
  interview: {
    title: "Practice an interview",
    description: "Run a mock interview with an AI persona before the real thing.",
    ctaLabel: "Start practice",
    route: "/dashboard/interview",
    icon: "ri-user-voice-line",
  },
  highlights: {
    title: "Add work highlights",
    description: "Capture accomplishments that sharpen your interview answers.",
    ctaLabel: "Add highlights",
    route: "/dashboard/experience",
    icon: "ri-lightbulb-flash-line",
  },
  work_highlights: {
    title: "Add your work highlights",
    description:
      "Pull real accomplishments from your work email & chat into polished résumé bullets.",
    ctaLabel: "Add work highlights",
    route: "/dashboard/experience",
    icon: "ri-sparkling-2-line",
  },
  auto_apply: {
    title: "Set up Auto-apply",
    description: "Let {brand} apply to well-fitting roles on your behalf.",
    ctaLabel: "Set up auto-apply",
    route: "/dashboard/auto-apply",
    icon: "ri-robot-2-line",
  },
  security: {
    title: "Secure your account",
    description: "Turn on the protections that keep your account and data safe.",
    ctaLabel: "Review security",
    route: "/dashboard/security",
    icon: "ri-shield-check-line",
  },
};

const FALLBACK_COPY: StepCopy = {
  title: "Finish this step",
  description: "",
  ctaLabel: "Open",
  route: "/dashboard",
  icon: "ri-arrow-right-line",
};

/**
 * Copy for a step key, with a safe fallback for unknown keys. Pass the live
 * brand name to substitute it into any brand-aware description.
 */
export function stepCopy(key: string, brandName?: string): StepCopy {
  const base = STEP_COPY[key] ?? { ...FALLBACK_COPY, title: key };
  return {
    ...base,
    description: base.description.replace(BRAND_TOKEN, brandName || "the assistant"),
  };
}

/** True when every step in the view is done. */
export function allStepsDone(view: OnboardingView | null): boolean {
  const steps = view?.steps ?? [];
  return steps.length > 0 && steps.every((s) => s.done);
}

/** Core steps first, then the optional ones — the display order everywhere. */
export function orderSteps(steps: OnboardingStep[]): OnboardingStep[] {
  return [...steps.filter((s) => s.core), ...steps.filter((s) => !s.core)];
}

/** The client-only step key for the "My Work Highlights" first-run step. */
export const WORK_HIGHLIGHTS_STEP_KEY = "work_highlights";

/**
 * Steps the client adds itself because the backend doesn't drive them. Their
 * Mark done / Skip actions advance locally instead of calling the API.
 */
export const CLIENT_ONLY_STEPS: ReadonlySet<string> = new Set([WORK_HIGHLIGHTS_STEP_KEY]);

/** Signals that identify the "upload résumé" step, so we can slot in after it. */
function looksLikeResumeStep(step: OnboardingStep): boolean {
  const copy = STEP_COPY[step.key];
  const hay = `${step.key} ${copy?.title ?? ""} ${copy?.description ?? ""}`.toLowerCase();
  return /r[eé]sum[eé]|\bcv\b|upload|document/.test(hay);
}

/**
 * Ensure the "Add your work highlights" step is present, placed right after the
 * résumé step and before the find / apply steps — so new users hit it early,
 * before "Review matches". The step is added client-side when the backend view
 * doesn't already include it (a no-op when it does).
 */
export function withWorkHighlightsStep(steps: OnboardingStep[]): OnboardingStep[] {
  if (steps.some((s) => s.key === WORK_HIGHLIGHTS_STEP_KEY)) return steps;
  const injected: OnboardingStep = {
    key: WORK_HIGHLIGHTS_STEP_KEY,
    core: true,
    done: false,
    detected: false,
    marked: "",
  };
  const resumeIdx = steps.findIndex(looksLikeResumeStep);
  const at = resumeIdx >= 0 ? resumeIdx + 1 : Math.min(1, steps.length);
  const next = [...steps];
  next.splice(at, 0, injected);
  return next;
}

/** Injected + ordered steps — the single call site for the wizard and launcher. */
export function orderedStepsWithHighlights(view: OnboardingView | null): OnboardingStep[] {
  return orderSteps(withWorkHighlightsStep(view?.steps ?? []));
}

/**
 * Resolve which step to open from the server's `resume_step`, falling back to
 * the first step when it is empty or names an unknown step. The client never
 * guesses by scanning for an unfinished step — the server already does that.
 */
export function resolveResumeKey(view: OnboardingView | null): string {
  const ordered = orderSteps(view?.steps ?? []);
  const key = view?.resume_step ?? "";
  if (key && ordered.some((s) => s.key === key)) return key;
  return ordered[0]?.key ?? "";
}

// ---- Per-session auto-open guard ----

const SESSION_FLAG = "hw_onboarding_autoshown";

/** Whether the wizard already auto-opened once during this browser session. */
export function hasAutoOpenedThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_FLAG) === "1";
  } catch {
    return false;
  }
}

/** Remember that the wizard auto-opened this session. */
export function markAutoOpenedThisSession(): void {
  try {
    sessionStorage.setItem(SESSION_FLAG, "1");
  } catch {
    // Ignore storage failures — worst case the wizard may auto-open again.
  }
}

// ---- CTA hand-off (resume after returning from a step's CTA) ----

const CTA_FLAG = "hw_onboarding_cta_step";

/**
 * Record that the user left the wizard via a step's CTA, remembering which
 * step they were on so we can auto-detect completion when they return.
 */
export function markCtaPending(stepKey: string): void {
  try {
    sessionStorage.setItem(CTA_FLAG, stepKey);
  } catch {
    // Ignore storage failures — resume-after-CTA simply won't trigger.
  }
}

/** The step key the user left the wizard from, or "" when there is none. */
export function readCtaPending(): string {
  try {
    return sessionStorage.getItem(CTA_FLAG) ?? "";
  } catch {
    return "";
  }
}

/** Clear the pending CTA hand-off once it has been resolved. */
export function clearCtaPending(): void {
  try {
    sessionStorage.removeItem(CTA_FLAG);
  } catch {
    // Ignore storage failures.
  }
}