import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { dropRecentlyViewedEntry, recordRecentlyViewed } from "@/lib/recentlyViewed";
import {
  getAuthenticity,
  getJob,
  getMatchesLogo,
  reportJob,
  verifyEmployer,
  type AuthenticityResult,
  type CrossPosting,
  type Job,
} from "@/lib/jobs";
import { listResumes } from "@/lib/documents";
import { createAndAddApplication, useApplications } from "@/hooks/useApplicationsStore";
import AuthenticityBadge from "@/components/feature/AuthenticityBadge";
import CrossPostingBadge from "@/components/feature/CrossPostingBadge";
import CompanyAvatar from "@/components/feature/CompanyAvatar";
import SourceChip, { BoardMark } from "@/components/feature/SourceChip";
import TailorResumeButton from "@/components/feature/TailorResumeButton";
import Modal from "@/components/base/Modal";
import { useToast } from "@/components/base/ToastProvider";

function formatDate(v?: string) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [job, setJob] = useState<Job | null>(null);
  const [auth, setAuth] = useState<AuthenticityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [applying, setApplying] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const { applications, refresh } = useApplications();
  const { showToast } = useToast();

  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reporting, setReporting] = useState(false);
  const [feedback, setFeedback] = useState("");

  const [verifying, setVerifying] = useState(false);

  // Keep the "already in your pipeline" state accurate when the page opens.
  useEffect(() => {
    refresh().catch(() => {
      /* non-fatal */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [j, a] = await Promise.all([getJob(id), getAuthenticity(id)]);
      if (!j.company_logo) {
        const logo = await getMatchesLogo(id).catch(() => undefined);
        if (logo) j.company_logo = logo;
      }
      setJob(j);
      setAuth(a);
      void recordRecentlyViewed({
        kind: "match",
        ref_id: j.id,
        title: j.title,
        subtitle: [j.company, j.location].filter(Boolean).join(" · "),
        view: "matches",
      });
    } catch (err) {
      // A posting that's gone shouldn't linger as a dead card in the rail.
      if (err instanceof ApiError && err.status === 404) {
        dropRecentlyViewedEntry("match", id);
      }
      setError(err instanceof ApiError ? err.message : "Could not load this job.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function handleReport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!id || !reason.trim()) return;
    setReporting(true);
    setError("");
    try {
      await reportJob(id, { reason: reason.trim() });
      setReportOpen(false);
      setReason("");
      setFeedback("Thanks — your report has been submitted to the community review queue.");
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : "Report failed.");
    } finally {
      setReporting(false);
      setTimeout(() => setFeedback(""), 4000);
    }
  }

  async function handleVerify() {
    if (!id) return;
    setVerifying(true);
    setError("");
    try {
      const result = await verifyEmployer(id);
      setAuth(result);
      setFeedback(
        result.employer_verified
          ? "Employer verified against their official site."
          : "Could not confirm this employer against their official site."
      );
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : "Verification failed.");
    } finally {
      setVerifying(false);
      setTimeout(() => setFeedback(""), 4000);
    }
  }

  async function quickApply() {
    if (!job) return;
    setApplying(true);
    try {
      await createAndAddApplication({
        title: job.title,
        company: job.company,
        job_id: job.id,
      });
      showToast(`Added “${job.title}” to your pipeline`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not quick apply.", "error");
    } finally {
      setApplying(false);
    }
  }

  /** Add to the pipeline (if needed), then open the résumé tailoring flow for this role. */
  async function applyAndTailor() {
    if (!job) return;
    setTailoring(true);
    try {
      if (!alreadyApplied) {
        await createAndAddApplication({
          title: job.title,
          company: job.company,
          job_id: job.id,
        });
        showToast(`Added “${job.title}” to your pipeline`, "success");
      }
      const resumes = await listResumes().catch(() => []);
      if (!resumes.length) {
        showToast("Upload a résumé first, then tailor it to this job.", "info");
        navigate("/dashboard/documents");
        return;
      }
      const resume = resumes[0];
      const params = new URLSearchParams();
      params.set("tailorJob", String(job.id));
      params.set("tailorTitle", job.title);
      params.set("tailorCompany", job.company);
      navigate(`/dashboard/documents/resumes/${resume.id}?${params.toString()}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not start tailoring.", "error");
    } finally {
      setTailoring(false);
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-sm text-foreground-500 flex items-center justify-center gap-2">
        <i className="ri-loader-4-line animate-spin"></i>
        Loading job…
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="space-y-4">
        <Link
          to="/dashboard/matches"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
        >
          <i className="ri-arrow-left-line"></i>
          Back to matches
        </Link>
        <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
          <i className="ri-error-warning-line text-base mt-0.5"></i>
          <div className="flex-1">{error || "Job not found."}</div>
          <button
            onClick={load}
            className="inline-flex items-center gap-1 text-sm font-semibold hover:text-accent-900/80 cursor-pointer whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const postings: CrossPosting[] = job.cross_postings?.length
    ? job.cross_postings
    : (job.cross_posting_ids ?? []).map((pid) => ({ id: pid }));

  const alreadyApplied = applications.some((a) => String(a.job_id) === String(job.id));

  return (
    <div className="space-y-6 max-w-3xl">
      <section className="animate-fade-in-up">
        <Link
          to="/dashboard/matches"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
        >
          <i className="ri-arrow-left-line"></i>
          Back to matches
        </Link>
      </section>

      <section className="animate-fade-in-up rounded-2xl bg-background-100/60 border border-background-200 p-6" style={{ animationDelay: "0.04s" }}>
        <div className="flex items-start gap-4 flex-wrap">
          <CompanyAvatar company={job.company} logo={job.company_logo} size={56} />
          <div className="flex-1 min-w-[240px]">
            <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">
              {job.title}
            </h1>
            <p className="text-sm text-foreground-600 mt-1">
              {job.company}
              {job.location ? ` · ${job.location}` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {auth?.score !== undefined && <AuthenticityBadge score={auth.score} />}
              {job.type && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-background-200/70 text-foreground-600 whitespace-nowrap">
                  {job.type}
                </span>
              )}
              {job.remote && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-900 whitespace-nowrap">
                  Remote
                </span>
              )}
              {job.salary_display && (
                <span className="text-sm font-semibold text-foreground-900 whitespace-nowrap">
                  {job.salary_display}
                </span>
              )}
              <CrossPostingBadge
                likely_duplicate={job.likely_duplicate}
                cross_postings={job.cross_postings}
                cross_posting_ids={job.cross_posting_ids}
                duplicate_group_id={job.duplicate_group_id}
                consolidated_count={job.consolidated_count}
                consolidated_sources={job.consolidated_sources}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-6">
          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-external-link-line"></i>
              View original posting
            </a>
          )}
          {alreadyApplied ? (
            <Link
              to="/dashboard/applications"
              className="inline-flex items-center gap-2 text-sm font-semibold bg-secondary-100 text-secondary-900 px-4 py-2.5 rounded-md hover:bg-secondary-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-check-double-line"></i>
              In your pipeline
            </Link>
          ) : (
            <button
              onClick={quickApply}
              disabled={applying}
              className="inline-flex items-center gap-2 text-sm font-semibold bg-accent-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-accent-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              <i className={applying ? "ri-loader-4-line animate-spin" : "ri-flashlight-line"}></i>
              {applying ? "Applying…" : "Quick apply"}
            </button>
          )}

          <button
            onClick={applyAndTailor}
            disabled={tailoring}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-secondary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-secondary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
          >
            <i className={tailoring ? "ri-loader-4-line animate-spin" : "ri-magic-line"}></i>
            {tailoring ? "Starting…" : "Apply and tailor"}
          </button>

          <button
            onClick={handleVerify}
            disabled={verifying}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-background-50 text-foreground-900 border border-background-200 px-4 py-2.5 rounded-md hover:bg-background-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
          >
            <i className={verifying ? "ri-loader-4-line animate-spin" : "ri-building-4-line"}></i>
            {verifying ? "Verifying…" : "Verify employer"}
          </button>
          <TailorResumeButton
            jobId={job.id}
            jobTitle={job.title}
            jobCompany={job.company}
            variant="button"
          />
          <button
            onClick={() => setReportOpen(true)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-accent-900 bg-accent-100 px-4 py-2.5 rounded-md hover:bg-accent-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-flag-line"></i>
            Report job
          </button>
        </div>

        {feedback && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-secondary-100 text-secondary-900 px-4 py-3 text-sm">
            <i className="ri-information-line text-base mt-0.5"></i>
            <span>{feedback}</span>
          </div>
        )}
      </section>

      {(job.likely_duplicate ||
        (job.consolidated_count ?? 0) > 0 ||
        postings.length > 0) && (
        <section
          className="animate-fade-in-up rounded-2xl bg-background-100/60 border border-background-200 p-6"
          style={{ animationDelay: "0.08s" }}
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 flex items-center justify-center rounded-md bg-secondary-100 text-secondary-900">
              <i className="ri-stack-line"></i>
            </span>
            <h2 className="font-heading text-lg font-medium text-foreground-950">
              Compare sources
            </h2>
          </div>
          <p className="text-sm text-foreground-600 mt-1.5">
            {job.likely_duplicate
              ? "This posting looks like the same job listed on multiple boards."
              : (job.consolidated_count ?? 0) > 0
                ? `Identical postings were merged from ${job.consolidated_count} board${
                    job.consolidated_count === 1 ? "" : "s"
                  }.`
                : "This role appears on multiple boards."}
          </p>

          {(job.consolidated_count ?? 0) > 0 && job.consolidated_sources?.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {job.consolidated_sources.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-900 whitespace-nowrap"
                >
                  <BoardMark platform={s} size="w-3.5 h-3.5 text-[8px]" />
                  {s}
                </span>
              ))}
            </div>
          ) : null}

          {postings.length > 0 && (
            <ul className="mt-3 space-y-2">
              {postings.map((p, i) => {
                const platform = p.source_display || p.source_platform || p.source || "Another board";
                const key = String(p.id ?? p.job_posting_id ?? p.posting_id ?? i);
                return (
                  <li
                    key={key}
                    className="flex items-center justify-between gap-3 rounded-lg bg-background-50 border border-background-200 px-3 py-2.5"
                  >
                    <span className="inline-flex items-center gap-2 text-sm text-foreground-800 min-w-0">
                      <BoardMark platform={p.source_platform ?? p.source ?? p.source_display} size="w-4 h-4 text-[9px]" />
                      <span className="truncate">{platform}</span>
                    </span>
                    {p.url ? (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
                      >
                        View
                        <i className="ri-external-link-line"></i>
                      </a>
                    ) : (
                      <span className="text-xs text-foreground-400 whitespace-nowrap">No link</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {auth && (auth.flags?.length > 0 || auth.verdict) && (
        <section className="animate-fade-in-up rounded-2xl bg-background-100/60 border border-background-200 p-6" style={{ animationDelay: "0.08s" }}>
          <h2 className="font-heading text-lg font-medium text-foreground-950">Authenticity check</h2>
          {auth.verdict && (
            <p className="text-sm text-foreground-700 mt-1.5">{auth.verdict}</p>
          )}
          {(auth.flags ?? []).length > 0 && (
            <ul className="mt-3 space-y-2">
              {(auth.flags ?? []).map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-accent-900">
                  <i className="ri-alert-line mt-0.5"></i>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="animate-fade-in-up rounded-2xl bg-background-100/60 border border-background-200 p-6" style={{ animationDelay: "0.12s" }}>
        <h2 className="font-heading text-lg font-medium text-foreground-950">Description</h2>
        <div className="mt-3 text-sm leading-relaxed text-foreground-700 whitespace-pre-wrap">
          {job.description || "No description provided for this posting."}
        </div>
        <p className="mt-5 text-[11px] text-foreground-400 flex items-center gap-2 flex-wrap">
          <SourceChip platform={job.source_platform} display={job.source_display} />
          <span>Posted {formatDate(job.posted_at ?? job.created_at)}</span>
        </p>
      </section>

      {reportOpen && (
        <Modal title="Report this job" onClose={() => setReportOpen(false)}>
          <form onSubmit={handleReport} className="space-y-4">
            <p className="text-sm text-foreground-600">
              Help the community by flagging suspicious postings. Your report is reviewed before it
              appears publicly.
            </p>
            <label className="block">
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                What looks off?
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={4}
                placeholder="e.g. asks for payment, unverifiable company, unrealistic salary…"
                className="w-full px-3 py-2.5 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 resize-y"
              />
              <span className="block text-xs text-foreground-400 mt-1">{reason.length}/500</span>
            </label>
            <button
              type="submit"
              disabled={reporting || !reason.trim()}
              className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold bg-accent-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-accent-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              {reporting ? (
                <i className="ri-loader-4-line animate-spin"></i>
              ) : (
                <i className="ri-flag-line"></i>
              )}
              {reporting ? "Submitting…" : "Submit report"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}