import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { FlaggedMetric } from "@/lib/documents";
import GlossaryText from "@/components/feature/GlossaryText";
import TemplatePreview from "./TemplatePreview";
import { PAPER_WIDTH } from "./themes/paper";
import ReadablePreviewModal from "@/pages/dashboard/documents/components/ReadablePreviewModal";
import { registerRevisionReview } from "@/lib/revisionReview";
import { normalizeFieldPath } from "./metricFlags";
import {
  metricSignature,
  readVerifiedMetrics,
  writeVerifiedMetrics,
} from "./metricMemory";
import {
  readAppliedChanges,
  structuredChangeSignature,
  writeAppliedChanges,
} from "@/lib/improveAppliedMemory";
import type { StructuredChange } from "./structuredDiff";

/**
 * Renders a structured AI improvement through the currently-selected template
 * (never as raw markdown) in the main center preview. Generic over the document
 * shape so both résumés (JsonResume) and cover letters (CoverLetterStructured)
 * share identical guardrails:
 *
 *  1. A banner marks it as an unsaved preview with Compare / Accept / Discard.
 *  2. Every figure the AI invented (flagged_metrics) is highlighted inline plus
 *     listed in an amber strip — and each can be dismissed individually
 *     ("this figure is accurate"), clearing the strip as the user verifies.
 *  3. Every changed field is listed with a pending → applied lifecycle: a
 *     suggestion starts highlighted (pending), and applying it clears the
 *     highlight so the text reads as normal. Applied is final for the pass, and
 *     is remembered, so a later improve pass doesn't re-highlight the same edit
 *     unless the AI changes that field again.
 *
 * The resolved document (kept edits only) is what renders and what's saved.
 */

const MARK_STYLE = {
  background: "#fef08a",
  borderBottom: "2px solid #eab308",
  color: "#713f12",
} as const;

interface StructuredImprovePreviewProps<T> {
  /** Render the paper for a given document + its still-active flagged metrics. */
  renderPaper: (node: T, flags: FlaggedMetric[]) => ReactNode;
  /** Produce the document reflecting the user's keep/revert choices. */
  resolve: (reverted: ReadonlySet<number>) => T;
  /** Serialize the resolved document to the text posted on save. */
  toMarkdown: (node: T) => string;
  /** The current saved document, for the compare pane. */
  beforeNode: T | null;
  /** Field-level differences between the current and improved document. */
  changes: StructuredChange[];
  /** Figures the AI added that aren't in the original. */
  flags: FlaggedMetric[];
  compare: boolean;
  onCompareChange: (value: boolean) => void;
  applying: boolean;
  /**
   * Called with the resolved markdown — the kept mix of AI edits — plus the
   * figure tally that survived into it, so the save can record which versions
   * still carry unverified numbers.
   */
  onAccept: (markdown: string, metrics: { total: number; verified: number }) => void;
  onDiscard: () => void;
  appliedPrompts?: string[];
  appliedInstruction?: string;
  /**
   * How many AI-returned lines were stripped as verbatim echoes of the user's
   * guidance before this preview — shown as a small "N guidance line(s)
   * ignored" note so the removal is transparent instead of silent.
   */
  ignoredCount?: number;
  /** Label for the "before" pane (defaults to "Current version"). */
  currentLabel?: string;
  /**
   * Per-document + per-version key used to persist "this figure is accurate"
   * decisions, so re-opening a preview remembers what's already been checked.
   */
  memoryKey?: string;
  /**
   * Per-document key that lets any page-level "Preview" button open this pending
   * revision's full review, and remembers the review toggles for the document.
   */
  reviewKey?: string;
}

function changeHeading(count: number): string {
  return count === 1
    ? "1 AI edit — apply it or revert it before saving"
    : `${count} AI edits — apply or revert each before saving`;
}

function changeKindLabel(kind: StructuredChange["kind"]): string {
  if (kind === "added") return "Added";
  if (kind === "removed") return "Removed";
  return "Rewritten";
}

