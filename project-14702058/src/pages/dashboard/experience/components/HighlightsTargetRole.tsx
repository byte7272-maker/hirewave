import type { TailorableJob } from "@/lib/jobs";

interface HighlightsTargetRoleProps {
  jobs: TailorableJob[];
  loading: boolean;
  /** "" means "no specific role" — prompts and incorporate stay generic. */
  value: string;
  onChange: (value: string) => void;
}

function jobLabel(job: TailorableJob): string {
  return [job.title, job.company].filter(Boolean).join(" · ");
}

/**
 * The single target-role selector for the workspace. Its choice feeds BOTH the
 * prompt generator (tailored prompts) and the incorporate call (tailored
 * bullets), so the whole run leans toward one role when the user wants it, and
 * stays generic when they don't.
 */
export default function HighlightsTargetRole({
  jobs,
  loading,
  value,
  onChange,
}: HighlightsTargetRoleProps) {
  return (
    <label className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground-700 whitespace-nowrap">
        <i className="ri-focus-3-line text-primary-600"></i>
        Tailor to a role
      </span>
      <span className="relative inline-flex items-center min-w-0">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={loading || jobs.length === 0}
          title="Optional — steer the prompts and the added bullets toward one role"
          className="appearance-none w-full sm:w-72 max-w-full pl-3 pr-8 py-2 rounded-md border border-background-200 bg-background-50 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <option value="">
            {loading
              ? "Loading your roles…"
              : jobs.length === 0
                ? "No saved or matched roles yet"
                : "No specific role"}
          </option>
          {jobs.map((job) => (
            <option key={String(job.job_posting_id)} value={String(job.job_posting_id)}>
              {jobLabel(job)}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 w-4 h-4 flex items-center justify-center text-foreground-400">
          {loading ? (
            <i className="ri-loader-4-line animate-spin text-sm"></i>
          ) : (
            <i className="ri-arrow-down-s-line"></i>
          )}
        </span>
      </span>
    </label>
  );
}