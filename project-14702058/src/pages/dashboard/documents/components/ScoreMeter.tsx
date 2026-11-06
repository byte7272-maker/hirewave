interface ScoreMeterProps {
  score: number;
  label?: string;
  size?: "sm" | "lg";
}

function toneForScore(score: number) {
  if (score >= 75) return { bar: "bg-primary-500", text: "text-primary-700" };
  if (score >= 50) return { bar: "bg-secondary-500", text: "text-secondary-700" };
  return { bar: "bg-accent-500", text: "text-accent-700" };
}

export default function ScoreMeter({ score, label, size = "sm" }: ScoreMeterProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score || 0)));
  const tone = toneForScore(clamped);
  const lg = size === "lg";

  return (
    <div>
      <div className="flex items-center gap-3">
        <span
          className={`font-heading font-medium ${tone.text} ${
            lg ? "text-4xl" : "text-2xl"
          }`}
        >
          {clamped}
        </span>
        <div className="flex-1 min-w-0">
          <div
            className={`w-full rounded-full bg-background-200 overflow-hidden ${
              lg ? "h-3" : "h-2"
            }`}
          >
            <div
              className={`h-full ${tone.bar} rounded-full transition-all duration-500`}
              style={{ width: `${clamped}%` }}
            />
          </div>
          {label && (
            <span className="block text-xs text-foreground-500 mt-1">{label}</span>
          )}
        </div>
      </div>
    </div>
  );
}