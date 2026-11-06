import type { RecapTurn } from "@/lib/practiceRecap";
import { scoreRole } from "@/pages/dashboard/interview/components/vocabTone";

const BAR: Record<"primary" | "secondary" | "accent", string> = {
  primary: "bg-primary-500",
  secondary: "bg-secondary-500",
  accent: "bg-accent-500",
};

/** Whether a recap actually carries vocabulary strength to chart. */
export function hasStrengthData(turns: RecapTurn[]): boolean {
  return (turns ?? []).some((t) => typeof t.vocabScore === "number");
}

/**
 * A tiny strength-over-time sparkline for a practice-history row: one slim bar
 * per answered turn, height = that answer's final vocabulary score (0–100),
 * colored by strength band. Turns with no read collapse to a faint stub so the
 * turn sequence still lines up. Deliberately div-bars, not an SVG.
 *
 * When `onSelect` is passed it renders as a button so the row can reopen the
 * session's full recap.
 */
export default function StrengthSparkline({
  turns,
  className = "",
  onSelect,
}: {
  turns: RecapTurn[];
  className?: string;
  /** When provided, the sparkline becomes a button that reopens the recap. */
  onSelect?: () => void;
}) {
  const scores = (turns ?? []).map((t) =>
    typeof t.vocabScore === "number" ? t.vocabScore : null
  );
  if (!scores.some((s) => s !== null)) return null;

  const values = scores.filter((s): s is number => s !== null);
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);

  const bars = scores.map((score, i) =>
    score === null ? (
      <span
        key={i}
        className="w-1.5 h-1 rounded-full bg-background-300 self-end"
        aria-hidden="true"
      ></span>
    ) : (
      <span
        key={i}
        className={`w-1.5 rounded-sm transition-all duration-500 ${BAR[scoreRole(score)]}`}
        style={{ height: `${Math.max(14, Math.min(100, score))}%` }}
      ></span>
    )
  );

  const label = `Vocabulary strength across ${scores.length} turns, averaging ${avg} out of 100.`;
  const title = `Vocab strength per turn · avg ${avg}/100${onSelect ? " · open recap" : ""}`;

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