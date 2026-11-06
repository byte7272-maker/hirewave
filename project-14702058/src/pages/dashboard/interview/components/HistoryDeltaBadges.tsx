import type { ReactElement } from "react";
import type { RecapStats } from "@/lib/practiceRecap";

/**
 * One "improved / slipped / held" delta chip. `betterWhen` says which direction
 * counts as an improvement (higher vocab is good, fewer fillers is good), so
 * the colour + arrow always read as progress rather than raw up/down.
 */
function DeltaChip({
  label,
  delta,
  betterWhen,
}: {
  label: string;
  delta: number;
  betterWhen: "up" | "down";
}) {
  const flat = delta === 0;
  const improved = betterWhen === "up" ? delta > 0 : delta < 0;
  const arrow = delta > 0 ? "ri-arrow-up-line" : "ri-arrow-down-line";
  const tone = flat
    ? "bg-background-200 text-foreground-500"
    : improved
      ? "bg-green-100 text-green-800"
      : "bg-accent-100 text-accent-900";
  const icon = flat ? "ri-subtract-line" : arrow;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const title = flat
    ? `${label}: no change vs the previous session`
    : improved
      ? `${label}: improved by ${Math.abs(delta)} vs the previous session`
      : `${label}: slipped by ${Math.abs(delta)} vs the previous session`;

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${tone}`}
    >
      <i className={icon}></i>
      {sign}
      {Math.abs(delta)} {label}
    </span>
  );
}

/**
 * Per-session delta chips comparing a run against the one before it — average
 * vocabulary score (higher is better) and total filler words (lower is better).
 * Renders nothing when there is no earlier run to compare against, or when
 * neither signal is available on both sides.
 */
export default function HistoryDeltaBadges({
  current,
  prior,
}: {
  current: RecapStats;
  prior: RecapStats | null;
}) {
  if (!prior) return null;

  const chips: ReactElement[] = [];

  if (current.avgVocab !== null && prior.avgVocab !== null) {
    chips.push(
      <DeltaChip
        key="vocab"
        label="vocab"
        delta={current.avgVocab - prior.avgVocab}
        betterWhen="up"
      />
    );
  }

  if (current.fillerTurns > 0 && prior.fillerTurns > 0) {
    chips.push(
      <DeltaChip
        key="filler"
        label="fillers"
        delta={current.fillerTotal - prior.fillerTotal}
        betterWhen="down"
      />
    );
  }

  if (chips.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] font-medium text-foreground-400 whitespace-nowrap">
        vs last session
      </span>
      {chips}
    </span>
  );
}