"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/Toast";
import { PageHeader, ScoreBar, VerificationBadge, Empty } from "@/components/ui";
import type { Application, CoverLetter, MatchOut, Resume } from "@/lib/types";
import { SAMPLE_JOBS } from "@/lib/sampleJobs";

export default function MatchesPage() {
  const matches = useApi<MatchOut[]>("/api/v1/jobs/matches?limit=25");
  const toast = useToast();
  const router = useRouter();
  const [seeding, setSeeding] = useState(false);
  const [preparing, setPreparing] = useState<string | null>(null);

  async function seed() {
    setSeeding(true);
    try {
      const r = await api<{ ingested: number }>("/api/v1/jobs/ingest", {
        method: "POST",
        body: { jobs: SAMPLE_JOBS },
      });
      toast.push(`Ingested ${r.ingested} jobs and ran authenticity checks.`, "success");
      await matches.reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Ingest failed.", "error");
    } finally {
      setSeeding(false);
    }
  }

  async function prepare(m: MatchOut) {
    setPreparing(m.job_id);
    try {
      const resume = await api<Resume>("/api/v1/resumes/generate", {
        method: "POST",
        body: { job_posting_id: m.job_id },
      });
      const cover = await api<CoverLetter>("/api/v1/cover-letters/generate", {
        method: "POST",
        body: { job_posting_id: m.job_id, resume_id: resume.id },
      });
      await api<Application>("/api/v1/applications", {
        method: "POST",
        body: {
          job_posting_id: m.job_id,
          resume_id: resume.id,
          cover_letter_id: cover.id,
        },
      });
      toast.push("Draft application prepared — review & approve in Applications.", "success");
      router.push("/applications");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Failed to prepare.", "error");
    } finally {
      setPreparing(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Job Matches"
        subtitle="AI-ranked against your profile. Fraudulent postings are filtered out automatically."
        action={
          <button className="btn" onClick={seed} disabled={seeding}>
            {seeding ? <span className="spinner" /> : "Load sample jobs"}
          </button>
        }
      />

      {matches.loading ? (
        <span className="spinner" />
      ) : matches.error ? (
        <div className="toast error" role="alert">{matches.error}</div>
      ) : matches.data && matches.data.length > 0 ? (
        <div className="stack">
          {matches.data.map((m) => (
            <article key={m.job_id} className="list-item">
              <div className="row between" style={{ alignItems: "flex-start" }}>
                <div>
                  <h2 style={{ marginBottom: 2 }}>{m.title}</h2>
                  <div className="muted">{m.company}</div>
                </div>
                <VerificationBadge score={m.authenticity_score} />
              </div>

              <div className="row" style={{ margin: "12px 0 4px", gap: 12 }}>
                <strong style={{ minWidth: 54 }}>{m.score.toFixed(0)}%</strong>
                <div style={{ flex: 1 }}>
                  <ScoreBar value={m.score} />
                </div>
              </div>

              {m.matching_skills.length > 0 && (
                <div className="row" style={{ marginTop: 10 }}>
                  {m.matching_skills.map((s) => (
                    <span key={s} className="chip match">✓ {s}</span>
                  ))}
                </div>
              )}
              {m.gap_skills.length > 0 && (
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="faint">Skill gaps:</span>
                  {m.gap_skills.map((s) => (
                    <span key={s} className="chip gap">{s}</span>
                  ))}
                </div>
              )}

              <div className="divider" />
              <div className="row between">
                <span className="faint">
                  Generates a tailored resume + cover letter for your review.
                </span>
                <button
                  className="btn primary sm"
                  onClick={() => prepare(m)}
                  disabled={preparing === m.job_id}
                >
                  {preparing === m.job_id ? <span className="spinner" /> : "Prepare application"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty>
          <p>No job matches yet.</p>
          <button className="btn primary" onClick={seed} disabled={seeding}>
            {seeding ? <span className="spinner" /> : "Load sample jobs to get started"}
          </button>
        </Empty>
      )}
    </>
  );
}
