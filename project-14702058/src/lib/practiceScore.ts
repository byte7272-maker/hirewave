import type { RecapStats } from "@/lib/practiceRecap";

export type PracticeBand = "strong" | "good" | "fair";

export interface PracticeScore {
  /** Composite 0–100 score for the run. */
  score: number;
  band: PracticeBand;
  /** Short, human label for the band — mirrors the fit labels used elsewhere. */
  label: string;
}

/** How much each signal contributes to the composite (renormalised per run). */
const WEIGHTS = { pace: 0.3, vocab: 0.3, filler: 0.2, tips: 0.2 };

/** Map a composite score onto the shared emerald / coral / sand bands. */
export function practiceBand(score: number): PracticeBand {
  if (score >= 90) return "strong";
  if (score >= 85) return "good";
  return "fair";
}

const BAND_LABEL: Record<PracticeBand, string> = {
  strong: "Strong run",
  good: "Good run",
  fair: "Fair run",
};

/**
 * Blend a recap's pacing, vocabulary, filler and coaching-tip coverage into one
 * 0–100 "practice score" so sessions can be ranked best-first. Each signal only
 * contributes when the run actually carries it, and the weights are renormalised
 * over whatever is present — so a session with no vocabulary reads isn't unfairly
 * penalised. Returns null when there's no recap to score.
 */
export function practiceScore(stats: RecapStats | null | undefined): PracticeScore | null {
  if (!stats || stats.total <= 0) return null;

  const parts: Array<{ value: number; weight: number }> = [];

  // Pace: share of answers that landed in the suggested time band.
  parts.push({ value: (stats.on / stats.total) * 100, weight: WEIGHTS.pace });

  // Vocabulary strength, when any answer got a read.
  if (stats.avgVocab !== null) {
    parts.push({ value: stats.avgVocab, weight: WEIGHTS.vocab });
  }

  // Fillers: fewer is better; ~6 across a session bottoms it out.
  if (stats.fillerTurns > 0) {
    parts.push({ value: Math.max(0, 100 - stats.fillerTotal * 6), weight: WEIGHTS.filler });
  }

  // Coaching-tip coverage, when the coach offered any tips.
  if (stats.totalTips > 0) {
    const covered = stats.totalTips - stats.missedTips;
    parts.push({ value: (covered / stats.totalTips) * 100, weight: WEIGHTS.tips });
  }

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  const raw = parts.reduce((sum, p) => sum + p.value * p.weight, 0) / (totalWeight || 1);
  const score = Math.round(Math.max(0, Math.min(100, raw)));
  const band = practiceBand(score);
  return { score, band, label: BAND_LABEL[band] };
}