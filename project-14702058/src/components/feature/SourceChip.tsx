export interface BoardMeta {
  label: string;
  mark: string;
  color: string;
}

// Brand-ish marks for the job boards we ingest from. Colors are intentionally
// brand-derived (logos are allowed to keep their own colors) while the chip
// itself stays on the neutral background scale.
const BOARD_META: Record<string, BoardMeta> = {
  linkedin: { label: "LinkedIn", mark: "in", color: "#0A66C2" },
  indeed: { label: "Indeed", mark: "Id", color: "#2557A7" },
  greenhouse: { label: "Greenhouse", mark: "Gh", color: "#2E8B57" },
  glassdoor: { label: "Glassdoor", mark: "Gd", color: "#0CAA41" },
  lever: { label: "Lever", mark: "Le", color: "#475569" },
  workday: { label: "Workday", mark: "Wd", color: "#E8590C" },
  wellfound: { label: "Wellfound", mark: "Wf", color: "#1F2937" },
  angelist: { label: "AngelList", mark: "Al", color: "#1F2937" },
  builtin: { label: "Built In", mark: "Bi", color: "#0E7490" },
  "company sites": { label: "Company site", mark: "Co", color: "#6B7280" },
  company: { label: "Company site", mark: "Co", color: "#6B7280" },
};

/** Resolve board metadata from either a lowercase key ("linkedin") or a display name ("LinkedIn"). */
export function getBoardMeta(platform?: string): BoardMeta | null {
  if (!platform) return null;
  const key = platform.trim().toLowerCase();
  if (BOARD_META[key]) return BOARD_META[key];
  for (const meta of Object.values(BOARD_META)) {
    if (meta.label.toLowerCase() === key) return meta;
  }
  return null;
}

/** Small colored brand mark, usable inline wherever a board glyph is needed. */
export function BoardMark({
  platform,
  size = "w-4 h-4 text-[9px]",
}: {
  platform?: string;
  size?: string;
}) {
  const meta = getBoardMeta(platform);
  const mark = meta?.mark ?? (platform ? platform.charAt(0).toUpperCase() : "•");
  const color = meta?.color ?? "#6B7280";
  return (
    <span
      className={`${size} flex items-center justify-center rounded-[4px] text-white font-bold leading-none flex-shrink-0`}
      style={{ backgroundColor: color }}
    >
      {mark}
    </span>
  );
}

interface SourceChipProps {
  platform?: string;
  display?: string;
  className?: string;
}

/** Board source chip: a brand mark + display name, used across all job card surfaces. */
export default function SourceChip({ platform, display, className = "" }: SourceChipProps) {
  const meta = getBoardMeta(platform);
  const label = display?.trim() || meta?.label || platform?.trim();
  if (!label) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-background-200/70 text-foreground-700 whitespace-nowrap ${className}`}
    >
      <BoardMark platform={platform} />
      {label}
    </span>
  );
}