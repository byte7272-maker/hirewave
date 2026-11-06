/**
 * Local memory for the dashboard "Strengthen your résumé" work-highlights
 * call-to-action.
 *
 * The card is contextual (it appears when a résumé is thin, low-grade, or has no
 * saved versions) and dismissible. Instead of hiding FORVER after one dismissal,
 * a dismissal remembers the résumé need at that moment as a fingerprint; the card
 * stays quiet while the need is unchanged, but re-surfaces when the need grows —
 * a résumé's grade drops, or a new thin / low résumé appears. That way a nudge the
 * user waved away when it didn't apply can come back once it actually does.
 *
 * Local-only; it never touches the backend.
 */

const KEY = "hirewave_work_highlights_cta_dismissed";

/** The résumé-need snapshot a dismissal is keyed to. */
export interface WorkHighlightsCtaFingerprint {
  /** Lowest quality score across active résumés (0 when unscored; null when none). */
  worstScore: number | null;
  /** How many active résumés are thin / low-grade / have no saved version. */
  thinCount: number;
}

interface StoredDismissal {
  fingerprint: WorkHighlightsCtaFingerprint;
  dismissedAt: number;
}

/** A dismissal written before fingerprints existed (the old `"1"` flag). */
interface LegacyDismissal {
  legacy: true;
}

type Dismissal = StoredDismissal | LegacyDismissal;

function isFingerprint(value: unknown): value is WorkHighlightsCtaFingerprint {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return (
    (rec.worstScore === null || typeof rec.worstScore === "number") &&
    typeof rec.thinCount === "number"
  );
}

function readDismissal(): Dismissal | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    // The pre-fingerprint dismissal was stored as the literal string "1".
    if (raw === "1") return { legacy: true };
    const parsed: unknown = JSON.parse(raw);
    const rec = parsed as Record<string, unknown>;
    if (rec && typeof rec === "object" && isFingerprint(rec.fingerprint)) {
      return {
        fingerprint: rec.fingerprint,
        dismissedAt: typeof rec.dismissedAt === "number" ? rec.dismissedAt : 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Remember the résumé-need snapshot at dismissal time. */
export function dismissWorkHighlightsCta(
  fingerprint: WorkHighlightsCtaFingerprint
): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ fingerprint, dismissedAt: Date.now() })
    );
  } catch {
    /* storage unavailable — the card simply won't remember the dismissal */
  }
}

/** Forget the dismissal. */
export function clearWorkHighlightsCtaDismissal(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* best-effort */
  }
}

/**
 * Whether the card should show for the given current need.
 *
 * Never dismissed → show. Dismissed → show only when the need has GROWN since:
 * the lowest grade dropped, or a new thin / low résumé appeared. A legacy
 * "dismissed" flag (stored before fingerprints existed) is migrated to the
 * current need and stays hidden, so it never nags retroactively.
 */
export function shouldShowWorkHighlightsCta(
  current: WorkHighlightsCtaFingerprint
): boolean {
  const dismissal = readDismissal();
  if (!dismissal) return true;
  if ("legacy" in dismissal) {
    dismissWorkHighlightsCta(current);
    return false;
  }
  const prev = dismissal.fingerprint;
  // The lowest grade dropped (a résumé that was fine is now thin / low-grade).
  if (
    prev.worstScore !== null &&
    current.worstScore !== null &&
    current.worstScore < prev.worstScore
  ) {
    return true;
  }
  // A new thin / low résumé showed up (also covers "no résumé → first résumé").
  if (current.thinCount > prev.thinCount) return true;
  return false;
}