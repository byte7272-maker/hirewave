import type { VocabularyPace } from "@/lib/interview";

export interface PaceMeta {
  label: string;
  /** Tailwind classes for the pill. */
  className: string;
  icon: string;
}

/**
 * Pace pill styling. Grey = unknown, green = steady, amber = fast/slow,
 * red = rushed.
 */
export function paceMeta(pace: VocabularyPace | undefined): PaceMeta {
  switch (pace) {
    case "steady":
      return {
        label: "Steady pace",
        className: "bg-green-100 text-green-800 border-green-200",
        icon: "ri-checkbox-circle-line",
      };
    case "slow":
      return {
        label: "A little slow",
        className: "bg-amber-100 text-amber-800 border-amber-200",
        icon: "ri-timer-line",
      };
    case "fast":
      return {
        label: "A little fast",
        className: "bg-amber-100 text-amber-800 border-amber-200",
        icon: "ri-speed-up-line",
      };
    case "rushed":
      return {
        label: "Rushed",
        className: "bg-red-100 text-red-700 border-red-200",
        icon: "ri-alarm-warning-line",
      };
    default:
      return {
        label: "Pace —",
        className: "bg-background-200 text-foreground-600 border-background-300",
        icon: "ri-speed-line",
      };
  }
}

/** Which palette role the strength dial should use. */
export function scoreRole(score: number): "primary" | "secondary" | "accent" {
  if (score >= 80) return "primary";
  if (score >= 60) return "secondary";
  return "accent";
}

/** Filler-counter styling: neutral until it climbs, amber from 3 up. */
export function fillerChipClass(count: number): string {
  if (count >= 3) return "bg-amber-100 text-amber-800 border-amber-200";
  if (count === 0) return "bg-green-100 text-green-800 border-green-200";
  return "bg-background-100 text-foreground-700 border-background-200";
}

export function wordsPerMinuteLabel(wpm: number | undefined): string {
  if (typeof wpm !== "number" || !Number.isFinite(wpm)) return "Words per minute: —";
  return `Words per minute: ${Math.round(wpm)}`;
}