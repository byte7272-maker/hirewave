import type { RecapTurn } from "@/lib/practiceRecap";

/** Whether a recap actually carries filler counts to chart. */
export function hasFillerData(turns: RecapTurn[]): boolean {
  return (turns ?? []).some((t) => typeof t.fillerCount === "number");
}

/** Filler-bar color: red once a turn spikes to 3+, amber when present. */
function barClass(count: number): string {
  if (count >= 3) return "bg-red-500";
  if (count === 0) return "bg-background-300";
  return "bg-amber-400";
}

/**
 * A tiny filler-count-over-time sparkline for a practice-history row: one slim
 * bar per answered turn, height = that answer's filler count, colored by
 * severity. Turns with no read collapse to a faint stub so the sequence still
 * lines up. Deliberately div-bars, not an SVG.
 *
 * When `onSelect` is passed it renders as a button so the row can reopen the
 * session's full recap.
 */
export default function FillerSparkline({
  turns,
  className = "",
  onSelect,
}: {
  turns: RecapTurn[];
  className?: string;
  /** When provided, the sparkline becomes a button that reopens the recap. */
  onSelect?: () => void;
}) {
  const counts = (turns ?? []).map((t) =>
    typeof t.fillerCount === "number" ? t.fillerCount : null
  );
  if (!counts.some((c) => c !== null)) return null;

  const values = counts.filter((c): c is number => c !== null);
  const total = values.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...values);

  const bars = counts.map((count, i) => {
    if (count === null) {
      return (
        <span
          key={i}
          className="w-1.5 h-1 rounded-full bg-background-300 self-end"
          aria-hidden="true"
        ></span>
      );
    }
    const heightPct = count === 0 ? 6 : Math.max(14, Math.round((count / max) * 100));
    return (
      <span
        key={i}
        className={`w-1.5 rounded-sm transition-all duration-500 ${barClass(count)}`}
        style={{ height: `${heightPct}%` }}
      ></span>
    );
  });

  const label = `Filler words across ${counts.length} turns, ${total} total.`;
  const title = `Fillers per turn · ${total} total${onSelect ? " · open recap" : ""}`;

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-label={label}
        title={title}
        className={`inline-flex items-end gap-[3px] h-6 rounded-sm cursor-pointer transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-primary-400 ${className}`}
      >
        {bars}
      </button>
    );
  }

  return (
    <span
      className={`inline-flex items-end gap-[3px] h-6 ${className}`}
      role="img"
      aria-label={label}
      title={title}
    >
      {bars}
    </span>
  );
}