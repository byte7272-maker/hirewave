import type { ReactNode } from "react";
import DocumentStatusFilter from "./DocumentStatusFilter";
import DocumentSortSelect from "./DocumentSortSelect";
import RoleFilterBar from "./RoleFilterBar";
import type { DocStatus, RoleSort } from "@/lib/documentListMemory";

interface DocumentListToolbarProps {
  status: DocStatus;
  onStatusChange: (status: DocStatus) => void;
  sort: RoleSort;
  onSortChange: (sort: RoleSort) => void;
  roleOptions: { role: string; count: number }[];
  roleTotal: number;
  roleFilter: string;
  onRoleChange: (role: string) => void;
  /** Optional per-state counts, surfaced as badges on the status control. */
  counts?: Partial<Record<DocStatus, number>>;
  /** Bulk-archive every flagged document. Button shows only when flagged > 0. */
  onArchiveAllFlagged?: () => void;
  /** Locks the bulk-archive button while it runs. */
  archiveAllBusy?: boolean;
  /**
   * Opens the "My Work Highlights" wizard. Only the résumé list provides
   * it — the evidence endpoints are résumé-only, so the cover-letter list omits it.
   */
  onWorkHighlights?: () => void;
  /** Optional sync-status element shown at the end of the control row. */
  syncStatus?: ReactNode;
}

/**
 * The view controls above a document list: the Active/Flagged/Archived status
 * segmented control, the sort selector, and the role-chip filter row. The role
 * chips stay visible and functional in every state.
 */
export default function DocumentListToolbar({
  status,
  onStatusChange,
  sort,
  onSortChange,
  roleOptions,
  roleTotal,
  roleFilter,
  onRoleChange,
  counts,
  onArchiveAllFlagged,
  archiveAllBusy,
  onWorkHighlights,
  syncStatus,
}: DocumentListToolbarProps) {
  const flaggedCount = counts?.flagged ?? 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <DocumentStatusFilter value={status} onChange={onStatusChange} counts={counts} />
        <div className="flex items-center gap-2 flex-wrap">
          {onWorkHighlights && (
            <button
              type="button"
              onClick={onWorkHighlights}
              className="inline-flex items-center gap-1.5 text-sm font-semibold bg-accent-500 text-background-50 dark:text-foreground-950 px-3 py-2 rounded-md hover:bg-accent-600 transition-colors cursor-pointer whitespace-nowrap"
              title="Pull real accomplishments from your work email & chat into a résumé"
            >
              <span className="w-4 h-4 flex items-center justify-center">
                <i className="ri-sparkling-2-line"></i>
              </span>
              My Work Highlights
            </button>
          )}
          {flaggedCount > 0 && onArchiveAllFlagged && (
            <button
              type="button"
              onClick={onArchiveAllFlagged}
              disabled={archiveAllBusy}
              className="inline-flex items-center gap-2 text-sm font-semibold text-accent-900 bg-accent-100 px-3 py-2 rounded-md hover:bg-accent-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              title="Archive every flagged document"
            >
              {archiveAllBusy ? (
                <i className="ri-loader-4-line animate-spin"></i>
              ) : (
                <i className="ri-archive-2-line"></i>
              )}
              Archive all flagged
            </button>
          )}
          <DocumentSortSelect value={sort} onChange={onSortChange} />
          {syncStatus && (
            <span className="inline-flex items-center pl-1">{syncStatus}</span>
          )}
        </div>
      </div>
      <RoleFilterBar
        options={roleOptions}
        total={roleTotal}
        value={roleFilter}
        onChange={onRoleChange}
      />
    </div>
  );
}