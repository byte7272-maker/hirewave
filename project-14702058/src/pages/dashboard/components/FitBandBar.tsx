export type FitBand = "strong" | "good" | "fair" | "unscored";

export interface FitBandCounts {
  /** Total rows the distribution is measured against (scored + unscored). */
  total: number;
  strong: number;
  good: number;
  fair: number;
  /** Rows with no fit score (e.g. not in the matches pool). Omit to hide. */
  unscored?: number;
}

interface BandMeta {
  key: FitBand;
  label: string;
  range: string;
  dot: string;
  chip: string;
  seg: string;
}

const BANDS: BandMeta[] = [
  {
    key: "strong",
    label: "Strong",
    range: "90+",
    dot: "bg-primary-500",
    chip: "text-primary-800 bg-primary-100",
    seg: "bg-primary-500",
  },
  {
    key: "good",
    label: "Good",
    range: "85–89",
    dot: "bg-accent-500",
    chip: "text-accent-800 bg-accent-100",
    seg: "bg-accent-500",
  },
  {
    key: "fair",
    label: "Fair",
    range: "under 85",
    dot: "bg-secondary-500",
    chip: "text-secondary-800 bg-secondary-100",
    seg: "bg-secondary-400",
  },
];

const UNSCORED: BandMeta = {
  key: "unscored",
  label: "Unscored",
  range: "not in matches",
  dot: "bg-background-400",
  chip: "text-foreground-700 bg-background-200",
  seg: "bg-background-400",
};

export interface FitBandBarProps {
  counts: FitBandCounts;
  /** When true, each band chip + segment becomes a filter toggle. */
  interactive?: boolean;
  activeBand?: FitBand | null;
  onBandChange?: (band: FitBand | null) => void;
  className?: string;
}

/**
 * The single source of truth for the ranked "fit-band distribution" visual: a
 * legend of band chips over a segmented distribution bar. It backs the Matches
 * quality bar, the Flagged fit-band bar and the home Top-matches summary so the
 * ranked set reads identically everywhere. Pass `interactive` + `onBandChange`
 * to let a band chip (or its bar segment) filter a list down to just that band.
 */
export default function FitBandBar({
  counts,
  interactive = false,
  activeBand = null,
  onBandChange,
  className = "",
}: FitBandBarProps) {
  const { total } = counts;
  const bands = counts.unscored && counts.unscored > 0 ? [...BANDS, UNSCORED] : BANDS;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  const countOf = (key: FitBand): number => {
    if (key === "strong") return counts.strong;
    if (key === "good") return counts.good;
    if (key === "fair") return counts.fair;
    return counts.unscored ?? 0;
  };

  function toggle(band: FitBand) {
    if (!interactive || !onBandChange) return;
    onBandChange(activeBand === band ? null : band);
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        {bands.map((b) => {
          const isActive = interactive && activeBand === b.key;
          const inner = (
            <>
              <span className={`w-2 h-2 rounded-full ${b.dot}`}></span>
              {b.label} {b.range}
              <span className="opacity-70">· {countOf(b.key)}</span>
            </>
          );
          const base =
            `inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${b.chip} ` +
            (interactive ? "cursor-pointer transition-all hover:brightness-95 " : "") +
            (isActive ? "ring-2 ring-foreground-900/30" : "");

          return interactive ? (
            <button
              key={b.key}
              type="button"
              onClick={() => toggle(b.key)}
              className={base}
              aria-pressed={isActive}
              aria-label={`Filter to ${b.label} fit`}
            >
              {inner}
            </button>
          ) : (
            <span key={b.key} className={base}>
              {inner}
            </span>
          );
        })}
      </div>

      <div className="mt-4 h-2.5 rounded-full overflow-hidden flex bg-background-200">
        {bands.map((b) => {
          const n = countOf(b.key);
          if (n <= 0) return null;
          const isActive = interactive && activeBand === b.key;
          const unit = b.key === "unscored" ? "without a fit score" : `${b.label.toLowerCase()}-fit`;
          return (
            <button
              key={b.key}
              type="button"
              disabled={!interactive}
              onClick={() => toggle(b.key)}
              className={`h-full border-0 p-0 ${b.seg} ${
                interactive ? "cursor-pointer" : "cursor-default"
              } ${isActive ? "ring-2 ring-inset ring-foreground-900/30" : ""}`}
              style={{ width: `${pct(n)}%` }}
              title={`${n} ${unit}`}
              aria-label={`${b.label}: ${n}`}
            ></button>
          );
        })}
      </div>
    </div>
  );
}