import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import JobMatches from "@/pages/dashboard/components/JobMatches";
import { getMatchVMs, ingestSampleJobs, prepareApplication, type JobMatchVM } from "@/lib/backend";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import type { DashboardOutletContext } from "@/pages/dashboard/DashboardLayout";
import ExportMatches from "@/pages/dashboard/components/ExportMatches";
import JobSiteSearch from "@/pages/dashboard/components/JobSiteSearch";

const SORTS = [
  { id: "fit", label: "Top fit" },
  { id: "company", label: "Company A–Z" },
];

export default function Matches() {
  const { searchQuery } = useOutletContext<DashboardOutletContext>();
  const toast = useToast();
  const navigate = useNavigate();

  const [matches, setMatches] = useState<JobMatchVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [sort, setSort] = useState("fit");
  const [remoteOnly, setRemoteOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMatches(await getMatchVMs(25));
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Failed to load matches.", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function runSearch() {
    setSeeding(true);
    try {
      await ingestSampleJobs();
      await load();
      toast.push("Fresh jobs ingested and ranked. Scam postings filtered out.", "success");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Search failed.", "error");
    } finally {
      setSeeding(false);
    }
  }

  async function apply(job: JobMatchVM) {
    setApplyingId(job.id);
    try {
      await prepareApplication(job.id);
      toast.push("Draft application prepared — review & submit in Applications.", "success");
      navigate("/dashboard/applications");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Failed to prepare.", "error");
    } finally {
      setApplyingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = matches.filter((m) => {
      const hay = `${m.title} ${m.company} ${m.location} ${m.tags.join(" ")} ${m.salary}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (remoteOnly && !m.location.toLowerCase().includes("remote")) return false;
      return true;
    });
    const sorted = [...list];
    if (sort === "fit") sorted.sort((a, b) => b.fitScore - a.fitScore);
    if (sort === "company") sorted.sort((a, b) => a.company.localeCompare(b.company));
    return sorted;
  }, [matches, searchQuery, sort, remoteOnly]);

  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">Job matches</h1>
          <p className="text-sm text-foreground-600 mt-1">AI-ranked by fit across skills, salary, and location. Fraudulent postings are filtered out.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMatches disabled={matches.length === 0} />
          <button
            onClick={runSearch}
            disabled={seeding}
            className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            <i className="ri-radar-line"></i>
            {seeding ? "Searching…" : "Run new search"}
          </button>
        </div>
      </section>

      <JobSiteSearch onSearched={load} />

      <section className="animate-fade-in-up rounded-2xl bg-background-100/60 border border-background-200 p-4 flex flex-wrap items-center gap-4" style={{ animationDelay: "0.04s" }}>
        <label className="inline-flex items-center gap-2 text-sm text-foreground-700 cursor-pointer">
          <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} className="w-4 h-4 rounded border-background-300 accent-primary-500 cursor-pointer" />
          Remote only
        </label>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-foreground-500">Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-9 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer">
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      </section>

      <div className="animate-fade-in-up" style={{ animationDelay: "0.08s" }}>
        {loading ? (
          <div className="py-16 text-center text-foreground-500"><i className="ri-loader-4-line text-2xl animate-spin"></i></div>
        ) : (
          <JobMatches
            matches={filtered}
            showViewAll={false}
            title="All matches"
            subtitle={`${filtered.length} roles match your profile`}
            onApply={apply}
            applyingId={applyingId}
          />
        )}
      </div>
    </div>
  );
}
