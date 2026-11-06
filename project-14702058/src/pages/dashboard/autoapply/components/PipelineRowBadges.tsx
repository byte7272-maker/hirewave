import ResumeReadyChip from "@/components/feature/ResumeReadyChip";

interface PipelineRowBadgesProps {
  /** Résumé doc id the tailored version lives on (enables a jump-to link). */
  docId?: string | null;
  /** The saved version tailored to this role, when one exists. */
  version?: string | null;
  /** The tailored résumé's ATS score, when known. */
  atsScore?: number | null;
  /** Gaps the tailored version covered, and the total measured for the role. */
  covered?: number;
  total?: number;
  /** Keyword gaps between the job and the résumé. */
  gaps?: string[];
  /** Whether we actually have match data for this role (so "no gaps" is a real signal). */
  matched?: boolean;
  /** How many gap chips to show before collapsing the rest into "+N". */
  maxGaps?: number;
}

/**
 * The per-row meta on a pipeline role: whether a tailored résumé version is
 * ready (with its version + ATS score) and — always — the keyword gaps between
 * the role and the résumé, so it is obvious what a role still needs without
 * opening anything.
 */
export default function PipelineRowBadges({
  docId,
  version,
  atsScore,
  covered,
  total,
  gaps = [],
  matched = false,
  maxGaps = 3,
}: PipelineRowBadgesProps) {
  const hasCoverage =
    typeof covered === "number" && typeof total === "number" && total > 0;
  if (!version && gaps.length === 0) return null;

  const shown = gaps.slice(0, maxGaps);
  const extra = gaps.length - shown.length;

  return (
    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
      {version && (
        <ResumeReadyChip docId={docId} version={version} atsScore={atsScore} />
      )}

      {version && hasCoverage && (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-900 whitespace-nowrap"
          title={`Your tailored version covers ${covered} of ${total} gaps for this role`}
        >
          <i className="ri-focus-2-line"></i>
          {covered}/{total} gaps covered
        </span>
      )}

      {gaps.length > 0 ? (
        <span
          className="inline-flex items-center gap-1.5 flex-wrap"
          title={`Missing keywords: ${gaps.join(", ")}`}
        >
          <span className="text-[11px] font-semibold text-foreground-500 whitespace-nowrap">
            <i className="ri-error-warning-line mr-1"></i>
            Missing keywords
          </span>
          {shown.map((gap) => (
            <span
              key={gap}
              className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-accent-100 text-accent-900 whitespace-nowrap"
            >
              {gap}
            </span>
          ))}
          {extra > 0 && (
            <span className="text-[11px] font-semibold text-foreground-500 whitespace-nowrap">
              +{extra}
            </span>
          )}
        </span>
      ) : (
        matched &&
        version && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-background-200/70 text-foreground-600 whitespace-nowrap">
            <i className="ri-check-line"></i>
            No missing keywords
          </span>
        )
      )}
    </div>
  );
}