import type { DocStatus } from "@/lib/documentListMemory";

interface DocumentStatusFilterProps {
  /** The active list state. */
  value: DocStatus;
  onChange: (status: DocStatus) => void;
  /**
   * Optional per-state counts. When a state has a count above zero a small
   * badge is shown (e.g. "Flagged · N") so attention-needed documents are
   * visible without switching states.
   */
  counts?: Partial<Record<DocStatus, number>>;
}

const OPTIONS: { value: DocStatus; label: string; icon: string }[] = [
  { value: "active", label: "Active", icon: "ri-checkbox-circle-line" },
  { value: "flagged", label: "Flagged", icon: "ri-flag-line" },
  { value: "archived", label: "Archived", icon: "ri-archive-line" },
];

/**
 * A segmented control that switches a document list between its Active,
 * Flagged and Archived states (each maps to query params on the list endpoint).
 * Optionally shows a count badge per state.
 */
export default function DocumentStatusFilter({
  value,
  onChange,
  counts,
}: DocumentStatusFilterProps) {
  return (
    <div className="inline-flex items-center rounded-full bg-background-100 border border-background-200 p-1">
      {OPTIONS.map((o) => {
        const selected = value === o.value;
        const count = counts?.[o.value] ?? 0;
        const showCount = count > 0;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={selected}
            aria-label={showCount ? `${o.label}, ${count}` : o.label}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-full transition-colors cursor-pointer whitespace-nowrap ${
              selected
                ? "bg-background-50 text-foreground-950"
                : "text-foreground-600 hover:text-foreground-900"
            }`}
          >
            <i className={o.icon}></i>
            {o.label}
            {showCount && (
              <span
                className={`ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold leading-none ${
                  o.value === "flagged"
                    ? "bg-accent-500 text-background-50 dark:text-foreground-950"
                    : "bg-background-200 text-foreground-700"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}