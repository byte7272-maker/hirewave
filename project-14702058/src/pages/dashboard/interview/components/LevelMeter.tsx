/**
 * Live mic waveform — a rolling window of RMS levels rendered as bars.
 * Purely visual: it never gates capture or submission.
 */
export default function LevelMeter({
  bars,
  active,
  className = "",
}: {
  bars: number[];
  /** Capture is live (full opacity) vs paused/stopped (dimmed). */
  active: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex items-end gap-[3px] h-9 ${className}`}
      role="img"
      aria-label={active ? "Microphone level — listening" : "Microphone level — paused"}
    >
      {bars.map((value, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full transition-[height] duration-100 ease-out ${
            active ? "bg-accent-500" : "bg-foreground-300"
          }`}
          style={{ height: `${Math.max(8, Math.min(100, value * 100))}%` }}
        />
      ))}
    </div>
  );
}