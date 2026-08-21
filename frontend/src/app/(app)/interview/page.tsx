"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/Toast";
import { PageHeader, Empty } from "@/components/ui";
import { MockInterview } from "@/components/MockInterview";
import type { InterviewPrep, MatchOut, Resume } from "@/lib/types";

const CATEGORY_LABEL: Record<string, string> = {
  intro: "Intro",
  motivation: "Motivation",
  technical: "Technical",
  behavioral: "Behavioral",
  experience: "Experience",
  gap: "Skill gap",
  closing: "Closing",
};

export default function InterviewPage() {
  const resumes = useApi<Resume[]>("/api/v1/resumes");
  const matches = useApi<MatchOut[]>("/api/v1/jobs/matches?limit=25");
  const toast = useToast();

  const [mode, setMode] = useState<"bank" | "mock">("bank");
  const [resumeId, setResumeId] = useState("");
  const [jobId, setJobId] = useState("");
  const [busy, setBusy] = useState(false);
  const [prep, setPrep] = useState<InterviewPrep | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { count: 6 };
      if (resumeId) body.resume_id = resumeId;
      if (jobId) body.job_posting_id = jobId;
      const result = await api<InterviewPrep>("/api/v1/interview/prep", {
        method: "POST",
        body,
      });
      setPrep(result);
      setOpen(result.questions[0]?.id ?? null);
      toast.push("Interview prep generated.", "success");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Failed to generate.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Interview Prep"
        subtitle="Study likely questions, or run a live mock interview with an AI interviewer."
        action={
          <div className="seg" role="tablist" aria-label="Interview mode">
            <button
              role="tab"
              aria-selected={mode === "bank"}
              className={mode === "bank" ? "on" : ""}
              onClick={() => setMode("bank")}
            >
              Question Bank
            </button>
            <button
              role="tab"
              aria-selected={mode === "mock"}
              className={mode === "mock" ? "on" : ""}
              onClick={() => setMode("mock")}
            >
              Mock Interview
            </button>
          </div>
        }
      />

      {mode === "mock" ? (
        <MockInterview />
      ) : (
        <>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="grid cols-2">
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="resume">Base answers on</label>
            <select id="resume" value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
              <option value="">My profile</option>
              {(resumes.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.source === "uploaded"
                    ? `⬆ ${r.original_filename || "Uploaded résumé"}`
                    : `✨ ${r.target_role || "Generated résumé"} (v${r.version})`}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="job">Tailor to a job (optional)</label>
            <select id="job" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">General</option>
              {(matches.data ?? []).map((m) => (
                <option key={m.job_id} value={m.job_id}>
                  {m.title} — {m.company}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={generate} disabled={busy}>
            {busy ? <span className="spinner" /> : "Generate prep"}
          </button>
          {prep?.based_on_document && (
            <span className="badge green">Grounded in your résumé</span>
          )}
        </div>
      </div>

      {prep ? (
        <div className="stack">
          {prep.questions.map((q) => (
            <article key={q.id} className="list-item">
              <div className="row between" style={{ alignItems: "flex-start" }}>
                <div className="row" style={{ gap: 10 }}>
                  <span className="chip">{CATEGORY_LABEL[q.category] ?? q.category}</span>
                  <strong>{q.question}</strong>
                </div>
                <button
                  className="btn ghost sm"
                  aria-expanded={open === q.id}
                  onClick={() => setOpen(open === q.id ? null : q.id)}
                >
                  {open === q.id ? "Hide answer" : "Show answer"}
                </button>
              </div>
              {open === q.id && (
                <div style={{ marginTop: 12 }}>
                  <div className="faint" style={{ marginBottom: 4 }}>Suggested answer</div>
                  <p style={{ margin: 0 }}>{q.suggested_answer}</p>
                  {q.tips && (
                    <p className="faint" style={{ marginTop: 10 }}>💡 {q.tips}</p>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty>
          <p>Generate a personalized question set to rehearse.</p>
          <p className="faint">Pick an uploaded or generated résumé and (optionally) a target job.</p>
        </Empty>
      )}
        </>
      )}
    </>
  );
}
