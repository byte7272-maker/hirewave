import Card from "@/components/base/Card";
import Badge from "@/components/base/Badge";
import CompanyAvatar from "@/components/feature/CompanyAvatar";
import SourceChip from "@/components/feature/SourceChip";
import type { DashboardTopMatch } from "@/lib/dashboard";

function fitTone(score: number): "primary" | "accent" | "secondary" {
  if (score >= 90) return "primary";
  if (score >= 85) return "accent";
  return "secondary";
}

function fitLabel(score: number): string {
  if (score >= 90) return "Strong fit";
  if (score >= 85) return "Good fit";
  return "Fair fit";
}

interface TopMatchCardProps {
  top: DashboardTopMatch | null;
}

/**
 * The dashboard's single highest-ranked role. It is composed from the design
 * system's `Card` surface and `Badge` chip so it reads as the very same material
 * as the stat cards directly above it — the score ring carries the metric, the
 * tone chip names the fit band, and the whole card lifts on hover when linked.
 */
export default function TopMatchCard({ top }: TopMatchCardProps) {
  if (!top) return null;

  const company = top.company?.trim() || "Company";
  const title = top.title?.trim() || "Untitled role";
  const score = typeof top.score === "number" ? Math.round(top.score) : null;
  const externalUrl = top.url || "";
  const internalPath =
    top.job_id != null && top.job_id !== "" ? `/dashboard/jobs/${top.job_id}` : "";
  const linked = Boolean(externalUrl || internalPath);

  return (
    <Card
      surface="tinted"
      padded
      interactive={linked}
      href={externalUrl || undefined}
      to={!externalUrl && internalPath ? internalPath : undefined}
      className="animate-fade-in-up"
    >
      <div className="flex items-center gap-4 md:gap-5">
        <CompanyAvatar company={company} logo={top.company_logo} size={56} />

        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-700">
            Your top match
          </p>
          <h3 className="mt-1 font-heading text-xl md:text-2xl font-medium text-foreground-950 truncate">
            {title}
          </h3>
          <p className="text-sm text-foreground-600 truncate mt-0.5">{company}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {top.salary_display && (
              <span className="text-sm font-semibold text-foreground-900 whitespace-nowrap">
                {top.salary_display}
              </span>
            )}
            {score !== null && (
              <Badge tone={fitTone(score)} dot>
                {fitLabel(score)}
              </Badge>
            )}
            <SourceChip platform={top.source_platform} display={top.source_display} />
          </div>
        </div>

        <div className="flex flex-col items-end gap-3 flex-shrink-0">
          {score !== null && (
            <div
              className="relative w-16 h-16 rounded-full"
              style={{
                background: `conic-gradient(oklch(var(--${fitTone(score)}-500)) ${score}%, oklch(var(--background-200)) ${score}% 100%)`,
              }}
              title={`${score}% fit`}
            >
              <div className="absolute inset-[4px] rounded-full bg-background-50 flex items-center justify-center">
                <span className="text-sm font-bold text-foreground-900">{score}</span>
              </div>
            </div>
          )}
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 whitespace-nowrap">
            View posting
            <i className="ri-external-link-line text-xs"></i>
          </span>
        </div>
      </div>
    </Card>
  );
}