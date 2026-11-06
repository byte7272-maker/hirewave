import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import {
  clearCtaPending,
  getOnboarding,
  hasAutoOpenedThisSession,
  markAutoOpenedThisSession,
  readCtaPending,
  type OnboardingView,
} from "@/lib/onboarding";
import OnboardingWizard from "@/pages/dashboard/onboarding/components/OnboardingWizard";

interface OnboardingContextValue {
  view: OnboardingView | null;
  loading: boolean;
  error: boolean;
  /** Open the setup wizard dialog regardless of dismissed state. */
  open: () => void;
  /** Re-fetch the onboarding view. */
  refresh: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue>({
  view: null,
  loading: true,
  error: false,
  open: () => {},
  refresh: () => {},
});

export function useOnboarding() {
  return useContext(OnboardingContext);
}

/**
 * Owns the onboarding view and the setup wizard. The dialog is rendered once
 * here so both the dashboard launcher and the account menu can open the same
 * instance. Auto-opens at most once per session when the user hasn't finished
 * or dismissed setup.
 */
export default function OnboardingProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<OnboardingView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const load = useCallback(async (autoOpen: boolean) => {
    setLoading(true);
    setError(false);
    try {
      const data = await getOnboarding();
      setView(data ?? null);
      if (
        autoOpen &&
        data &&
        data.dismissed === false &&
        (data.percent ?? 0) < 100 &&
        !hasAutoOpenedThisSession()
      ) {
        markAutoOpenedThisSession();
        setWizardOpen(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  const refresh = useCallback(() => {
    load(false);
  }, [load]);

  const open = useCallback(async () => {
    // Fetch fresh so the wizard opens at the latest server resume_step.
    try {
      const data = await getOnboarding();
      if (data) setView(data);
    } catch {
      // Fall back to whatever view we already have.
    } finally {
      setWizardOpen(true);
    }
  }, []);

  const close = useCallback(() => {
    setWizardOpen(false);
    // Re-fetch so the launcher reflects any change made while the dialog was open.
    load(false);
  }, [load]);

  /**
   * If the user left the wizard via a step CTA, re-check on return: when that
   * step is now detected done (or the server advanced its resume_step), reopen
   * the wizard so it jumps to the next unfinished step. No client-side scanning.
   */
  const ctaBusyRef = useRef(false);
  const maybeResumeAfterCta = useCallback(async () => {
    const fromKey = readCtaPending();
    if (!fromKey || ctaBusyRef.current) return;
    ctaBusyRef.current = true;
    try {
      const data = await getOnboarding();
      if (!data) return;
      setView(data);
      const fromStep = (data.steps ?? []).find((s) => s.key === fromKey);
      const advanced = Boolean(fromStep?.done) || (data.resume_step ?? "") !== fromKey;
      if (advanced && data.dismissed === false && (data.percent ?? 0) < 100) {
        clearCtaPending();
        markAutoOpenedThisSession();
        setWizardOpen(true);
      }
    } catch {
      // Non-blocking — leave the pending flag so a later return can retry.
    } finally {
      ctaBusyRef.current = false;
    }
  }, []);

  // Returning from a CTA usually changes the route (or refocuses the tab).
  const location = useLocation();
  useEffect(() => {
    maybeResumeAfterCta();
  }, [location.pathname, maybeResumeAfterCta]);

  useEffect(() => {
    const onFocus = () => {
      maybeResumeAfterCta();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [maybeResumeAfterCta]);

  return (
    <OnboardingContext.Provider value={{ view, loading, error, open, refresh }}>
      {children}
      {wizardOpen && view && (
        <OnboardingWizard view={view} onClose={close} onViewChange={setView} />
      )}
    </OnboardingContext.Provider>
  );
}