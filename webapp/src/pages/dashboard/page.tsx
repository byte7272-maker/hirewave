import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import StatsOverview from "@/pages/dashboard/components/StatsOverview";
import JobMatches from "@/pages/dashboard/components/JobMatches";
import RecentActivity from "@/pages/dashboard/components/RecentActivity";
import SavedJobs from "@/pages/dashboard/components/SavedJobs";
import { useAuth } from "@/lib/auth";
import { getMatchVMs, ingestSampleJobs, prepareApplication, type JobMatchVM } from "@/lib/backend";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import type { DashboardOutletContext } from "@/pages/dashboard/DashboardLayout";

export default function Overview() {
  const { searchQuery } = useOutletContext<DashboardOutletContext>();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [matches, setMatches] = useState<JobMatchVM[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMatches(await getMatchVMs(10));
    } catch {
      /* ignore on overview */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runSearch() {
    setSeeding(true);
    try {
      await ingestSampleJobs();
      await load();
      toast.push("Fresh jobs ingested and ranked.", "success");
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
      toast.push("Draft application prepared — review in Applications.", "success");
      navigate("/dashboard/applications");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Failed to prepare.", "error");
    } finally {
      setApplyingId(null);
    }
  }

  const filtered = matches.filter((m) =>
    `${m.title} ${m.company} ${m.location} ${m.tags.join(" ")} ${m.salary}`.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = (user?.full_name || user?.email || "there").split(" ")[0];

  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">{greeting}, {firstName}.</h1>
          <p className="text-sm text-foreground-600 mt-1">
            {matches.length > 0 ? `${matches.length} matches ready to review.` : "Run a search to find AI-ranked matches."}
          </p>
        </div>
        <button
          onClick={runSearch}
          disabled={seeding}
          className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
        >
          <i className="ri-radar-line"></i>
          {seeding ? "Searching…" : "Run new search"}
        </button>
      </section>

      <StatsOverview />

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 animate-fade-in-up">
          <JobMatches matches={filtered} limit={3} onApply={apply} applyingId={applyingId} />
          {matches.length === 0 && (
            <div className="mt-3 text-center">
              <Link to="/dashboard/matches" className="text-sm font-semibold text-primary-700 hover:text-primary-900">Go to matches →</Link>
            </div>
          )}
        </div>
        <div className="space-y-6 animate-fade-in-up" style={{ animationDelay: "0.08s" }}>
          <RecentActivity />
          <SavedJobs />
        </div>
      </div>
    </div>
  );
}
