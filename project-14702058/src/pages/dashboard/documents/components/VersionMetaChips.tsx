import type { DocumentVersion } from "@/lib/documents";
import HoverTooltip from "@/components/base/HoverTooltip";

function formatDate(v?: string) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Trim an applied instruction to a compact one-line chip label. */
function truncate(text: string, max: number): string {
  const t = (text === null || text === undefined ? "" : String(text))
    .trim()
    .replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max).trimEnd()}\u2026` : t;
}

interface VersionMetaChipsProps {
  version?: DocumentVersion;
  /**
   * How many bullets a bulk strengthen pass changed on this version. When set
   * (> 0), a small tracer chip shows the count, so a whole-document AI pass is
   * auditable right on the version it produced.
   */
  bulletsStrengthened?: number;
  /**
   * The instruction this version was produced by (direct apply or an accepted
   * preview). When set, an "Applied: …" chip shows on the version card header,
   * so an AI-applied version is traceable without opening the version dropdown.
   */
  appliedInstruction?: string;
  /**
   * When provided, the applied-instruction bubble offers a one-click
   * "Re-run this instruction" action that re-applies the command.
   */
  onRerunInstruction?: (instruction: string) => void;
}

export default function VersionMetaChips({
  version,
  bulletsStrengthened = 0,
  appliedInstruction = "",
  onRerunInstruction,
}: VersionMetaChipsProps) {
  if (!version) return null;

  const date = formatDate(version.created_at);
  const applied = appliedInstruction.trim();
  const hasAny = Boolean(
    version.job_title || version.source || date || bulletsStrengthened > 0 || applied
  );
  if (!hasAny) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {applied && (
        <HoverTooltip
          title="Applied instruction"
          label={applied}
          actionLabel={onRerunInstruction ? "Re-run this instruction" : undefined}
          onAction={onRerunInstruction ? () => onRerunInstruction(applied) : undefined}
        >
          <span className="inline-flex items-center gap-1 max-w-[280px] text-xs font-medium text-primary-900 bg-primary-100 px-2 py-0.5 rounded-full whitespace-nowrap cursor-help">
            <i className="ri-flashlight-line flex-shrink-0"></i>
            <span className="truncate">Applied: {truncate(applied, 36)}</span>
          </span>
        </HoverTooltip>
      )}
      {bulletsStrengthened > 0 && (
        <span
          className="inline-flex items-center gap-1 text-xs font-medium text-accent-900 bg-accent-100 px-2 py-0.5 rounded-full whitespace-nowrap"
          title="This version was produced by a bulk AI strengthen pass"
        >
          <i className="ri-rocket-2-line"></i>
          {bulletsStrengthened} bullet{bulletsStrengthened === 1 ? "" : "s"} strengthened
        </span>
      )}
      {version.job_title && (
        <HoverTooltip title="Tailored to" label={version.job_title}>
          <span className="inline-flex items-center gap-1 max-w-[220px] text-xs font-medium text-foreground-600 bg-background-200/70 px-2 py-0.5 rounded-full whitespace-nowrap cursor-help">
            <i className="ri-briefcase-line flex-shrink-0"></i>
            <span className="truncate">{version.job_title}</span>
          </span>
        </HoverTooltip>
      )}
      {version.source && (
        <HoverTooltip title="Source" label={version.source}>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground-600 bg-background-200/70 px-2 py-0.5 rounded-full uppercase whitespace-nowrap cursor-help">
            <i className="ri-git-commit-line"></i>
            {version.source}
          </span>
        </HoverTooltip>
      )}
      {date && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground-600 bg-background-200/70 px-2 py-0.5 rounded-full whitespace-nowrap">
          <i className="ri-calendar-line"></i>
          {date}
        </span>
      )}
    </div>
  );
}