import { useCallback, useEffect, useMemo, useState } from "react";
import ApplicationPipeline, {
  type PipelineColumnVM,
} from "@/pages/dashboard/components/ApplicationPipeline";
import { api, ApiError } from "@/lib/api";
import { jobsById, approveAndSubmit, type Application, type JobPosting } from "@/lib/backend";
import { useToast } from "@/lib/toast";

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-background-100/60 border border-background-200 px-4 py-2.5">
      <span className="font-heading text-xl font-medium text-foreground-950">{value}</span>
      <span className="text-xs text-foreground-600 whitespace-nowrap">{label}</span>
    </div>
  );
}

const DETAIL: Record<Application["status"], string> = {
  draft: "Draft · ready to submit",
  submitted: "Submitted · awaiting reply",
  interviewing: "Interviewing",
  rejected: "Closed",
  offered: "Offer received",
};

export default function Applications() {
  const toast = useToast();
  const [apps, setApps] = useState<Application[]>([]);
  const [jobs, setJobs] = useState<Record<string, JobPosting>>({});
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, j] = await Promise.all([
        api<Application[]>("/api/v1/applications"),
        jobsById().catch(() => ({} as Record<string, JobPosting>)),
      ]);
      setApps(a);
      setJobs(j);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Failed to load applications.", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(app: Application) {
    setSubmittingId(app.id);
    try {
      const res = await approveAndSubmit(app);
      toast.push(res.success ? "Application submitted!" : "Needs manual completion — check the fallback.", res.success ? "success" : "info");
      await load();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Submit failed.", "error");
    } finally {
      setSubmittingId(null);
    }
  }

  const columns = useMemo<PipelineColumnVM[]>(() => {
    const card = (app: Application) => {
      const job = jobs[app.job_posting_id];
      return {
        app,
        role: job?.title || "Role",
        company: job?.company || "—",
        companyInitial: (job?.company || "?")[0].toUpperCase(),
        detail: DETAIL[app.status],
        time: app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : "—",
        canSubmit: app.status === "draft",
      };
    };
    const by = (s: Application["status"]) => apps.filter((a) => a.status === s).map(card);
    return [
      { id: "draft", title: "Draft", tone: "background", cards: by("draft") },
      { id: "submitted", title: "Applied", tone: "primary", cards: by("submitted") },
      { id: "interviewing", title: "Interviewing", tone: "accent", cards: by("interviewing") },
      { id: "offered", title: "Offer", tone: "secondary", cards: by("offered") },
    ];
  }, [apps, jobs]);

  const total = apps.length;
  const interviews = apps.filter((a) => a.status === "interviewing").length;
  const offers = apps.filter((a) => a.status === "offered").length;

  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">Applications</h1>
          <p className="text-sm text-foreground-600 mt-1">Track every role from draft to signed offer. Approve your documents, then submit.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <StatPill label="Tracked" value={total} />
          <StatPill label="Interviewing" value={interviews} />
          <StatPill label="Offers" value={offers} />
        </div>
      </section>

      <div className="animate-fade-in-up" style={{ animationDelay: "0.06s" }}>
        {loading ? (
          <div className="py-16 text-center text-foreground-500"><i className="ri-loader-4-line text-2xl animate-spin"></i></div>
        ) : total === 0 ? (
          <div className="rounded-2xl bg-background-100/60 border border-background-200 px-5 py-16 text-center">
            <p className="text-sm text-foreground-600">No applications yet.</p>
            <p className="text-xs text-foreground-400 mt-1">Prepare one from the Matches page.</p>
          </div>
        ) : (
          <ApplicationPipeline columns={columns} onSubmit={submit} submittingId={submittingId} />
        )}
      </div>
    </div>
  );
}
