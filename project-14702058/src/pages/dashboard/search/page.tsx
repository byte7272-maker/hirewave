import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import {
  createSearch,
  listCategories,
  listJobs,
  normalizeJobs,
  resolveSearchResults,
  runJobSearch,
  searchNewCount,
  type Job,
} from "@/lib/jobs";
import { getPreferences, updatePreferences } from "@/lib/profile";
import { getMatchScoreMap } from "@/lib/matchScores";
import { listResumes, type Resume } from "@/lib/documents";
import SavedSearches from "@/pages/dashboard/search/components/SavedSearches";
import JobCard from "@/pages/dashboard/search/components/JobCard";
import { useApplications } from "@/hooks/useApplicationsStore";
import PageHeader from "@/components/feature/PageHeader";
import { Card, EmptyState, ErrorState, LoadingState } from "@/components/base";
import ResetPageButton from "@/components/feature/ResetPageButton";
import useViewState from "@/hooks/useViewState";
import useScrollRestore from "@/hooks/useScrollRestore";

const SOURCES = ["LinkedIn", "Indeed", "Greenhouse", "Lever", "Workday", "Company sites"];
const DEFAULT_SOURCES = ["LinkedIn", "Indeed", "Greenhouse"];

/** Durable, cross-device state for the search list (backend view "search"). */
interface SearchViewState extends Record<string, unknown> {
  filters?: Record<string, unknown>;
  viewMode?: unknown;
  scrollY?: unknown;
}

const inputCls =
  "w-full h-11 px-3.5 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300";

