import { Link } from "react-router-dom";

interface ResumeReadyChipProps {
  /** The résumé doc the tailored version lives on (enables a jump-to link). */
  docId?: string | null;
  /** The saved version tailored to the role. Nothing renders when absent. */
  version?: string | null;
  /** The tailored résumé's ATS score, when known. */
  atsScore?: number | null;
  /** Drop the version number for a tighter chip (used on board cards). */
  compact?: boolean;
  className?: string;
}

/**
 * A tiny "Résumé v2 ready · ATS 88" chip shared by the pipeline rows and the
 * kanban cards, so prepped roles read the same way everywhere. Links straight to
 * the tailored résumé when we know which doc it lives on.
 */
export default function ResumeReadyChip({
  docId,
  version,
  atsScore,
  compact = false,
  className = "",
}: ResumeReadyChipProps) {
  if (!version) return null;

  const href = docId ? `/dashboard/documents/resumes/${docId}` : null;
  const title =
    typeof atsScore === "number"
      ? `Tailored résumé ready — ATS score ${atsScore}`
      : "Tailored résumé ready for this role";

  const body = (
    <>
      <i className="ri-file-check-line"></i>
      {compact ? "Résumé ready" : `Résumé v${version} ready`}
      {typeof atsScore === "number" && (
        <span className="text-primary-600">· ATS {atsScore}</span>
      )}
    </>
  );

  const base = `inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 whitespace-nowrap ${className}`;

  if (href) {
    return (
      <Link to={href} title={title} className={`${base} hover:bg-primary-200 transition-colors cursor-pointer`}>
        {body}
      </Link>
    );
  }

  return (
    <span className={base} title={title}>
      {body}
    </span>
  );
}