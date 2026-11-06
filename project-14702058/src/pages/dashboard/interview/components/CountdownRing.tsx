import { formatCountdown } from "@/lib/interviewPractice";

/**
 * A CSS (conic-gradient) countdown ring — no SVG required. Turns coral as time
 * runs low so the candidate can feel the pace at a glance.
 */
export default function CountdownRing({
  remaining,
  total,
}: {
  remaining: number;
  total: number;
}) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
  const low = remaining <= 15;
  const ring = low ? "oklch(var(--accent-500))" : "oklch(var(--primary-500))";

  return (
    <div
      className="relative w-[76px] h-[76px] flex-shrink-0 rounded-full"
      style={{ background: `conic-gradient(${ring} ${pct}%, oklch(var(--background-200)) ${pct}%)` }}
      role="timer"
      aria-label={`${remaining} seconds remaining`}
    >
      <div className="absolute inset-[6px] rounded-full bg-background-50 flex flex-col items-center justify-center">
        <span
          className={`font-heading text-lg font-semibold leading-none ${low ? "text-accent-600" : "text-foreground-950"}`}
        >
          {formatCountdown(remaining)}
        </span>
        <span className="text-[10px] text-foreground-500 leading-none mt-0.5">left</span>
      </div>
    </div>
  );
}