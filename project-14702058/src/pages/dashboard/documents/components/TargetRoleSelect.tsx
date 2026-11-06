import type { TailorableJob } from "@/lib/jobs";

interface TargetRoleSelectProps {
  /** Selectable roles (matches + saved jobs, deduped). */
  jobs: TailorableJob[];
  /** Currently-selected job id as a string, or "" for a generic improve. */
  value: string;
  onChange: (value: string) => void;
  /**
   * Label for a selected role that isn't in `jobs` (e.g. carried in via a link),
   * so the current target still renders as an option.
   */
  fallbackLabel?: string | null;
  /** Disable the control while an improvement is running. */
  disabled?: boolean;
}

/**
 * A compact "Target role" picker shown inside the Improve panel so the user can
 * change which job an improvement tailors to without leaving the Templates view.
 * An empty value means a generic improve (no job targeting).
 */
export default function TargetRoleSelect({
  jobs,
  value,
  onChange,
  fallbackLabel,
  disabled = false,
}: TargetRoleSelectProps) {
  const isKnown = jobs.some((j) => String(j.job_posting_id) === value);
  const showFallback = Boolean(value) && !isKnown;

  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-accent-50 border border-accent-200 border-l-4 border-l-accent-500 px-3 py-2 animate-fade-in-up">
      <span className="w-6 h-6 flex items-center justify-center rounded-md bg-accent-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
        <i className="ri-focus-2-line"></i>
      </span>
      <label className="flex items-center gap-2 min-w-0 flex-1 flex-wrap cursor-pointer">
        <span className="text-xs font-semibold text-accent-900 whitespace-nowrap">
          Target role
        </span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          title="Choose which role improvements should be tailored to"
          className="h-8 px-2.5 rounded-md border border-accent-200 bg-background-50 text-xs font-medium text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 max-w-full cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <option value="">No specific role — general improve</option>
          {showFallback && <option value={value}>{fallbackLabel || "Selected role"}</option>}
          {jobs.map((j) => (
            <option key={String(j.job_posting_id)} value={String(j.job_posting_id)}>
              {j.title} · {j.company}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}