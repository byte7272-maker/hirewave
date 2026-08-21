"use client";

// Small presentational helpers shared across pages.

export function ScoreBar({ value }: { value: number }) {
  return (
    <div className="meter" role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function VerificationBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined) return null;
  if (score >= 70)
    return <span className="badge green">✓ Verified · {score}</span>;
  if (score >= 40)
    return <span className="badge amber">⚠ Caution · {score}</span>;
  return <span className="badge red">⛔ High risk · {score}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "",
    submitted: "blue",
    interviewing: "amber",
    offered: "green",
    rejected: "red",
  };
  return <span className={`badge ${map[status] ?? ""}`}>{status}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="row between" style={{ marginBottom: 22, alignItems: "flex-start" }}>
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted" style={{ margin: 0 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
