interface GradeBadgeProps {
  grade?: string;
  score?: number;
}

function gradeLightTone(grade: string) {
  const g = (grade || "").trim().toUpperCase();
  if (g.startsWith("A")) return "bg-primary-100 text-primary-700";
  if (g.startsWith("B")) return "bg-secondary-100 text-secondary-700";
  return "bg-accent-100 text-accent-900";
}

export default function GradeBadge({ grade, score }: GradeBadgeProps) {
  const g = (grade || "").trim().toUpperCase();
  if (!g) return null;

  const hasScore = typeof score === "number" && !Number.isNaN(score);

  return (
    <span
      title="Quality grade"
      className={`inline-flex items-center justify-center gap-1 h-7 px-2.5 rounded-md text-xs font-bold cursor-help whitespace-nowrap ${gradeLightTone(g)}`}
    >
      {g}
      {hasScore && (
        <span className="font-semibold opacity-75">· {Math.round(score)}</span>
      )}
    </span>
  );
}