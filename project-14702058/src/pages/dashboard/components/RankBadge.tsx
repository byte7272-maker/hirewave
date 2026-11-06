/** Medal styling for the top three ranks; everything else stays quiet. */
const RANK_STYLES = [
  "bg-primary-500 text-background-50 dark:text-foreground-950",
  "bg-secondary-500 text-background-50 dark:text-foreground-950",
  "bg-accent-500 text-background-50 dark:text-foreground-950",
];

interface RankBadgeProps {
  /** 1-based position of the row/card in its list. */
  rank: number;
  size?: "sm" | "md";
  /** "medal" tints the top three; "neutral" keeps every badge quiet. */
  variant?: "medal" | "neutral";
  className?: string;
}

/**
 * One rank badge shared by the Matches rows, Saved jobs rows and Search result
 * cards, so "the ranked shortlist" language reads identically everywhere. The
 * top three get a medal tint (emerald / clay / coral); the rest stay neutral.
 */
export default function RankBadge({
  rank,
  size = "md",
  variant = "medal",
  className = "",
}: RankBadgeProps) {
  const medal = variant === "medal" && rank <= 3;
  const style = medal ? RANK_STYLES[rank - 1] : "bg-background-200 text-foreground-500";
  const dim = size === "sm" ? "w-6 h-6 text-[11px]" : "w-7 h-7 text-xs";

  return (
    <span
      className={`flex-shrink-0 flex items-center justify-center rounded-full font-bold ${dim} ${style} ${className}`}
      title={`Rank #${rank}`}
      aria-label={`Rank ${rank}`}
    >
      {rank}
    </span>
  );
}