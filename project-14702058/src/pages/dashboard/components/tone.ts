export type Tone = "primary" | "accent" | "secondary" | "foreground" | "background";

export const toneIconBg: Record<Tone, string> = {
  primary: "bg-primary-500 text-background-50 dark:text-foreground-950",
  accent: "bg-accent-500 text-background-50 dark:text-foreground-950",
  secondary: "bg-secondary-500 text-background-50 dark:text-foreground-950",
  foreground: "bg-foreground-950 text-background-50",
  background: "bg-background-200 text-foreground-700",
};

export const toneBadge: Record<Tone, string> = {
  primary: "bg-primary-100 text-primary-900",
  accent: "bg-accent-100 text-accent-900",
  secondary: "bg-secondary-100 text-secondary-900",
  foreground: "bg-foreground-100 text-foreground-800",
  background: "bg-background-200 text-foreground-700",
};

export const toneBar: Record<Tone, string> = {
  primary: "bg-primary-400",
  accent: "bg-accent-400",
  secondary: "bg-secondary-400",
  foreground: "bg-foreground-400",
  background: "bg-background-400",
};

export const toneDot: Record<Tone, string> = {
  primary: "bg-primary-500",
  accent: "bg-accent-500",
  secondary: "bg-secondary-500",
  foreground: "bg-foreground-700",
  background: "bg-background-400",
};

/**
 * Map a 0–100 match/fit score onto one of the three brand tones so a role's
 * "quality band" is consistent everywhere it is shown (score ring, rank badge,
 * quality spine, distribution bar). 90+ leads with emerald, 85–89 with coral,
 * and everything else quietly sits on sand.
 */
export function fitTone(score: number): Tone {
  if (score >= 90) return "primary";
  if (score >= 85) return "accent";
  return "secondary";
}

/** Short, human label for a fit score — pairs with the score ring. */
export function fitToneLabel(score: number): string {
  if (score >= 90) return "Strong fit";
  if (score >= 85) return "Good fit";
  return "Fair fit";
}

export interface FitSpine {
  /** CSS color for a spine bar (already an oklch() string). */
  color: string;
  /** The fit tone when a score exists, otherwise null. */
  tone: Tone | null;
  /** The fit label when a score exists, otherwise null. */
  label: string | null;
}

/**
 * Resolve a fit score (or its absence) into a spine + label treatment. When a
 * score exists it maps onto the emerald / coral / sand fit band; when it doesn't
 * (e.g. a saved role that isn't in the matches pool) it falls back to a quiet
 * neutral spine so the list still reads as ranked.
 */
export function fitSpine(score: number | null | undefined): FitSpine {
  if (score == null || Number.isNaN(score)) {
    return { color: "oklch(var(--foreground-300))", tone: null, label: null };
  }
  const tone = fitTone(score);
  return { color: `oklch(var(--${tone}-500) / 0.85)`, tone, label: fitToneLabel(score) };
}