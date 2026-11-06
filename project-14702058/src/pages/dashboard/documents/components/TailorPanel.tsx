import { useEffect, useState } from "react";
import type { TailorResult, TailorJob } from "@/lib/documents";
import CompanyAvatar from "@/components/feature/CompanyAvatar";
import SourceChip from "@/components/feature/SourceChip";
import GlossaryText from "@/components/feature/GlossaryText";

export interface TailorJobOption {
  value: string;
  label: string;
  title: string;
  company: string;
  company_logo?: string;
  salary_display?: string;
  source_display?: string;
  source_platform?: string;
  url?: string;
}

interface TailorPanelProps {
  options: TailorJobOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  loading: boolean;
  error: string;
  result: TailorResult | null;
  hasContent: boolean;
  revising?: boolean;
  onTailor?: (instructions: string[]) => void;
  onInsertKeyword?: (keyword: string) => void;
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  important: 1,
  suggestion: 2,
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  important: "Important",
  suggestion: "Suggestion",
};

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-accent-100 text-accent-900",
  important: "bg-secondary-100 text-secondary-900",
  suggestion: "bg-primary-100 text-primary-900",
};

const selectCls =
  "w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300";

function toJobView(option: TailorJobOption | null): TailorJob | null {
  if (!option) return null;
  return {
    title: option.title,
    company: option.company,
    company_logo: option.company_logo,
    salary_display: option.salary_display,
    source_display: option.source_display,
    source_platform: option.source_platform,
    url: option.url,
  };
}