export default function Search() {
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [remote, setRemote] = useState(false);
  const [sources, setSources] = useState<string[]>(["LinkedIn", "Indeed", "Greenhouse"]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [savingCategories, setSavingCategories] = useState(false);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string | number>("");

  const [jobs, setJobs] = useState<Job[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [savingSearch, setSavingSearch] = useState(false);
  const [savedToast, setSavedToast] = useState("");
  const [savedRefresh, setSavedRefresh] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "grouped">("grid");
  const [scoreByJob, setScoreByJob] = useState<Map<string, number>>(new Map());
  const viewState = useViewState<SearchViewState>("search");
  const restored = useRef(false);
  const { refresh: refreshApplications } = useApplications();

  const groupedJobs = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const j of jobs) {
      const key = j.category?.trim() || "Uncategorized";
      const bucket = map.get(key);
      if (bucket) bucket.push(j);
      else map.set(key, [j]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [jobs]);

  // Global 1-based rank per job, so the "By category" view keeps each role's
  // overall position instead of restarting at 1 inside every group.
  const rankByJob = useMemo(() => {
    const map = new Map<string, number>();
    jobs.forEach((j, i) => map.set(String(j.id), i + 1));
    return map;
  }, [jobs]);

  async function loadInitial() {
    setLoading(true);
    setError("");
    try {
      const data = await listJobs();
      setJobs(normalizeJobs(data));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load jobs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInitial();
  }, []);

  // Cross-reference the matches pool so a role that also appears in Matches wears
  // the same fit band (rank accent + spine color) on its result card.
  useEffect(() => {
    let alive = true;
    getMatchScoreMap().then((map) => {
      if (alive) setScoreByJob(map);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Keep pipeline stage markers accurate on the result cards.
  useEffect(() => {
    refreshApplications().catch(() => {
      /* non-fatal */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore the saved search filters once the durable state has loaded.
  useEffect(() => {
    if (!viewState.loaded || restored.current) return;
    restored.current = true;
    const s = viewState.saved ?? {};
    const f = (s.filters ?? {}) as Record<string, unknown>;
    if (typeof f.role === "string") setRole(f.role);
    if (typeof f.location === "string") setLocation(f.location);
    if (typeof f.remote === "boolean") setRemote(f.remote);
    if (Array.isArray(f.sources)) setSources(f.sources as string[]);
    if (Array.isArray(f.categories)) setSelectedCategories(f.categories as string[]);
    if (f.resumeId !== undefined && f.resumeId !== null && f.resumeId !== "") {
      setSelectedResumeId(f.resumeId as string | number);
    }
    if (s.viewMode === "grid" || s.viewMode === "grouped") setViewMode(s.viewMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewState.loaded]);

  useEffect(() => {
    if (!viewState.loaded) return;
    let cancelled = false;
    (async () => {
      const [cats, prefs, res] = await Promise.all([
        listCategories().catch(() => [] as string[]),
        getPreferences().catch(() => null),
        listResumes().catch(() => [] as Resume[]),
      ]);
      if (cancelled) return;
      setCategories(cats);
      const f = (viewState.saved?.filters ?? {}) as Record<string, unknown>;
      // Only fall back to preference defaults when nothing was restored.
      if (!Array.isArray(f.categories) && prefs?.job_categories?.length) {
        setSelectedCategories(prefs.job_categories);
      }
      setResumes(res);
      const hasSavedResume = f.resumeId !== undefined && f.resumeId !== null && f.resumeId !== "";
      if (!hasSavedResume && res.length) setSelectedResumeId(res[0].id);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewState.loaded]);

  // Persist the meaningful state on every change (merge-saved, debounced).
  useEffect(() => {
    if (!viewState.loaded) return;
    viewState.save({
      filters: {
        role,
        location,
        remote,
        sources,
        categories: selectedCategories,
        resumeId: selectedResumeId,
      },
      viewMode,
      scrollY: Math.round(window.scrollY),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    role,
    location,
    remote,
    sources,
    selectedCategories,
    selectedResumeId,
    viewMode,
    viewState.loaded,
  ]);

  useScrollRestore(
    "search",
    viewState.loaded && !loading,
    Number(viewState.saved?.scrollY) || 0,
  );

  function toggleSource(src: string) {
    setSources((prev) =>
      prev.includes(src) ? prev.filter((x) => x !== src) : [...prev, src]
    );
  }

  function toggleCategory(cat: string) {
    const next = selectedCategories.includes(cat)
      ? selectedCategories.filter((c) => c !== cat)
      : [...selectedCategories, cat];
    setSelectedCategories(next);
    setSavingCategories(true);
    updatePreferences({ job_categories: next })
      .catch(() => {
        /* non-fatal */
      })
      .finally(() => setSavingCategories(false));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSearching(true);
    setError("");
    try {
      const data = await runJobSearch({
        role: role.trim(),
        location: location.trim(),
        remote,
        sources,
        categories: selectedCategories,
      });
      setNewCount(searchNewCount(data));
      setJobs(
        await resolveSearchResults(data, {
          categories: selectedCategories,
          resumeId: selectedResumeId,
        }),
      );
      setSearched(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function handleSave() {
    if (!role.trim()) {
      setSavedToast("Add a role before saving a search.");
      return;
    }
    setSavingSearch(true);
    setError("");
    try {
      await createSearch({
        role: role.trim(),
        location: location.trim(),
        remote,
        sources,
        categories: selectedCategories,
      });
      setSavedRefresh((n) => n + 1);
      setSavedToast("Search saved — your agent will re-run it for new roles.");
    } catch (err) {
      setSavedToast(err instanceof ApiError ? err.message : "Could not save the search.");
    } finally {
      setSavingSearch(false);
      setTimeout(() => setSavedToast(""), 3500);
    }
  }

  async function handleRunResult(result: unknown) {
    setNewCount(searchNewCount(result));
    setJobs(
      await resolveSearchResults(result, {
        categories: selectedCategories,
        resumeId: selectedResumeId,
      }),
    );
    setSearched(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Search jobs"
        subtitle="Aggregate roles from across the web, then let your agent track them for you."
        icon="ri-radar-line"
        tone="primary"
        image="https://readdy.ai/api/search-image?query=Warm%20editorial%20photograph%20of%20a%20person%20gazing%20over%20a%20sunlit%20city%20skyline%20through%20a%20large%20window%20while%20holding%20a%20notebook%2C%20hopeful%20expansive%20mood%2C%20warm%20neutral%20cream%20tones%20with%20muted%20emerald%20and%20coral%20colour%20accents%2C%20soft%20golden%20hour%20light%2C%20shallow%20depth%20of%20field%2C%20premium%20editorial%20magazine%20aesthetic%2C%20darker%20left%20side%20for%20overlay%20text%2C%20high%20detail&width=1600&height=460&seq=header-search-01&orientation=landscape"
        imageAlt="Someone looking over a sunlit city skyline while planning a job search"
        actions={
          <ResetPageButton
            view="search"
            routeKeys="search"
            onReset={() => {
              setRole("");
              setLocation("");
              setRemote(false);
              setSources(DEFAULT_SOURCES);
              setSelectedCategories([]);
              setSelectedResumeId("");
              setViewMode("grid");
            }}
          />
        }
      />

      <form
        onSubmit={handleSubmit}
        className="animate-fade-in-up rounded-2xl bg-background-100/60 border border-background-200 p-5 space-y-4"
        style={{ animationDelay: "0.04s" }}
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-xs font-medium text-foreground-600 mb-1.5">Role</span>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Senior Product Designer"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-foreground-600 mb-1.5">Location</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Remote · US"
              className={inputCls}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="inline-flex items-center gap-2 text-sm text-foreground-700 cursor-pointer">
            <input
              type="checkbox"
              checked={remote}
              onChange={(e) => setRemote(e.target.checked)}
              className="w-4 h-4 rounded border-background-300 accent-primary-500 cursor-pointer"
            />
            Remote only
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {SOURCES.map((src) => (
              <button
                type="button"
                key={src}
                onClick={() => toggleSource(src)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer whitespace-nowrap transition-colors ${
                  sources.includes(src)
                    ? "bg-primary-500 text-background-50 dark:text-foreground-950 border-primary-500"
                    : "bg-background-50 text-foreground-600 border-background-300 hover:border-foreground-300"
                }`}
              >
                {src}
              </button>
            ))}
          </div>
        </div>

        {categories.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="text-xs font-medium text-foreground-600">Categories</div>
              {savingCategories && (
                <span className="inline-flex items-center gap-1 text-[11px] text-foreground-400">
                  <i className="ri-loader-4-line animate-spin"></i>
                  Saving categories…
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const active = selectedCategories.includes(cat);
                return (
                  <button
                    type="button"
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer whitespace-nowrap transition-colors ${
                      active
                        ? "bg-primary-500 text-background-50 dark:text-foreground-950 border-primary-500"
                        : "bg-background-50 text-foreground-600 border-background-300 hover:border-foreground-300"
                    }`}
                  >
                    {active && <i className="ri-check-line"></i>}
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {resumes.length > 0 && (
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[220px]">
              <label
                htmlFor="search-resume-select"
                className="block text-xs font-medium text-foreground-600 mb-1.5"
              >
                Rank by résumé
              </label>
              <select
                id="search-resume-select"
                value={String(selectedResumeId)}
                onChange={(e) => setSelectedResumeId(e.target.value)}
                className={`${inputCls} cursor-pointer`}
              >
                <option value="">Default ranking</option>
                {resumes.map((r) => (
                  <option key={String(r.id)} value={String(r.id)}>
                    {r.title || r.filename || r.original_filename || `Résumé ${r.id}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            type="submit"
            disabled={searching}
            className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
          >
            {searching ? (
              <i className="ri-loader-4-line animate-spin"></i>
            ) : (
              <i className="ri-radar-line"></i>
            )}
            {searching ? "Searching…" : "Run search"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={savingSearch}
            className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-background-50 text-foreground-900 border border-background-200 px-5 py-2.5 rounded-md hover:bg-background-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
          >
            {savingSearch ? (
              <i className="ri-loader-4-line animate-spin"></i>
            ) : (
              <i className="ri-save-line"></i>
            )}
            Save search
          </button>
          {savedToast && (
            <span className="text-sm text-foreground-600">{savedToast}</span>
          )}
        </div>
      </form>

      {error && (
        <Card surface="tinted" className="animate-fade-in-up">
          <ErrorState
            title="We couldn't load your search"
            message={error}
            onRetry={loadInitial}
          />
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 animate-fade-in-up" style={{ animationDelay: "0.08s" }}>
          <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-heading text-lg font-medium text-foreground-950">
                  {searched ? "Results" : "Recent jobs"}
                </h2>
                <p className="text-xs text-foreground-500 mt-0.5">
                  {loading
                    ? "Loading…"
                    : searched && newCount > 0
                      ? `${jobs.length} roles found · ${newCount} new`
                      : `${jobs.length} roles found`}
                </p>
              </div>
              {!loading && jobs.length > 0 && (
                <div className="inline-flex items-center gap-1 bg-background-50 border border-background-200 rounded-full px-1 py-1">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                      viewMode === "grid"
                        ? "bg-primary-500 text-background-50 dark:text-foreground-950"
                        : "text-foreground-500 hover:text-foreground-800"
                    }`}
                  >
                    <i className="ri-layout-grid-line"></i>
                    Grid
                  </button>
                  <button
                    onClick={() => setViewMode("grouped")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                      viewMode === "grouped"
                        ? "bg-primary-500 text-background-50 dark:text-foreground-950"
                        : "text-foreground-500 hover:text-foreground-800"
                    }`}
                  >
                    <i className="ri-price-tag-3-line"></i>
                    By category
                  </button>
                </div>
              )}
            </div>

            {loading ? (
              <div className="p-4 md:p-5">
                <LoadingState label="Loading jobs…" rows={4} />
              </div>
            ) : jobs.length === 0 ? (
              <EmptyState
                icon="ri-search-line"
                title="No jobs found"
                description="Adjust your role, location, or sources and run the search again."
                tone="primary"
              />
            ) : viewMode === "grouped" ? (
              <div className="p-5 space-y-6">
                {groupedJobs.map(([category, items]) => (
                  <div key={category}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground-900 whitespace-nowrap">
                        <i className="ri-price-tag-3-line text-secondary-600"></i>
                        {category}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-900 whitespace-nowrap">
                        {items.length}
                      </span>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {items.map((j) => (
                        <JobCard
                          key={j.id}
                          job={j}
                          rank={rankByJob.get(String(j.id))}
                          score={scoreByJob.get(String(j.id)) ?? null}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3 p-5">
                {jobs.map((j) => (
                  <JobCard
                    key={j.id}
                    job={j}
                    rank={rankByJob.get(String(j.id))}
                    score={scoreByJob.get(String(j.id)) ?? null}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="animate-fade-in-up" style={{ animationDelay: "0.12s" }}>
          <SavedSearches refreshKey={savedRefresh} onRun={handleRunResult} />
        </div>
      </div>
    </div>
  );
}