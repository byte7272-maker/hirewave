import { Link } from "react-router-dom";
import type { JobMatchVM } from "@/lib/backend";
import { useSavedJobs } from "@/lib/saved";
import AuthenticityBadge from "@/pages/dashboard/components/AuthenticityBadge";
import ShareJob from "@/pages/dashboard/components/ShareJob";
import AutofillPreview from "@/pages/dashboard/components/AutofillPreview";

function fitTone(score: number): "primary" | "accent" | "secondary" {
  if (score >= 85) return "primary";
  if (score >= 70) return "accent";
  return "secondary";
}

interface JobMatchesProps {
  matches: JobMatchVM[];
  limit?: number;
  showViewAll?: boolean;
  title?: string;
  subtitle?: string;
  onApply?: (job: JobMatchVM) => void;
  applyingId?: string | null;
}

export default function JobMatches({
  matches,
  limit,
  showViewAll = true,
  title = "Top matches",
  subtitle = "Ranked by fit",
  onApply,
  applyingId,
}: JobMatchesProps) {
  const { isSaved, toggle } = useSavedJobs();
  const shown = limit ? matches.slice(0, limit) : matches;

  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-background-200">
        <div>
          <h2 className="font-heading text-xl font-medium text-foreground-950">{title}</h2>
          <p className="text-xs text-foreground-500 mt-0.5">{subtitle}</p>
        </div>
        {showViewAll && (
          <Link
            to="/dashboard/matches"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
          >
            View all
            <i className="ri-arrow-right-line"></i>
          </Link>
        )}
      </div>

      {matches.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-xl bg-background-200 text-foreground-500 mb-3">
            <i className="ri-search-line text-xl"></i>
          </div>
          <p className="text-sm text-foreground-600">No matches yet.</p>
          <p className="text-xs text-foreground-400 mt-1">Load jobs to see AI-ranked matches.</p>
        </div>
      ) : (
        <ul className="divide-y divide-background-200">
          {shown.map((m) => {
            const saved = isSaved(m.id);
            const tone = fitTone(m.fitScore);
            return (
              <li key={m.id} className="px-5 py-4 flex flex-wrap items-center gap-4 hover:bg-background-100/40 transition-colors">
                <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-background-200 font-heading font-semibold text-foreground-900 flex-shrink-0">
                  {m.companyInitial}
                </div>

                <div className="flex-1 min-w-[220px]">
                  <h3 className="text-sm font-semibold text-foreground-950 truncate">{m.title}</h3>
                  <p className="text-xs text-foreground-600 truncate mt-0.5">
                    {m.company} · {m.location} · {m.type}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs font-medium text-foreground-800 whitespace-nowrap">{m.salary}</span>
                    {m.tags.slice(0, 3).map((t) => (
                      <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-background-200/70 text-foreground-600 whitespace-nowrap">
                        {t}
                      </span>
                    ))}
                  </div>
                  <AuthenticityBadge jobId={m.id} source={m.source} />
                </div>

                <div
                  className="relative w-12 h-12 rounded-full flex-shrink-0"
                  style={{
                    background: `conic-gradient(oklch(var(--${tone}-500)) ${m.fitScore}%, oklch(var(--background-200)) ${m.fitScore}% 100%)`,
                  }}
                  title={`${m.fitScore}% fit`}
                >
                  <div className="absolute inset-[3px] rounded-full bg-background-50 flex items-center justify-center">
                    <span className="text-xs font-bold text-foreground-900">{m.fitScore}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <AutofillPreview jobId={m.id} title={m.title} />
                  <ShareJob jobId={m.id} title={m.title} />
                  <button
                    onClick={() => toggle(m)}
                    className={`w-9 h-9 flex items-center justify-center rounded-lg border cursor-pointer transition-colors ${
                      saved
                        ? "bg-primary-100 text-primary-700 border-primary-200"
                        : "text-foreground-400 border-background-300 hover:text-foreground-700 hover:border-foreground-300"
                    }`}
                    aria-label={saved ? "Unsave" : "Save"}
                  >
                    <i className={saved ? "ri-bookmark-fill" : "ri-bookmark-line"}></i>
                  </button>
                  <button
                    onClick={() => onApply?.(m)}
                    disabled={applyingId === m.id}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
                  >
                    {applyingId === m.id ? "Preparing…" : "Apply"}
                    {applyingId !== m.id && <i className="ri-send-plane-line text-xs"></i>}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
