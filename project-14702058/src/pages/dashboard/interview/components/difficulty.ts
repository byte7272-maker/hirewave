export type Difficulty = "easy" | "normal" | "hard";

export function normalizeDifficulty(d?: string): Difficulty {
  const v = (d ?? "").trim().toLowerCase();
  if (v === "easy") return "easy";
  if (v === "hard") return "hard";
  return "normal";
}

export function difficultyLabel(d?: string): string {
  const v = normalizeDifficulty(d);
  if (v === "easy") return "Easy";
  if (v === "hard") return "Hard";
  return "Normal";
}

export function difficultyStyle(d?: string): string {
  const v = normalizeDifficulty(d);
  if (v === "easy") return "bg-green-100 text-green-800";
  if (v === "hard") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-800";
}