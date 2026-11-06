import { paceOf, type PaceBand, type RecapTurn } from "@/lib/practiceRecap";
import { formatCountdown } from "@/lib/interviewPractice";

const BAR_CLASS: Record<PaceBand, string> = {
  short: "bg-secondary-400",
  on: "bg-primary-500",
  long: "bg-accent-500",
};

const LEGEND: { band: PaceBand; label: string }[] = [
  { band: "short", label: "Brief" },
  { band: "on", label: "On pace" },
  { band: "long", label: "Long" },
];

/**
 * Compact pacing trend: one bar per turn (height = your answer time), with a
 * dashed tick marking that turn's suggested time. Deliberately bars-over-time
 * rather than a plain line, so "vs target" is readable at a glance.
 */
export default function PacingSparkline({ turns }: { turns: RecapTurn[] }) {
  const list = turns ?? [];
  if (list.length === 0) return null;

  const max = Math.max(
    1,
    ...list.map((t) => Math.max(t.responseSeconds, t.targetSeconds)),
  );
  const avgResponse = Math.round(list.reduce((s, t) => s + t.responseSeconds, 0) / list.length);
  const avgTarget = Math.round(list.reduce((s, t) => s + t.targetSeconds, 0) / list.length);
  const onCount = list.filter((t) => paceOf(t) === "on").length;
  const trend =
    avgTarget > 0 && avgResponse <= avgTarget
      ? { icon: "ri-arrow-down-line", label: "Trending at or under target", cls: "text-primary-700" }
      : { icon: "ri-arrow-up-line", label: "Trending over target", cls: "text-accent-700" };

  return (
    <div className="rounded-xl bg-background-50 border border-background-200 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 flex items-center justify-center rounded-lg bg-secondary-100 text-secondary-700">
            <i className="ri-line-chart-line text-sm"></i>
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground-950">Pacing trend</h3>
            <p className="text-[11px] text-foreground-500">
              Bar = your time · dashed tick = target, turn by turn
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold text-foreground-900">
            avg {formatCountdown(avgResponse)} vs {formatCountdown(avgTarget)} target
          </div>
          <div className={`text-[11px] inline-flex items-center gap-1 ${trend.cls}`}>
            <i className={trend.icon}></i>
            {trend.label}
          </div>
        </div>
      </div>

      <div
        className="mt-4 flex items-end gap-1.5 h-20"
        role="img"
        aria-label={`Pacing across ${list.length} turns, averaging ${avgResponse} seconds against a ${avgTarget} second target.`}
      >
        {list.map((turn, index) => {
          const band = paceOf(turn);
          const heightPct = Math.max(6, Math.round((turn.responseSeconds / max) * 100));
          const targetPct = Math.min(100, Math.round((turn.targetSeconds / max) * 100));
          return (
            <div
              key={index}
              className="relative flex-1 h-full flex items-end"
              title={`Q${index + 1}: you ${formatCountdown(turn.responseSeconds)} · target ${formatCountdown(turn.targetSeconds)}`}
            >
              <span
                className="absolute left-0 right-0 border-t border-dashed border-foreground-400/70"
                style={{ bottom: `${targetPct}%` }}
                aria-hidden="true"
              ></span>
              <div
                className={`relative w-full rounded-t-md transition-all duration-500 ${BAR_CLASS[band]}`}
                style={{ height: `${heightPct}%` }}
              ></div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {LEGEND.map((item) => (
            <span key={item.band} className="inline-flex items-center gap-1.5 text-[11px] text-foreground-600 whitespace-nowrap">
              <span className={`w-2.5 h-2.5 rounded-sm ${BAR_CLASS[item.band]}`}></span>
              {item.label}
            </span>
          ))}
        </div>
        <span className="text-[11px] text-foreground-500 whitespace-nowrap">
          {onCount}/{list.length} on pace
        </span>
      </div>
    </div>
  );
}