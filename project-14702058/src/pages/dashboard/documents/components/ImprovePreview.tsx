import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import GlossaryText from "@/components/feature/GlossaryText";
import {
  buildPreviewDiff,
  resolvePreview,
  type PreviewChange,
} from "@/lib/diffHighlight";
import {
  changeSignature,
  readPreviewDecisions,
  writePreviewDecisions,
} from "@/lib/previewMemory";
import PreviewDiffBody from "./PreviewDiffBody";
import ReadablePreviewModal from "./ReadablePreviewModal";
import { registerRevisionReview } from "@/lib/revisionReview";

/** Show the "review before saving" nudge once this many changes are untouched. */
const REVIEW_NUDGE_THRESHOLD = 5;

interface ImprovePreviewProps {
  /** The version currently shown/saved — the "before" side. */
  currentText: string;
  /** The proposed improved text returned by /revise or /tailor — the "after" side. */
  preview: string;
  /** False = replace-in-place (single pane), true = split/compare (two panes). */
  compare: boolean;
  onCompareChange: (value: boolean) => void;
  /** Prompts that produced this preview, shown as chips in the banner. */
  appliedPrompts?: string[];
  /** Custom instruction that produced this preview. */
  appliedInstruction?: string;
  /**
   * How many AI-returned lines were stripped as verbatim echoes of the user's
   * guidance before this preview — shown as a small "N guidance line(s)
   * ignored" note so the removal is transparent instead of silent.
   */
  ignoredCount?: number;
  applying: boolean;
  /** Called with the final text after individual changes have been kept/reverted. */
  onAccept: (resolvedText: string) => void;
  onDiscard: () => void;
  /**
   * Per-document key used to persist keep/revert decisions across sessions.
   * The same changes (matched by wording) restore their last state.
   */
  memoryKey?: string;
}

/**
 * Renders the AI improve/tailor result in the main center document view.
 *
 * Default is replace-in-place: a single pane shows the improved text (new words
 * highlighted). The optional split view puts the current version on the left and
 * the improved preview on the right. Either way the result lives in the center —
 * never in the right-hand controls column.
 *
 * Individual revisions can be kept or reverted inline, the accepted text is
 * whatever mix of changes is left on when Accept & save is pressed, and
 * untouched changes are nudged for review before saving.
 */
