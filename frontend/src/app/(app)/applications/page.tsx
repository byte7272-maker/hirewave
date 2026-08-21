"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/Toast";
import { PageHeader, StatusBadge, Empty } from "@/components/ui";
import type {
  Application,
  CoverLetter,
  JobPosting,
  Resume,
  SubmitResponse,
} from "@/lib/types";

export default function ApplicationsPage() {
  const apps = useApi<Application[]>("/api/v1/applications");

  return (
    <>
      <PageHeader
        title="Applications"
        subtitle="Approve your documents, then submit. We never auto-submit without your sign-off."
      />
      {apps.loading ? (
        <span className="spinner" />
      ) : apps.data && apps.data.length > 0 ? (
        <div className="stack">
          {apps.data.map((a) => (
            <ApplicationCard key={a.id} app={a} onChange={apps.reload} />
          ))}
        </div>
      ) : (
        <Empty>
          <p>No applications yet.</p>
          <p className="faint">Prepare one from the Matches page.</p>
        </Empty>
      )}
    </>
  );
}

function ApplicationCard({ app, onChange }: { app: Application; onChange: () => void }) {
  const toast = useToast();
  const [job, setJob] = useState<JobPosting | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
  const [cover, setCover] = useState<CoverLetter | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const [j, r, c] = await Promise.all([
        api<JobPosting>(`/api/v1/jobs/${app.job_posting_id}`).catch(() => null),
        app.resume_id
          ? api<Resume>(`/api/v1/resumes/${app.resume_id}`).catch(() => null)
          : Promise.resolve(null),
        app.cover_letter_id
          ? api<CoverLetter>(`/api/v1/cover-letters/${app.cover_letter_id}`).catch(() => null)
          : Promise.resolve(null),
      ]);
      setJob(j);
      setResume(r);
      setCover(c);
    } catch {
      /* ignore */
    }
  }, [app.job_posting_id, app.resume_id, app.cover_letter_id]);

  useEffect(() => {
    load();
  }, [load]);

  const docsApproved =
    !!resume?.approved && (app.cover_letter_id ? !!cover?.approved : true);

  async function approveDocs() {
    setBusy(true);
    try {
      if (resume && !resume.approved) {
        await api(`/api/v1/resumes/${resume.id}`, { method: "PUT", body: { approved: true } });
      }
      if (cover && !cover.approved) {
        await api(`/api/v1/cover-letters/${cover.id}`, { method: "PUT", body: { approved: true } });
      }
      await load();
      toast.push("Documents approved — ready to submit.", "success");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setResult(null);
    try {
      const res = await api<SubmitResponse>(`/api/v1/applications/${app.id}/submit`, {
        method: "PUT",
        body: {},
      });
      setResult(res);
      toast.push(
        res.success ? "Application submitted!" : "Automation needs manual completion.",
        res.success ? "success" : "info"
      );
      onChange();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Submit failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="list-item">
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>{job?.title ?? "Job posting"}</h2>
          <div className="faint">
            {job?.company} · {job?.source_platform}
          </div>
        </div>
        <StatusBadge status={app.status} />
      </div>

      <div className="row" style={{ marginTop: 12, gap: 10 }}>
        <span className={`badge ${resume?.approved ? "green" : "amber"}`}>
          Resume {resume?.approved ? "✓" : "pending"}
        </span>
        {app.cover_letter_id && (
          <span className={`badge ${cover?.approved ? "green" : "amber"}`}>
            Cover letter {cover?.approved ? "✓" : "pending"}
          </span>
        )}
      </div>

      {app.status !== "submitted" && (
        <>
          <div className="divider" />
          <div className="row">
            {!docsApproved && (
              <button className="btn sm" onClick={approveDocs} disabled={busy}>
                {busy ? <span className="spinner" /> : "Approve documents"}
              </button>
            )}
            <button
              className="btn primary sm"
              onClick={submit}
              disabled={busy || !docsApproved}
              title={docsApproved ? "" : "Approve your documents first"}
            >
              {busy ? <span className="spinner" /> : "Submit application"}
            </button>
            {!docsApproved && (
              <span className="faint">Approval required before submission.</span>
            )}
          </div>
        </>
      )}

      {app.status === "submitted" && (
        <p className="muted" style={{ marginTop: 10 }}>
          ✓ Submitted
          {result?.confirmation_id ? ` · ${result.confirmation_id}` : ""}
          {app.submitted_at ? ` · ${new Date(app.submitted_at).toLocaleString()}` : ""}
        </p>
      )}

      {result && !result.success && result.requires_manual && (
        <div className="card" style={{ marginTop: 12, background: "var(--bg)" }}>
          <strong>Finish manually</strong>
          <ol className="muted" style={{ margin: "8px 0 0 18px" }}>
            {result.manual_steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          {result.fallback_url && (
            <a href={result.fallback_url} target="_blank" rel="noreferrer">
              Open application page →
            </a>
          )}
        </div>
      )}
    </article>
  );
}
