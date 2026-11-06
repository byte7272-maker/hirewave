import { Card } from "@/components/base";
import FitBandBar, {
  type FitBandCounts,
} from "@/pages/dashboard/components/FitBandBar";

interface SavedQualityBarProps {
  /**
   * Fit score per saved role, cross-referenced from the matches pool. `null`
   * marks a saved role that isn't in the pool (no honest band to show).
   */
  scores: Array<number | null>;
}

/**
 * A compact, read-only read on the saved set: how many bookmarked roles land in
 * each fit band and the average fit across the ones we can score. It reuses the
 * shared `FitBandBar`, so a saved role's cross-referenced band reads identically
 * to Matches and Flagged. Roles we can't score keep their own quiet "Unscored"
 * segment instead of a fake band.
 */
export default function SavedQualityBar({ scores }: SavedQualityBarProps) {
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
    <Card className="animate-fade-in-up p-5" style={{ animationDelay: "0.02s" }}>
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary-100 text-primary-700 flex-shrink-0">
          <i className="ri-bar-chart-2-line text-lg"></i>
        </div>
        <div>
          <h2 className="font-heading text-base font-medium text-foreground-950">
            Saved fit spread
          </h2>
          <p className="text-xs text-foreground-500">
            {total} saved role{total === 1 ? "" : "s"}
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

      <FitBandBar counts={counts} className="mt-4" />
    </Card>
  );
}