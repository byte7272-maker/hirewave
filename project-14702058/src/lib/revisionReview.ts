/**
 * A tiny registry that lets any "Preview" button on a page open a document's
 * PENDING improve/incorporate revision (the full-screen readable review with
 * highlight + compare) instead of the saved-document view, whenever one is
 * pending for that document.
 *
 * The revision isn't saved yet, so it can't be fetched like a normal preview.
 * The component that actually renders the pending revision
 * (`StructuredImprovePreview` / `ImprovePreview`) registers an opener for its
 * document key while it's mounted. Preview buttons then try the registry first
 * and fall back to the normal saved-document readable view when nothing is
 * pending — so a Preview click is never a dead end.
 */

type RevisionOpener = () => void;

const openers = new Map<string, RevisionOpener>();

/** A stable key for a document's pending review (résumé or cover letter). */
export function revisionReviewKey(
  kind: "resume" | "cover-letter",
  docId: string | number
): string {
  return `${kind}_${docId}`;
}

/**
 * Register an opener for a document's pending revision review. Returns a cleanup
 * that removes it — but only if this exact opener is still the registered one,
 * so a later registration can't be torn down by an earlier unmount.
 */
export function registerRevisionReview(key: string, open: RevisionOpener): () => void {
  if (!key) return () => {};
  openers.set(key, open);
  return () => {
    if (openers.get(key) === open) openers.delete(key);
  };
}

/**
 * Open a document's pending revision review. Returns true when one was
 * registered and opened, false when there's nothing pending — the caller should
 * then fall back to the saved-document readable view.
 */
export function openRevisionReview(key: string): boolean {
  const open = openers.get(key);
  if (!open) return false;
  open();
  return true;
}