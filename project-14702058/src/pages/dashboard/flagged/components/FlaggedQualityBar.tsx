import { Card } from "@/components/base";
import FitBandBar, {
  type FitBand,
  type FitBandCounts,
} from "@/pages/dashboard/components/FitBandBar";

interface FlaggedQualityBarProps {
  /**
   * Fit score per flagged posting, cross-referenced from the matches pool.
   * `null` marks a posting that isn't in the pool (no honest band to show).
   */
  scores: Array<number | null>;
  /** The band currently filtering the list, or null for "all". */
  activeBand?: FitBand | null;
  /** Toggle a band filter on/off (clicking the active band clears it). */
  onBandChange?: (band: FitBand | null) => void;
}

/**
 * A compact, interactive read on the flagged set: how many postings land in each
 * fit band and the average fit across the ones we can score. Its segmented
 * distribution (shared `FitBandBar`) doubles as a filter — click Strong / Good /
 * Fair / Unscored to narrow the list, click again to clear. Postings we can't
 * score keep their own quiet "Unscored" segment instead of a fake band.
 */
export default function FlaggedQualityBar({
  scores,
  activeBand = null,
  onBandChange,
}: FlaggedQualityBarProps) {
  const total = scores.length;
  if (total === 0) return null;

  const scored = scores.filter(
    (s): s is number => typeof s === "number" && !Number.isNaN(s),
  );
  const strong = scored.filter((s) => s >= 90).length;
  const good = scored.filter((s) => s >= 85 && s < 90).length;
  const fair = scored.filter((s) => s < 85).length;
  const unscored = total - scored.length;
  const average = scored.length
    ? Math.round(scored.reduce((sum, s) => sum + s, 0) / scored.length)
    : 0;

  const counts: FitBandCounts = { total, strong, good, fair, unscored };

  return (
    <Card className="animate-fade-in-up p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary-100 text-primary-700 flex-shrink-0">
            <i className="ri-bar-chart-2-line text-lg"></i>
          </div>
          <div>
            <h2 className="font-heading text-base font-medium text-foreground-950">
              Fit band spread
            </h2>
            <p className="text-xs text-foreground-500">
              {total} flagged posting{total === 1 ? "" : "s"}
              {scored.length > 0 ? (
                <>
                  {" "}
                  · average{" "}
                  <strong className="font-semibold text-foreground-800">{average}%</strong> fit
                </>
              ) : (
                " · no fit scores yet"
              )}
            </p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-foreground-500 whitespace-nowrap">
          <i className="ri-cursor-line"></i>
          Click a band to filter
        </span>
      </div>

      <FitBandBar
        counts={counts}
        interactive
        activeBand={activeBand}
        onBandChange={onBandChange}
        className="mt-4"
      />
    </Card>
  );
}