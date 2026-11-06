import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { EVIDENCE_DRAFTS_EVENT, evidenceStepShortLabel } from "@/lib/evidenceDraft";
import { loadPausedEvidenceOverview } from "@/lib/evidenceResumeTarget";

/**
 * Live status for the "My Work Highlights" wizards that are paused: how many
 * are unfinished, plus where a one-click jump should take the user (the
 * stalled-longest one) and which step it is parked on.
 *
 * Kept live three cheap ways: it re-reads on mount and on every route change (so
 * a wizard resumed or finished elsewhere is reflected), and it reacts instantly
 * to the shared `EVIDENCE_DRAFTS_EVENT` a discard fires. Best-effort — a failed
 * lookup simply reports nothing so the badge just hides.
 */
export interface EvidenceDraftStatus {
  /** Number of résumés that still hold a paused wizard. */
  count: number;
  /** A short step label for the stalled-longest wizard, e.g. "Step 2". */
  oldestStep: string | null;
  /** Where clicking the badge should jump to resume the stalled-longest wizard. */
  oldestHref: string | null;
}

const EMPTY: EvidenceDraftStatus = { count: 0, oldestStep: null, oldestHref: null };

export function useEvidenceDraftStatus(): EvidenceDraftStatus {
  const [status, setStatus] = useState<EvidenceDraftStatus>(EMPTY);
  const location = useLocation();

  const refresh = useCallback(async () => {
    try {
      const { count, oldest } = await loadPausedEvidenceOverview();
      setStatus({
        count,
        oldestStep: oldest ? evidenceStepShortLabel(oldest.draft.step) : null,
        // Tag the jump so the editor can confirm the resume trip.
        oldestHref: oldest ? `${oldest.href}&from=dashboard` : null,
      });
    } catch {
      /* best-effort — a failure just hides the badge */
    }
  }, []);

  // Mount + every navigation.
  useEffect(() => {
    void refresh();
  }, [location.pathname, refresh]);

  // React the moment a résumé gains or loses a wizard draft.
  useEffect(() => {
    function onChange() {
      void refresh();
    }
    window.addEventListener(EVIDENCE_DRAFTS_EVENT, onChange);
    return () => window.removeEventListener(EVIDENCE_DRAFTS_EVENT, onChange);
  }, [refresh]);

  return status;
}

export default useEvidenceDraftStatus;