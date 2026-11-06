import type { Resume } from "@/lib/documents";
import type { LastWorkHighlightsImport } from "@/lib/workHighlightsMemory";
import GradeBadge from "@/pages/dashboard/documents/components/GradeBadge";

interface HighlightsProgressProps {
  /** The résumé currently open in the workspace. */
  resume: Resume;
  /** Its running "highlights imported" total. */
  importedCount: number;
  /** The most recent accepted import for this résumé (drives "Undo last import"). */
  lastImport: LastWorkHighlightsImport | null;
  /** True while an undo is in flight, so the button can show a spinner. */
  undoing: boolean;
  onUndo: () => void;
}

/**
 * The workspace header's progress read-out: the résumé's quality grade and its
 * "N highlights imported" running total, plus a one-click **Undo last import**
 * when there is an accepted import to roll back. Everything the user needs to
 * gauge their progress (and reverse a slipped click) sits in the header, so they
 * never have to leave the page to see where the document stands.
 */
export default function HighlightsProgress({
  resume,
  importedCount,
  lastImport,
  undoing,
  onUndo,
}: HighlightsProgressProps) {
  // Undo is offered only when we know which version to roll back to and it
  // differs from the one currently shown.
  const canUndo =
    lastImport !== null &&
    lastImport.previousVersion !== null &&
    lastImport.previousVersion !== undefined &&
    String(lastImport.previousVersion) !== String(resume.active_version ?? "");

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {/* Quality grade */}
      <div
        className="inline-flex items-center gap-2.5 rounded-xl border border-background-200 bg-background-50 px-3.5 py-2"
        title="This résumé's quality grade"
      >
        <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary-100 text-primary-700 flex-shrink-0">
          <i className="ri-award-line text-base"></i>
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-400">
            Quality
          </span>
          {resume.quality_grade ? (
            <GradeBadge grade={resume.quality_grade} score={resume.quality_score} />
          ) : (
            <span className="text-sm font-semibold text-foreground-500">Not graded</span>
          )}
        </span>
      </div>

      {/* Edits applied */}
      <div
        className="inline-flex items-center gap-2.5 rounded-xl border border-background-200 bg-background-50 px-3.5 py-2"
        title="Edits you've woven into this résumé from your work highlights"
      >
        <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-accent-100 text-accent-700 flex-shrink-0">
          <i className="ri-sparkling-2-line text-base"></i>
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-400">
            Edits applied
          </span>
          <span className="text-sm font-semibold text-foreground-900">
            {importedCount > 0 ? `${importedCount} applied` : "None yet"}
          </span>
        </span>
      </div>

      {canUndo && (
        <button
          type="button"
          onClick={onUndo}
          disabled={undoing}
          title="Re-activate the version from before your last import (Cmd/Ctrl+Z)"
          className="inline-flex items-center gap-2 rounded-xl border border-accent-200 bg-accent-50 text-accent-900 px-3.5 py-2.5 text-sm font-semibold hover:bg-accent-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {undoing ? (
            <i className="ri-loader-4-line animate-spin"></i>
          ) : (
            <i className="ri-arrow-go-back-line"></i>
          )}
          Undo last import
        </button>
      )}
    </div>
  );
}