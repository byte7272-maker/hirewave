import GlossaryText from "@/components/feature/GlossaryText";

interface AddressedFindingsProps {
  /**
   * The AI Review findings (suggestion titles) this saved version was asked to
   * fix. Shown as a traceability strip on the accepted-version preview.
   */
  findings: string[];
}

/**
 * Traceability strip for an accepted version's preview: lists the AI Review
 * findings that version addressed, so the reasoning behind a saved revision
 * stays visible long after the improve session that produced it ended.
 */
export default function AddressedFindings({ findings }: AddressedFindingsProps) {
  if (findings.length === 0) return null;

  return (
    <div className="rounded-xl border border-secondary-200 bg-secondary-50 px-4 py-3 flex items-start gap-3">
      <span className="w-7 h-7 flex items-center justify-center rounded-md bg-secondary-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
        <i className="ri-list-check-2"></i>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground-900">
          {findings.length === 1
            ? "Addressed 1 review finding"
            : `Addressed ${findings.length} review findings`}
        </p>
        <p className="text-xs text-foreground-500 mt-0.5">
          Kept for traceability — this version was improved against these review points.
        </p>
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {findings.map((finding, index) => (
            <span
              key={`${finding}-${index}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-700 bg-background-50 border border-secondary-200 px-2.5 py-1 rounded-full max-w-full"
            >
              <i className="ri-check-line text-primary-600 flex-shrink-0"></i>
              <span className="min-w-0">
                <GlossaryText text={finding} interactive={false} />
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}