export default function ImprovePreview({
  currentText,
  preview,
  compare,
  onCompareChange,
  appliedPrompts = [],
  appliedInstruction = "",
  ignoredCount = 0,
  applying,
  onAccept,
  onDiscard,
  memoryKey = "",
}: ImprovePreviewProps) {
  const appliedCount = appliedPrompts.length;
  const hasAppliedCustom = appliedInstruction.trim().length > 0;
  const decisionsKey = memoryKey ? `hirewave_preview_decisions_${memoryKey}` : "";

  const diff = useMemo(
    () => buildPreviewDiff(currentText, preview),
    [currentText, preview]
  );
  const changes = diff.changes;

  // Changes the user has reverted — a fresh preview starts from remembered decisions.
  const [discarded, setDiscarded] = useState<Set<number>>(() => new Set());
  // Changes the user has actually looked at (toggled or clicked into focus).
  const [reviewed, setReviewed] = useState<Set<number>>(() => new Set());
  // Change to scroll into view, set by the "review next" nudge.
  const [jumpTarget, setJumpTarget] = useState<number | null>(null);
  // Whether the improved revision is shown in the full-screen readable view.
  const [expanded, setExpanded] = useState(false);

  // Let any page-level "Preview" button open this pending revision's full review
  // (with highlight + compare), instead of the saved-document readable view.
  useEffect(() => {
    if (!memoryKey) return undefined;
    return registerRevisionReview(memoryKey, () => setExpanded(true));
  }, [memoryKey]);

  // Restore remembered keep/revert decisions whenever the changes change.
  useEffect(() => {
    const stored = decisionsKey ? readPreviewDecisions(decisionsKey) : {};
    const restoredDiscarded = new Set<number>();
    const restoredReviewed = new Set<number>();
    for (const change of diff.changes) {
      const sig = changeSignature(change);
      if (Object.prototype.hasOwnProperty.call(stored, sig)) {
        restoredReviewed.add(change.id);
        if (stored[sig]) restoredDiscarded.add(change.id);
      }
    }
    setDiscarded(restoredDiscarded);
    setReviewed(restoredReviewed);
    setJumpTarget(null);
  }, [diff, decisionsKey]);

  const persistDecision = useCallback(
    (change: PreviewChange, reverted: boolean) => {
      if (!decisionsKey) return;
      const map = readPreviewDecisions(decisionsKey);
      const sig = changeSignature(change);
      if (reverted) map[sig] = true;
      else delete map[sig];
      writePreviewDecisions(decisionsKey, map);
    },
    [decisionsKey]
  );

  const resolvedText = useMemo(
    () => resolvePreview(diff.segments, diff.changes, discarded),
    [diff, discarded]
  );

  const kept = useMemo(
    () => ({
      added: diff.changes.reduce(
        (sum, c) => (discarded.has(c.id) ? sum : sum + c.addedWords),
        0
      ),
      removed: diff.changes.reduce(
        (sum, c) => (discarded.has(c.id) ? sum : sum + c.removedWords),
        0
      ),
      count: diff.changes.filter((c) => !discarded.has(c.id)).length,
    }),
    [diff, discarded]
  );

  const totalChanges = diff.changes.length;
  const hasChanges = totalChanges > 0;
  const unreviewedCount = changes.filter((c) => !reviewed.has(c.id)).length;
  const showReviewNudge =
    hasChanges && !applying && unreviewedCount >= REVIEW_NUDGE_THRESHOLD;

  function markReviewed(id: number) {
    setReviewed((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  function toggleChange(id: number) {
    const change = changes[id];
    if (!change) return;
    const willRevert = !discarded.has(id);
    markReviewed(id);
    setDiscarded((prev) => {
      const next = new Set(prev);
      if (willRevert) next.add(id);
      else next.delete(id);
      return next;
    });
    persistDecision(change, willRevert);
  }

  function keepAll() {
    setDiscarded(new Set());
    setReviewed(new Set(changes.map((c) => c.id)));
    changes.forEach((c) => persistDecision(c, false));
  }

  function revertAll() {
    setDiscarded(new Set(changes.map((c) => c.id)));
    setReviewed(new Set(changes.map((c) => c.id)));
    changes.forEach((c) => persistDecision(c, true));
  }

  /** Jump the preview to the next change the user hasn't looked at yet. */
  function reviewNext() {
    const next = changes.find((c) => !reviewed.has(c.id));
    if (!next) return;
    markReviewed(next.id);
    setJumpTarget(next.id);
  }

  /**
   * Clicking anywhere on the revision document opens it full-screen at a readable
   * size — exactly like clicking the original rendered document does. The only
   * exceptions are the small keep/revert controls (so selective accept still
   * works) and an active text selection (so selecting to copy doesn't hijack the
   * click). Highlighted/revised text is NOT excluded, so the whole page behaves
   * like the original document.
   */
  function handlePaneClick(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    const selection = window.getSelection?.();
    if (selection && selection.toString().trim().length > 0) return;
    setExpanded(true);
  }

  // Keyboard shortcuts: Cmd/Ctrl+Enter accepts, Esc discards.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      // Don't hijack Esc while another dialog/drawer is open.
      if (document.querySelector('[aria-modal="true"]')) return;

      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        if (!applying) onAccept(resolvedText);
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (!applying) onDiscard();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applying, onAccept, onDiscard, resolvedText]);

  const addedLabel = `${kept.added} word${kept.added === 1 ? "" : "s"} added`;
  const removedLabel = `${kept.removed} removed`;

  // The three nodes the full-screen review shows: the plain revision, a version
  // with the AI's changes penned in, and the current saved version for A/B + compare.
  const paperShell = (children: ReactNode) => (
    <div className="hw-paper mx-auto bg-white rounded-lg shadow-sm" style={{ maxWidth: 820 }}>
      <div className="px-8 py-10 sm:px-12 sm:py-14 text-[15px] leading-[1.9] text-foreground-900 whitespace-pre-wrap font-body">
        {children}
      </div>
    </div>
  );
  const revisionPlainNode = paperShell(resolvedText.trim() ? resolvedText : "—");
  const revisionHighlightedNode = paperShell(
    <>
      {diff.segments.map((seg, index) => {
        if (seg.kind === "equal") return <span key={index}>{seg.text}</span>;
        const change = diff.changes[seg.changeId];
        if (!change) return null;
        return discarded.has(seg.changeId) ? (
          <span
            key={index}
            className="bg-background-200/70 text-foreground-500 rounded-sm px-0.5 line-through"
          >
            {change.originalText}
          </span>
        ) : (
          <mark
            key={index}
            className="bg-accent-200 text-accent-900 rounded-sm px-0.5"
          >
            {change.previewText}
          </mark>
        );
      })}
    </>
  );
  const comparisonNode = paperShell(currentText.trim() ? currentText : "—");

  return (
    <div className="space-y-3 animate-fade-in-up">
      {/* Slim preview banner — clearly marks the document as an unsaved preview. */}
      <div className="rounded-xl border border-accent-200 bg-accent-50 border-l-4 border-l-accent-500 px-4 py-3 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex items-start gap-2.5">
          <span className="w-7 h-7 flex items-center justify-center rounded-md bg-accent-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
            <i className="ri-eye-line"></i>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground-900">
              Preview of improvements — not saved yet
            </p>
            {(appliedCount > 0 || hasAppliedCustom) && (
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                {appliedPrompts.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-800 bg-primary-100 px-2 py-0.5 rounded-full whitespace-nowrap"
                  >
                    <i className="ri-check-line"></i>
                    <GlossaryText text={p} />
                  </span>
                ))}
                {hasAppliedCustom && (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-secondary-900 bg-secondary-100 px-2 py-0.5 rounded-full max-w-full"
                    title={appliedInstruction}
                  >
                    <i className="ri-edit-line flex-shrink-0"></i>
                    <span className="flex-shrink-0 text-secondary-700">Instruction:</span>
                    <span className="truncate max-w-[280px]">{appliedInstruction}</span>
                  </span>
                )}
              </div>
            )}
            {ignoredCount > 0 && (
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-accent-800">
                <i className="ri-filter-off-line flex-shrink-0"></i>
                {ignoredCount === 1
                  ? "1 guidance line ignored"
                  : `${ignoredCount} guidance lines ignored`}
                <span className="font-normal text-foreground-500">
                  — read as an instruction, not content
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="hidden lg:inline-flex items-center gap-1 text-[11px] text-foreground-500 whitespace-nowrap">
            <kbd className="px-1.5 py-0.5 rounded border border-background-300 bg-background-100 text-[10px] font-medium text-foreground-600">
              ⌘/Ctrl ↵
            </kbd>
            Accept
            <span className="text-foreground-300">·</span>
            <kbd className="px-1.5 py-0.5 rounded border border-background-300 bg-background-100 text-[10px] font-medium text-foreground-600">
              Esc
            </kbd>
            Discard
          </span>
          <button
            type="button"
            onClick={() => onCompareChange(!compare)}
            aria-pressed={compare}
            title="Toggle between a single preview pane and a side-by-side comparison"
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
              compare
                ? "bg-accent-500 text-background-50 dark:text-foreground-950 border-accent-500"
                : "bg-background-50 text-foreground-700 border-background-200 hover:bg-background-100"
            }`}
          >
            <i className="ri-layout-column-line"></i>
            {compare ? "Split view" : "Compare"}
          </button>
          <button
            onClick={() => onAccept(resolvedText)}
            disabled={applying}
            title="Accept & save (⌘/Ctrl + Enter)"
            className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
          >
            {applying ? (
              <i className="ri-loader-4-line animate-spin"></i>
            ) : (
              <i className="ri-check-line"></i>
            )}
            {applying ? "Saving…" : "Accept & save"}
          </button>
          <button
            onClick={onDiscard}
            disabled={applying}
            title="Discard preview (Esc)"
            className="text-sm font-medium text-foreground-600 hover:text-foreground-900 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
          >
            Discard
          </button>
        </div>
      </div>

      {/* Nudge: many changes still unreviewed before saving. */}
      {showReviewNudge && (
        <div className="rounded-xl border border-accent-300 bg-accent-100/70 px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-accent-900 min-w-0">
            <span className="w-6 h-6 flex items-center justify-center rounded-md bg-accent-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
              <i className="ri-alert-line"></i>
            </span>
            <span className="min-w-0">
              {unreviewedCount} changes — review before saving
              <span className="ml-1.5 font-normal text-accent-800">
                ({totalChanges - unreviewedCount} of {totalChanges} reviewed)
              </span>
            </span>
          </span>
          <button
            type="button"
            onClick={reviewNext}
            title="Jump to the next unreviewed change"
            className="inline-flex items-center gap-1.5 text-xs font-semibold bg-accent-500 text-background-50 dark:text-foreground-950 px-3 py-1.5 rounded-md hover:bg-accent-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            Review next
            <i className="ri-arrow-down-line"></i>
          </button>
        </div>
      )}

      {/* Compact "what changed" count summary, above the panes. */}
      <div className="rounded-xl border border-background-200 bg-background-50 px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs">
          {hasChanges ? (
            <>
              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground-900 whitespace-nowrap">
                <span className="w-5 h-5 flex items-center justify-center rounded-md bg-accent-100 text-accent-700">
                  <i className="ri-add-line"></i>
                </span>
                {addedLabel}
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground-900 whitespace-nowrap">
                <span className="w-5 h-5 flex items-center justify-center rounded-md bg-background-200 text-foreground-600">
                  <i className="ri-subtract-line"></i>
                </span>
                {removedLabel}
              </span>
              <span className="text-foreground-500 whitespace-nowrap">
                {kept.count} of {totalChanges} change{totalChanges === 1 ? "" : "s"} kept
              </span>
            </>
          ) : (
            <span className="text-foreground-500">No textual changes detected.</span>
          )}
        </div>

        {hasChanges && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={keepAll}
              disabled={applying || kept.count === totalChanges}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 bg-primary-100 px-2.5 py-1 rounded-md hover:bg-primary-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              <i className="ri-check-double-line"></i>
              Keep all
            </button>
            <button
              type="button"
              onClick={revertAll}
              disabled={applying || kept.count === 0}
              className="inline-flex items-center gap-1 text-xs font-semibold text-foreground-600 bg-background-100 px-2.5 py-1 rounded-md hover:bg-background-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              <i className="ri-arrow-go-back-line"></i>
              Revert all
            </button>
          </div>
        )}
      </div>

      {compare ? (
        // Split / compare — current on the left, improved preview on the right.
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-xl bg-background-50 border border-background-200 overflow-hidden">
            <div className="px-3 py-2 border-b border-background-200 text-xs font-semibold text-foreground-500 flex items-center gap-1.5">
              <i className="ri-history-line"></i>
              Current version
            </div>
            <div className="p-3 max-h-[560px] overflow-y-auto text-sm text-foreground-600 whitespace-pre-wrap leading-relaxed">
              {currentText || "—"}
            </div>
          </div>
          <div className="rounded-xl bg-primary-50 border border-primary-200 overflow-hidden">
            <div className="px-3 py-2 border-b border-primary-200 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-primary-700 flex items-center gap-1.5">
                <i className="ri-sparkling-line"></i>
                Improved preview
              </span>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] text-foreground-500 whitespace-nowrap">
                  <span className="w-2.5 h-2.5 rounded-sm bg-accent-200 border border-accent-300"></span>
                  New
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-accent-700 whitespace-nowrap">
                  <i className="ri-external-link-line"></i>
                  Click the page for a full readable view
                </span>
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  title="Open this revision in a full-screen readable view"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground-700 bg-background-50 border border-background-200 hover:border-background-300 hover:text-foreground-950 px-2 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-expand-diagonal-line"></i>
                  Full view
                </button>
              </div>
            </div>
            <div onClick={handlePaneClick} className="cursor-zoom-in">
              <PreviewDiffBody
                segments={diff.segments}
                changes={diff.changes}
                discarded={discarded}
                onToggle={toggleChange}
                onFocusChange={markReviewed}
                jumpTarget={jumpTarget}
                className="p-3 max-h-[560px] overflow-y-auto text-sm text-foreground-900 whitespace-pre-wrap leading-relaxed"
              />
            </div>
          </div>
        </div>
      ) : (
        // Replace-in-place — a single pane showing the improved version.
        <div className="rounded-xl bg-primary-50 border border-primary-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-primary-200 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-primary-700 flex items-center gap-1.5">
              <i className="ri-sparkling-line"></i>
              Improved preview
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[11px] text-foreground-500 whitespace-nowrap">
                <span className="w-2.5 h-2.5 rounded-sm bg-accent-200 border border-accent-300"></span>
                New text highlighted
                <span className="text-foreground-300 mx-0.5">·</span>
                <i className="ri-close-circle-line"></i>
                Discard a change
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-accent-700 whitespace-nowrap">
                <i className="ri-external-link-line"></i>
                Click the page for a full readable view
              </span>
              <button
                type="button"
                onClick={() => setExpanded(true)}
                title="Open this revision in a full-screen readable view"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground-700 bg-background-50 border border-background-200 hover:border-background-300 hover:text-foreground-950 px-2 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-expand-diagonal-line"></i>
                Full view
              </button>
            </div>
          </div>
          <div onClick={handlePaneClick} className="cursor-zoom-in">
            <PreviewDiffBody
              segments={diff.segments}
              changes={diff.changes}
              discarded={discarded}
              onToggle={toggleChange}
              onFocusChange={markReviewed}
              jumpTarget={jumpTarget}
              className="p-4 max-h-[720px] overflow-y-auto text-sm text-foreground-900 whitespace-pre-wrap leading-relaxed"
            />
          </div>
        </div>
      )}

      {expanded && (
        <ReadablePreviewModal
          title="Improved preview"
          subtitle="Full readable view · not saved yet"
          onClose={() => setExpanded(false)}
          revision={revisionPlainNode}
          revisionHighlighted={revisionHighlightedNode}
          revisionLabel="Improved revision"
          comparison={comparisonNode}
          comparisonLabel="Current version"
          initialCompare={compare}
          memoryKey={memoryKey}
        />
      )}
    </div>
  );
}