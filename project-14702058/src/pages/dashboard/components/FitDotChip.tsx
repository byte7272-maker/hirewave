import { fitTone, fitToneLabel, toneDot } from "@/pages/dashboard/components/tone";

interface FitDotChipProps {
  /** 0–100 fit score; renders nothing when absent. */
  score: number | null | undefined;
  className?: string;
}

/**
 * The small "fit dot" chip — a coloured dot plus the score band label, the same
 * treatment the Search result cards use. Shared so the home-screen widgets
 * (Top matches / Saved jobs) wear the identical band indicator, and the band
 * reads the same everywhere it appears.
 */
export default function FitDotChip({ score, className = "" }: FitDotChipProps) {
  if (score == null || Number.isNaN(score)) return null;

  const value = Math.round(score);
  const tone = fitTone(value);

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-background-200/70 text-foreground-800 whitespace-nowrap ${className}`}
      title={`${value}% fit`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${toneDot[tone]}`}></span>
      {fitToneLabel(value)}
    </span>
  );
}