import type { JobMatch } from "@/lib/jobs";
import FitBandBar, { type FitBand } from "@/pages/dashboard/components/FitBandBar";

interface MatchQualityBarProps {
  matches: JobMatch[];
  /**
   * When `onBandChange` is provided the bar becomes an interactive filter: each
   * band chip / segment toggles the active band (clicking the active one clears).
   */
  activeBand?: FitBand | null;
  onBandChange?: (band: FitBand | null) => void;
}

/**
 * A compact read on the current result set: how many roles fall in each fit
 * band and the average fit, with a single segmented distribution bar so the
 * shape of the list is legible before scrolling it. The distribution visual
 * itself lives in the shared `FitBandBar`, which doubles as a band filter when
 * `onBandChange` is supplied — matching the Flagged list.
 */
export default function MatchQualityBar({
  matches,
  activeBand = null,
  onBandChange,
}: MatchQualityBarProps) {
  const total = matches.length;
  const strong = matches.filter((m) => m.score >= 90).length;
  const good = matches.filter((m) => m.score >= 85 && m.score < 90).length;
  const fair = matches.filter((m) => m.score < 85).length;
  const average = total
    ? Math.round(matches.reduce((sum, m) => sum + m.score, 0) / total)
    : 0;
  const interactive = Boolean(onBandChange);

  return (
    <section className="animate-fade-in-up rounded-2xl bg-background-50 border border-background-200 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary-100 text-primary-700 flex-shrink-0">
            <i className="ri-bar-chart-2-line text-lg"></i>
          </div>
          <div>
            <h2 className="font-heading text-base font-medium text-foreground-950">
              Match quality
            </h2>
            <p className="text-xs text-foreground-500">
              {total} role{total === 1 ? "" : "s"} ranked · average{" "}
              <strong className="font-semibold text-foreground-800">{average}%</strong> fit
            </p>
          </div>
        </div>

        {interactive && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-foreground-500 whitespace-nowrap">
            <i className="ri-cursor-line"></i>
            Click a band to filter
          </span>
        )}
      </div>

      <FitBandBar
        counts={{ total, strong, good, fair }}
        interactive={interactive}
        activeBand={activeBand}
        onBandChange={onBandChange}
        className="mt-4"
      />
    </section>
  );
}