export default function TailorPanel({
  options,
  selectedId,
  onSelect,
  loading,
  error,
  result,
  hasContent,
  revising = false,
  onTailor,
  onInsertKeyword,
}: TailorPanelProps) {
  const selected = options.find((o) => o.value === selectedId) ?? null;
  const sorted = result
    ? [...result.tailoring].sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
      )
    : [];

  const fit = result ? Math.max(0, Math.min(100, Math.round(result.fit_score || 0))) : 0;

  // Every "what to change" item is selected by default so a single click on
  // "Tailor my résumé" applies the full set; the user can deselect any of them.
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    setPicked(result ? result.tailoring.map((t) => t.title) : []);
  }, [result]);

  const jobView: TailorJob | null = result?.job ?? toJobView(selected);

  function toggle(title: string) {
    setPicked((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]
    );
  }

  // Selected tailoring titles, or the missing keywords as a fallback.
  const instructions =
    picked.length > 0 ? picked : (result?.missing_keywords ?? []);
  const canTailor = Boolean(onTailor) && instructions.length > 0 && !revising;

  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-300 overflow-hidden">
      <div className="px-5 py-4 border-b border-background-200">
        <h2 className="font-heading text-lg font-medium text-foreground-950 flex items-center gap-2">
          <i className="ri-focus-2-line text-primary-600"></i>
          Tailor for a job
        </h2>
        <p className="text-xs text-foreground-500 mt-0.5">
          <GlossaryText text="Pick a role to see how this résumé fits it — then tailor it to that exact job." />
        </p>
      </div>

      <div className="p-5 space-y-4">
        {options.length > 0 && (
          <div className="rounded-xl border border-background-200 bg-background-50 p-3.5">
            <label className="block">
              <span className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                <span className="text-xs font-medium text-foreground-600">Select a job</span>
                {selectedId && (
                  <button
                    type="button"
                    onClick={() => onSelect("")}
                    className="inline-flex items-center gap-1 text-xs font-medium text-foreground-500 hover:text-foreground-900 cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-close-circle-line"></i>
                    Clear
                  </button>
                )}
              </span>
              <select
                value={selectedId}
                onChange={(e) => onSelect(e.target.value)}
                disabled={!hasContent}
                className={selectCls}
              >
                <option value="">Choose a job…</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {options.length === 0 && (
          <p className="text-xs text-foreground-500">
            No jobs yet — save or match a few roles and they&apos;ll show up here.
          </p>
        )}

        {!hasContent && (
          <p className="text-xs text-foreground-500">
            Add résumé text first to tailor it to a job.
          </p>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-foreground-500">
            <i className="ri-loader-4-line animate-spin"></i>
            Analyzing fit…
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-accent-50 border border-accent-200 border-l-4 border-l-accent-500 px-3.5 py-3 animate-fade-in-up">
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 flex items-center justify-center rounded-md bg-accent-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
                <i className="ri-error-warning-line"></i>
              </span>
              <p className="min-w-0 flex-1 text-sm text-foreground-800 leading-relaxed">
                {error}
              </p>
            </div>
          </div>
        )}

        {result && !loading && jobView && (
          <div className="space-y-5 animate-fade-in-up">
            {/* Which job */}
            <div className="rounded-xl bg-background-50 border border-background-200 p-4">
              <div className="flex items-start gap-3">
                <CompanyAvatar company={jobView.company} logo={jobView.company_logo} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground-950 leading-snug">
                    {jobView.title}
                  </p>
                  <p className="text-sm text-foreground-600">{jobView.company}</p>
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    {jobView.salary_display && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground-700 bg-background-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                        <i className="ri-money-dollar-circle-line"></i>
                        {jobView.salary_display}
                      </span>
                    )}
                    <SourceChip
                      platform={jobView.source_platform}
                      display={jobView.source_display}
                    />
                    {jobView.url && (
                      <a
                        href={jobView.url}
                        target="_blank"
                        rel="nofollow noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-external-link-line"></i>
                        View posting
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* How you fit */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-500">
                How you fit
              </h4>
              <div className="mt-2 flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-primary-500 text-background-50 dark:text-foreground-950 flex items-center justify-center flex-shrink-0">
                  <span className="font-heading text-2xl font-semibold">{fit}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-foreground-900">
                    {fit}/100 match
                  </span>
                  <div className="mt-1.5 w-full h-1.5 rounded-full bg-background-200 overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full transition-all duration-500"
                      style={{ width: `${fit}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-3 space-y-3">
                <div>
                  <span className="block text-xs text-foreground-500">You cover</span>
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    {result.matching_skills.length === 0 && (
                      <span className="text-xs text-foreground-400">None identified yet</span>
                    )}
                    {result.matching_skills.map((s, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary-900 bg-primary-100 px-2.5 py-1 rounded-full whitespace-nowrap"
                      >
                        <i className="ri-check-line"></i>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="block text-xs text-foreground-500">
                      <GlossaryText text="Gaps" />
                    </span>
                    {onInsertKeyword && result.missing_keywords.length > 0 && (
                      <span className="text-[11px] text-foreground-400">
                        Tap a gap to add it to your résumé
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    {result.missing_keywords.length === 0 && (
                      <span className="text-xs text-foreground-400">Nothing missing</span>
                    )}
                    {onInsertKeyword
                      ? result.missing_keywords.map((k, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => onInsertKeyword(k)}
                            title={`Add \u201c${k}\u201d to your r\u00e9sum\u00e9`}
                            className="group inline-flex items-center gap-1 text-xs font-medium text-accent-900 bg-accent-100 px-2.5 py-1 rounded-full border border-accent-200 hover:bg-accent-200 hover:border-accent-300 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <i className="ri-add-line group-hover:rotate-90 transition-transform"></i>
                            {k}
                          </button>
                        ))
                      : result.missing_keywords.map((k, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 text-xs font-medium text-accent-900 bg-accent-100 px-2.5 py-1 rounded-full whitespace-nowrap"
                          >
                            <i className="ri-add-line"></i>
                            {k}
                          </span>
                        ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Perspective */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-500">
                Perspective
              </h4>
              {result.qualifications && (
                <div className="rounded-xl bg-background-50 border border-background-200 p-4">
                  <p className="text-xs font-medium text-foreground-500 mb-1">
                    What they&apos;re looking for
                  </p>
                  <p className="text-sm text-foreground-800 leading-relaxed">
                    <GlossaryText text={result.qualifications} />
                  </p>
                </div>
              )}
              {result.summary && (
                <div className="rounded-xl bg-background-50 border border-background-200 p-4">
                  <p className="text-xs font-medium text-foreground-500 mb-1">
                    How you line up
                  </p>
                  <p className="text-sm text-foreground-800 leading-relaxed">
                    <GlossaryText text={result.summary} />
                  </p>
                </div>
              )}
            </div>

            {/* What to change — selectable */}
            {sorted.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-500">
                    What to change
                  </h4>
                  <span className="text-xs text-foreground-500">
                    {picked.length}/{sorted.length} selected
                  </span>
                </div>
                {sorted.map((c, i) => {
                  const on = picked.includes(c.title);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggle(c.title)}
                      aria-pressed={on}
                      className={`w-full text-left rounded-xl border p-4 transition-colors cursor-pointer ${
                        on
                          ? "bg-primary-50 border-primary-300"
                          : "bg-background-50 border-background-200 hover:border-background-300"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 border ${
                            on
                              ? "bg-primary-500 border-primary-500 text-background-50 dark:text-foreground-950"
                              : "bg-background-50 border-background-300 text-transparent"
                          }`}
                        >
                          <i className="ri-check-line text-xs"></i>
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                                SEVERITY_TONE[c.severity] ?? "bg-background-200 text-foreground-700"
                              }`}
                            >
                              {SEVERITY_LABEL[c.severity] ?? c.severity}
                            </span>
                            {c.category && (
                              <span className="inline-flex items-center text-xs font-medium text-foreground-600 bg-background-200/70 px-2 py-0.5 rounded-full whitespace-nowrap">
                                {c.category}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-sm font-medium text-foreground-900">
                            <GlossaryText text={c.title} interactive={false} />
                          </p>
                          <p className="mt-1 text-sm text-foreground-600 leading-relaxed">
                            <GlossaryText text={c.detail} interactive={false} />
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {onTailor && (
                  <button
                    onClick={() => onTailor(instructions)}
                    disabled={!canTailor}
                    className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                  >
                    {revising ? (
                      <>
                        <i className="ri-loader-4-line animate-spin"></i>
                        Tailoring…
                      </>
                    ) : (
                      <>
                        <i className="ri-sparkling-line"></i>
                        Tailor my résumé
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}