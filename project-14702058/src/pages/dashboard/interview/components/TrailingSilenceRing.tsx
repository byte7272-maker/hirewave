/**
 * Trailing-silence countdown — a small ring showing "finishing in N…" while the
 * candidate has paused long enough for the answer to be about to auto-submit.
 * Cancels (disappears) the instant they speak again.
 */
export default function TrailingSilenceRing({
  seconds,
  total,
}: {
  /** Whole seconds remaining before auto-submit. */
  seconds: number;
  /** Total seconds of required trailing silence. */
  total: number;
}) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (seconds / total) * 100)) : 0;
  return (
    <div className="inline-flex items-center gap-2" role="status" aria-live="polite">
      <div
        className="relative w-10 h-10 rounded-full flex-shrink-0"
        style={{
          background: `conic-gradient(oklch(var(--accent-500)) ${pct}%, oklch(var(--background-200)) ${pct}%)`,
        }}
      >
        <div className="absolute inset-[4px] rounded-full bg-background-50 flex items-center justify-center">
          <span className="font-heading text-sm font-semibold leading-none text-accent-600">
            {seconds}
          </span>
        </div>
      </div>
      <span className="text-xs font-medium text-accent-700 whitespace-nowrap">
        finishing in {seconds}…
      </span>
    </div>
  );
}