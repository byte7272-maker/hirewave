interface AuthenticityBadgeProps {
  score?: number;
  className?: string;
}

/**
 * Trust/authenticity badge shown on jobs. Score is 0–100:
 *   ≥ 80  → verified (primary)
 *   50–79 → review (secondary)
 *   < 50  → caution (accent)
 */
export default function AuthenticityBadge({ score, className = "" }: AuthenticityBadgeProps) {
  if (typeof score !== "number" || Number.isNaN(score)) return null;

  const verified = score >= 80;
  const caution = score < 50;
  const label = verified ? "Verified" : caution ? "Caution" : "Review";
  const icon = verified ? "ri-shield-check-line" : caution ? "ri-alert-line" : "ri-shield-star-line";

  const tone = verified
    ? "bg-primary-100 text-primary-700"
    : caution
      ? "bg-accent-100 text-accent-900"
      : "bg-secondary-100 text-secondary-900";

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${tone} ${className}`}
      title={`Authenticity score ${score}/100`}
    >
      <i className={icon}></i>
      {label}
    </span>
  );
}