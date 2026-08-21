import { useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { useSavedJobs } from "@/lib/saved";
import { prepareApplication } from "@/lib/backend";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import type { DashboardOutletContext } from "@/pages/dashboard/DashboardLayout";
import ExportMatches from "@/pages/dashboard/components/ExportMatches";

export default function Saved() {
  const { searchQuery } = useOutletContext<DashboardOutletContext>();
  const { saved, remove } = useSavedJobs();
  const toast = useToast();
  const navigate = useNavigate();
  const [applyingId, setApplyingId] = useState<string | null>(null);

  async function apply(id: string) {
    setApplyingId(id);
    try {
      await prepareApplication(id);
      toast.push("Draft application prepared — review in Applications.", "success");
      navigate("/dashboard/applications");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Failed to prepare.", "error");
    } finally {
      setApplyingId(null);
    }
  }

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return saved.filter((j) => q === "" || `${j.title} ${j.company} ${j.location} ${j.tags.join(" ")}`.toLowerCase().includes(q));
  }, [saved, searchQuery]);

  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">Saved jobs</h1>
          <p className="text-sm text-foreground-600 mt-1">Roles you&apos;ve bookmarked for later · {visible.length} saved</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMatches ids={visible.map((j) => j.id)} disabled={visible.length === 0} label="Export saved" scope="saved" />
          <Link to="/dashboard/matches" className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap">
            <i className="ri-search-line"></i>
            Find more jobs
          </Link>
        </div>
      </section>

      {visible.length === 0 ? (
        <section className="rounded-2xl bg-background-100/60 border border-background-200 px-5 py-16 text-center animate-fade-in-up">
          <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-xl bg-background-200 text-foreground-500 mb-3">
            <i className="ri-bookmark-line text-xl"></i>
          </div>
          <p className="text-sm text-foreground-600">No saved jobs.</p>
          <p className="text-xs text-foreground-400 mt-1">Bookmark roles from your matches to see them here.</p>
        </section>
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 animate-fade-in-up" style={{ animationDelay: "0.06s" }}>
          {visible.map((j) => (
            <div key={j.id} className="rounded-2xl bg-background-100/60 border border-background-200 p-5 flex flex-col">
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 flex items-center justify-center rounded-xl bg-background-200 font-heading font-semibold text-foreground-900 flex-shrink-0">{j.companyInitial}</span>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-foreground-950 truncate">{j.title}</h2>
                  <p className="text-xs text-foreground-600 truncate mt-0.5">{j.company} · {j.location}</p>
                </div>
              </div>
              <p className="text-sm font-semibold text-foreground-900 mt-4">{j.salary}</p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {j.tags.map((t) => (
                  <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-background-200/70 text-foreground-600 whitespace-nowrap">{t}</span>
                ))}
              </div>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-background-200">
                <span className="text-[11px] text-foreground-400">{j.fitScore}% fit</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => apply(j.id)}
                    disabled={applyingId === j.id}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
                  >
                    {applyingId === j.id ? "Preparing…" : "Apply"}
                  </button>
                  <button onClick={() => remove(j.id)} className="w-9 h-9 flex items-center justify-center rounded-lg border border-background-300 text-foreground-400 hover:text-foreground-700 hover:border-foreground-300 cursor-pointer transition-colors" aria-label="Remove saved job">
                    <i className="ri-bookmark-fill"></i>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
