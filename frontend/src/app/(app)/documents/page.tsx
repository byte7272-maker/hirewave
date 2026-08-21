"use client";

import { useRef, useState } from "react";
import { api, apiUpload, ApiError } from "@/lib/api";
import { getAccess } from "@/lib/tokens";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/Toast";
import { PageHeader, Empty } from "@/components/ui";
import type { Resume } from "@/lib/types";

export default function DocumentsPage() {
  const resumes = useApi<Resume[]>("/api/v1/resumes");
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-uploading the same file
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await apiUpload<Resume>("/api/v1/resumes/upload", form);
      toast.push(`Uploaded ${file.name}.`, "success");
      resumes.reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Upload failed.", "error");
    } finally {
      setUploading(false);
    }
  }

  async function download(r: Resume) {
    try {
      const res = await fetch(r.file_url, {
        headers: { Authorization: `Bearer ${getAccess() ?? ""}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.original_filename || "resume";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.push("Download failed.", "error");
    }
  }

  async function approveResume(r: Resume) {
    try {
      await api(`/api/v1/resumes/${r.id}`, { method: "PUT", body: { approved: true } });
      toast.push("Resume approved.", "success");
      resumes.reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Failed.", "error");
    }
  }

  const uploadButton = (
    <>
      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.doc,.docx,.md,.txt"
        onChange={onUpload}
        style={{ display: "none" }}
        aria-hidden
      />
      <button
        className="btn primary"
        onClick={() => fileInput.current?.click()}
        disabled={uploading}
      >
        {uploading ? <span className="spinner" /> : "⬆ Upload résumé"}
      </button>
    </>
  );

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="Upload your own résumé, or use an AI-generated one. Nothing is submitted until you approve it."
        action={uploadButton}
      />

      {resumes.loading ? (
        <span className="spinner" />
      ) : resumes.data && resumes.data.length > 0 ? (
        <div className="stack">
          {resumes.data.map((r) => {
            const uploaded = r.source === "uploaded";
            return (
              <article key={r.id} className="list-item">
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <div>
                    <h2 style={{ marginBottom: 2 }}>
                      {uploaded ? r.original_filename || "Uploaded résumé" : r.target_role || "Resume"}
                    </h2>
                    <div className="faint">
                      <span className="chip" style={{ marginRight: 6 }}>
                        {uploaded ? "⬆ Uploaded" : "✨ AI-generated"}
                      </span>
                      {uploaded ? (
                        <>{r.format}</>
                      ) : (
                        <>
                          v{r.version} · {r.tone} · {r.format}
                          {r.ats_score !== null && <> · ATS {r.ats_score}%</>}
                        </>
                      )}
                    </div>
                  </div>
                  <span className={`badge ${r.approved ? "green" : "amber"}`}>
                    {r.approved ? "✓ Approved" : "Needs review"}
                  </span>
                </div>

                {!uploaded && r.generated_content.summary && (
                  <p className="muted" style={{ marginTop: 10 }}>
                    {r.generated_content.summary}
                  </p>
                )}

                <div className="row" style={{ marginTop: 10 }}>
                  {uploaded ? (
                    <button className="btn sm" onClick={() => download(r)}>
                      ⬇ Download
                    </button>
                  ) : (
                    <button
                      className="btn sm"
                      aria-expanded={open === r.id}
                      onClick={() => setOpen(open === r.id ? null : r.id)}
                    >
                      {open === r.id ? "Hide" : "View full resume"}
                    </button>
                  )}
                  {!r.approved && (
                    <button className="btn primary sm" onClick={() => approveResume(r)}>
                      Approve
                    </button>
                  )}
                </div>

                {open === r.id && !uploaded && (
                  <pre className="doc" style={{ marginTop: 12 }}>{r.rendered_text}</pre>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <Empty>
          <p>No documents yet.</p>
          <p className="faint" style={{ marginBottom: 16 }}>
            Upload your existing résumé, or generate one from a job on the Matches page.
          </p>
          {uploadButton}
        </Empty>
      )}
    </>
  );
}