export default function StructuredImprovePreview<T>({
  renderPaper,
  resolve,
  toMarkdown,
  beforeNode,
  changes,
  flags,
  compare,
  onCompareChange,
  applying,
  onAccept,
  onDiscard,
  appliedPrompts = [],
  appliedInstruction = "",
  ignoredCount = 0,
  currentLabel = "Current version",
  memoryKey = "",
  reviewKey = "",
}: StructuredImprovePreviewProps<T>) {
  // Edits the user reverted (absent here means "not reverted").
  const [reverted, setReverted] = useState<Set<number>>(() => new Set());
  // Edits the user has applied — the highlight is cleared and, for this pass,
  // the decision is final (no un-apply). Applied edits render as plain text.
  const [applied, setApplied] = useState<Set<number>>(() => new Set());
  // Briefly-rung rows right after an apply, for a self-dismissing "applied" flash.
  const [flash, setFlash] = useState<Set<number>>(() => new Set());
  // Figures the user marked as accurate, keyed by field + value.
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  // Whether the revision is shown in the full-screen readable view.
  const [expanded, setExpanded] = useState(false);

  // Let any page-level "Preview" button open this pending revision's full review
  // (with highlight + compare), instead of the saved-document readable view.
  useEffect(() => {
    if (!reviewKey) return undefined;
    return registerRevisionReview(reviewKey, () => setExpanded(true));
  }, [reviewKey]);

  const flagsSig = useMemo(
    () => flags.map((f) => `${f.field}|${f.value}`).join("~"),
    [flags]
  );
  // A genuinely new preview resets the edit decisions, but restores any figures
  // already verified for this document + version from persisted memory.
  useEffect(() => {
    setReverted(new Set());
    setExpanded(false);
    setFlash(new Set());
    const stored = memoryKey ? readVerifiedMetrics(memoryKey) : new Set<string>();
    const restored = new Set<string>();
    for (const f of flags) {
      const sig = metricSignature(f);
      if (stored.has(sig)) restored.add(sig);
    }
    setDismissed(restored);
    // Restore the edits already applied for this document + version, so a new
    // improve pass keeps them plain while genuinely-new edits come back pending.
    const appliedStored = memoryKey ? readAppliedChanges(memoryKey) : new Set<string>();
    const restoredApplied = new Set<number>();
    for (const c of changes) {
      if (appliedStored.has(structuredChangeSignature(c.path, c.after))) {
        restoredApplied.add(c.id);
      }
    }
    setApplied(restoredApplied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changes, flagsSig, memoryKey]);

  const revertedPaths = useMemo(() => {
    const set = new Set<string>();
    for (const c of changes) if (reverted.has(c.id)) set.add(normalizeFieldPath(c.path));
    return set;
  }, [changes, reverted]);

  const activeFlags = useMemo(
    () =>
      flags.filter(
        (f) =>
          !dismissed.has(metricSignature(f)) &&
          !revertedPaths.has(normalizeFieldPath(f.field))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flags, dismissed, revertedPaths]
  );

  // Figures that survive the current keep/revert mix (they land in the saved
  // version) — the denominator for the version's "verified" badge, plus how
  // many of those the user already confirmed.
  const survivingFlags = useMemo(
    () => flags.filter((f) => !revertedPaths.has(normalizeFieldPath(f.field))),
    [flags, revertedPaths]
  );
  const totalSurviving = survivingFlags.length;
  const verifiedSurviving = survivingFlags.filter((f) =>
    dismissed.has(metricSignature(f))
  ).length;

  const appliedCount = changes.reduce((n, c) => (applied.has(c.id) ? n + 1 : n), 0);
  const revertedCount = changes.reduce((n, c) => (reverted.has(c.id) ? n + 1 : n), 0);
  const pendingCount = changes.length - appliedCount - revertedCount;
  const dismissedCount = flags.filter((f) => dismissed.has(metricSignature(f))).length;
  const revertedFlagCount = flags.filter((f) =>
    revertedPaths.has(normalizeFieldPath(f.field))
  ).length;
  const resolvedFlagCount = dismissedCount + revertedFlagCount;
  const hasApplied = appliedPrompts.length > 0 || appliedInstruction.trim().length > 0;

  const resolved = resolve(reverted);
  const resolvedMarkdown = toMarkdown(resolved);

  // The wording the AI introduced that the user is keeping — the passages the
  // full-screen readable view pens over when "Highlight changes" is on.
  const keptRevisionTerms = useMemo(
    () =>
      changes
        .filter((c) => !reverted.has(c.id))
        .map((c) => c.after)
        .filter(Boolean),
    [changes, reverted]
  );

  /** Persist the applied edits (by field path + new wording) for this document. */
  function persistApplied(ids: Set<number>) {
    if (!memoryKey) return;
    const sigs = new Set<string>();
    for (const c of changes) {
      if (ids.has(c.id)) sigs.add(structuredChangeSignature(c.path, c.after));
    }
    writeAppliedChanges(memoryKey, sigs);
  }
  /** Briefly ring a row after it's applied, then let the highlight fade. */
  function flashChange(id: number) {
    setFlash((prev) => new Set(prev).add(id));
    window.setTimeout(() => {
      setFlash((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1200);
  }
  /** Apply one edit: clear its highlight (render plain) and remember the decision. */
  function applyChange(id: number) {
    setReverted((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setApplied((prev) => {
      const next = new Set(prev).add(id);
      persistApplied(next);
      return next;
    });
    flashChange(id);
  }
  /** Apply every edit at once — the highlight clears across the whole revision. */
  function applyAll() {
    setReverted(new Set());
    const next = new Set(changes.map((c) => c.id));
    setApplied(next);
    persistApplied(next);
    changes.forEach((c) => flashChange(c.id));
  }
  /** Revert one edit back to its original wording. */
  function revertChange(id: number) {
    setApplied((prev) => {
      const next = new Set(prev);
      next.delete(id);
      persistApplied(next);
      return next;
    });
    setReverted((prev) => new Set(prev).add(id));
  }
  /** Restore a reverted edit to pending (highlighted) again. */
  function restoreChange(id: number) {
    setReverted((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }
  function revertAll() {
    setApplied(new Set());
    persistApplied(new Set());
    setReverted(new Set(changes.map((c) => c.id)));
  }
  /** Persist verified signatures, merging with anything stored for other previews. */
  function persistVerified(next: Set<string>) {
    if (!memoryKey) return;
    const merged = new Set([...readVerifiedMetrics(memoryKey), ...next]);
    writeVerifiedMetrics(memoryKey, merged);
  }
  function dismissFlag(f: FlaggedMetric) {
    setDismissed((prev) => {
      const next = new Set(prev).add(metricSignature(f));
      persistVerified(next);
      return next;
    });
  }
  function resetMetrics() {
    setDismissed(new Set());
    if (memoryKey) writeVerifiedMetrics(memoryKey, []);
  }

  // Keyboard shortcuts — Cmd/Ctrl+Enter accepts, Esc discards (matches the text preview).
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
        if (!applying) {
          onAccept(resolvedMarkdown, { total: totalSurviving, verified: verifiedSurviving });
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (!applying) onDiscard();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applying, onAccept, onDiscard, resolvedMarkdown, totalSurviving, verifiedSurviving]);

  return (
    <div className="space-y-3 animate-fade-in-up">
      {/* Banner — clearly marks the document as an unsaved preview. */}
      <div className="rounded-xl border border-accent-200 bg-accent-50 border-l-4 border-l-accent-500 px-4 py-3 flex items-start justify-between gap-3 flex-wrap hw-print-hide">
        <div className="min-w-0 flex items-start gap-2.5">
          <span className="w-7 h-7 flex items-center justify-center rounded-md bg-accent-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
            <i className="ri-eye-line"></i>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground-900">
              AI preview — not saved yet
            </p>
            {hasApplied && (
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
                {appliedInstruction.trim().length > 0 && (
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
            title="Toggle between the improved preview and a side-by-side comparison with the current version"
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
            onClick={() =>
              onAccept(resolvedMarkdown, {
                total: totalSurviving,
                verified: verifiedSurviving,
              })
            }
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

      {/* Selective accept — keep or revert individual AI edits. */}
      {changes.length > 0 && (
        <div className="rounded-xl border border-background-200 bg-background-50 px-4 py-3 hw-print-hide">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="w-7 h-7 flex items-center justify-center rounded-md bg-secondary-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
                <i className="ri-git-commit-line"></i>
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground-900">
                  {changeHeading(changes.length)}
                </p>
                <p className="text-xs text-foreground-500 mt-0.5">
                  <span className="font-medium text-foreground-700">{appliedCount}</span> of{" "}
                  {changes.length} applied
                  {revertedCount > 0 && ` · ${revertedCount} reverted`}
                  {" · "}apply each edit to clear its highlight, or revert the ones you don&apos;t want saved
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={applyAll}
                disabled={applying || pendingCount === 0}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 bg-primary-100 px-2.5 py-1 rounded-md hover:bg-primary-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                <i className="ri-check-double-line"></i>
                Apply all
              </button>
              <button
                type="button"
                onClick={revertAll}
                disabled={applying || changes.length === 0 || revertedCount === changes.length}
                className="inline-flex items-center gap-1 text-xs font-semibold text-foreground-600 bg-background-100 px-2.5 py-1 rounded-md hover:bg-background-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                <i className="ri-arrow-go-back-line"></i>
                Revert all
              </button>
            </div>
          </div>

          <ul className="mt-3 space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {changes.map((c) => {
              const isReverted = reverted.has(c.id);
              const isApplied = applied.has(c.id);
              const isFlashing = flash.has(c.id);
              return (
                <li
                  key={c.id}
                  className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors ${
                    isReverted
                      ? "border-background-200 bg-background-100/60"
                      : isApplied
                        ? "border-background-200 bg-background-50"
                        : "border-secondary-200 bg-secondary-50"
                  }${isFlashing ? " ring-2 ring-primary-300" : ""}`}
                >
                  {isApplied ? (
                    <span
                      className="mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 bg-primary-500 text-background-50 dark:text-foreground-950"
                      title="Applied — this edit will be saved"
                    >
                      <i className="text-xs ri-check-line"></i>
                    </span>
                  ) : isReverted ? (
                    <button
                      type="button"
                      onClick={() => restoreChange(c.id)}
                      disabled={applying}
                      title="Restore this edit (back to pending)"
                      aria-label="Restore this edit"
                      className="mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border bg-background-50 border-background-300 text-foreground-500 hover:bg-background-100 cursor-pointer transition-colors disabled:opacity-50"
                    >
                      <i className="text-xs ri-arrow-go-back-line"></i>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => applyChange(c.id)}
                      disabled={applying}
                      title="Apply this edit — clears its highlight"
                      aria-label="Apply this edit"
                      className="mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border bg-background-50 border-primary-300 text-primary-600 hover:bg-primary-100 cursor-pointer transition-colors disabled:opacity-50"
                    >
                      <i className="text-xs ri-check-line"></i>
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide text-foreground-500 bg-background-200/70 px-1.5 py-0.5 rounded whitespace-nowrap">
                        {c.section}
                      </span>
                      <span className="text-xs font-semibold text-foreground-800 truncate">
                        {c.label}
                      </span>
                      <span
                        className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${
                          c.kind === "added"
                            ? "text-primary-800 bg-primary-100"
                            : c.kind === "removed"
                              ? "text-accent-900 bg-accent-100"
                              : "text-secondary-900 bg-secondary-100"
                        }`}
                      >
                        {changeKindLabel(c.kind)}
                      </span>
                      {isApplied && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary-800 bg-primary-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                          <i className="ri-check-line"></i>
                          Applied
                        </span>
                      )}
                      {isReverted && (
                        <span className="inline-flex items-center text-[10px] font-semibold text-foreground-500 bg-background-200/70 px-1.5 py-0.5 rounded whitespace-nowrap">
                          Reverted
                        </span>
                      )}
                    </div>
                    <p
                      className={`mt-1 text-xs leading-relaxed line-clamp-2 ${
                        isReverted ? "text-foreground-400" : "text-foreground-700"
                      }`}
                      title={c.kind === "removed" ? c.before : `${c.before ? `${c.before} → ` : ""}${c.after}`}
                    >
                      {c.kind === "added" && <span className="text-foreground-500">{c.after}</span>}
                      {c.kind === "removed" && (
                        <span className="line-through">{c.before}</span>
                      )}
                      {c.kind === "edited" && (
                        <>
                          <span className="text-foreground-500 line-through">{c.before}</span>
                          <i className="ri-arrow-right-line mx-1"></i>
                          <span className="text-foreground-800">{c.after}</span>
                        </>
                      )}
                    </p>
                  </div>
                  {!isApplied && !isReverted && (
                    <button
                      type="button"
                      onClick={() => revertChange(c.id)}
                      disabled={applying}
                      title="Revert this edit (restore the original wording)"
                      aria-label="Revert this edit"
                      className="mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border bg-background-50 border-background-300 text-foreground-500 hover:text-accent-700 hover:bg-background-100 cursor-pointer transition-colors disabled:opacity-50"
                    >
                      <i className="text-xs ri-close-line"></i>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Metric safeguard — impossible to miss, never blocks Accept, each dismissable. */}
      {flags.length > 0 ? (
        <div className="rounded-xl border border-accent-300 bg-accent-50 border-l-4 border-l-accent-500 px-4 py-3.5 hw-print-hide">
          <div className="flex items-start gap-3">
            <span className="w-7 h-7 flex items-center justify-center rounded-md bg-accent-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
              <i className="ri-alert-line"></i>
            </span>
            <div className="min-w-0 flex-1">
              {activeFlags.length > 0 ? (
                <>
                  <p className="text-sm font-semibold text-foreground-900">
                    {activeFlags.length === 1
                      ? "1 figure was added by AI and isn't in your original — verify it's accurate before saving."
                      : `${activeFlags.length} figures were added by AI and aren't in your original — verify they're accurate before saving.`}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {activeFlags.map((flag, index) => (
                      <li key={`${flag.field}-${index}`} className="flex items-start gap-2 min-w-0">
                        <span
                          className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded whitespace-nowrap flex-shrink-0"
                          style={MARK_STYLE}
                        >
                          {flag.value}
                        </span>
                        <span className="text-xs text-foreground-700 leading-relaxed min-w-0 flex-1">
                          {flag.text || flag.field}
                        </span>
                        <button
                          type="button"
                          onClick={() => dismissFlag(flag)}
                          title="This figure is accurate — remove it from the list"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-700 bg-primary-100 px-2 py-0.5 rounded-md hover:bg-primary-200 transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
                        >
                          <i className="ri-check-line"></i>
                          Accurate
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm font-semibold text-primary-800 flex items-center gap-2">
                  <i className="ri-checkbox-circle-line text-base"></i>
                  All flagged figures verified — nothing left to check.
                </p>
              )}

              {resolvedFlagCount > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-accent-200 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] text-foreground-600">
                    {dismissedCount > 0 && `${dismissedCount} marked accurate`}
                    {dismissedCount > 0 && revertedFlagCount > 0 && " · "}
                    {revertedFlagCount > 0 && `${revertedFlagCount} reverted with their edit`}
                  </span>
                  {dismissedCount > 0 && (
                    <button
                      type="button"
                      onClick={resetMetrics}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground-500 hover:text-foreground-900 cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-restart-line"></i>
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-primary-50 border border-primary-200 px-4 py-2.5 flex items-center gap-2 text-xs font-medium text-primary-800 hw-print-hide">
          <i className="ri-checkbox-circle-line text-base"></i>
          No new figures added — every number here comes from your original.
        </div>
      )}

      {/* The improvement, rendered through the selected template. */}
      {compare ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground-500 hw-print-hide">
              <i className="ri-history-line"></i>
              {currentLabel}
            </div>
            {beforeNode ? (
              <TemplatePreview printable={false}>{renderPaper(beforeNode, [])}</TemplatePreview>
            ) : (
              <div className="rounded-xl border border-background-200 bg-background-50 py-16 text-center text-sm text-foreground-500">
                Current version unavailable.
              </div>
            )}
          </div>
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary-700 hw-print-hide">
              <i className="ri-sparkling-line"></i>
              Improved preview
            </div>
            <TemplatePreview resetKey="improved" onExpand={() => setExpanded(true)}>
              {renderPaper(resolved, activeFlags)}
            </TemplatePreview>
          </div>
        </div>
      ) : (
        <TemplatePreview resetKey="improved" onExpand={() => setExpanded(true)}>
          {renderPaper(resolved, activeFlags)}
        </TemplatePreview>
      )}

      {expanded && (
        <ReadablePreviewModal
          title="Improved preview"
          subtitle="Full readable view · not saved yet"
          onClose={() => setExpanded(false)}
          revision={renderPaper(resolved, activeFlags)}
          revisionHighlightTerms={keptRevisionTerms}
          revisionLabel="Improved revision"
          revisionWidth={PAPER_WIDTH}
          memoryKey={reviewKey}
          hasFlaggedFigures={activeFlags.length > 0}
          comparison={beforeNode ? renderPaper(beforeNode, []) : null}
          comparisonLabel={currentLabel}
          comparisonWidth={PAPER_WIDTH}
          initialCompare={compare}
        />
      )}
    </div>
  );
}