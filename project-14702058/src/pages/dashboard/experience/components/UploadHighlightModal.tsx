import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import {
  uploadExperience,
  EXPERIENCE_KINDS,
  type Experience,
  type ExperienceKind,
} from "@/lib/experience";
import Modal from "@/components/base/Modal";

const labelCls = "block text-xs font-medium text-foreground-600 mb-1.5";
const inputCls =
  "w-full px-3 py-2.5 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300";

interface UploadHighlightModalProps {
  onClose: () => void;
  onCreated: (item: Experience) => void;
}

export default function UploadHighlightModal({ onClose, onCreated }: UploadHighlightModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ExperienceKind>("highlight");
  const [sourceTool, setSourceTool] = useState("");
  const [company, setCompany] = useState("");
  const [period, setPeriod] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function handleFile(fileList: FileList | null) {
    const f = fileList?.[0];
    if (f) setFile(f);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const created = await uploadExperience(file, {
        title: title.trim() || undefined,
        kind,
        source: "imported",
        source_tool: sourceTool.trim() || undefined,
        company: company.trim() || undefined,
        period: period.trim() || undefined,
      });
      onCreated(created);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload file.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Upload file" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className={labelCls}>File (PDF, DOCX, MD, or TXT)</span>
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-background-300 bg-background-50 px-4 py-4 cursor-pointer hover:border-primary-400 transition-colors">
            <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-lg bg-background-200 text-foreground-500">
              <i className="ri-file-upload-line text-lg"></i>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground-900 truncate">
                {file ? file.name : "Choose a file"}
              </p>
              <p className="text-xs text-foreground-500">
                {file
                  ? `${(file.size / 1024).toFixed(0)} KB`
                  : "An export your work AI agent produced"}
              </p>
            </div>
          </div>
          <input
            type="file"
            accept=".pdf,.docx,.md,.txt,application/pdf,text/plain,text/markdown"
            onChange={(e) => handleFile(e.target.files)}
            className="hidden"
          />
        </label>

        <label className="block">
          <span className={labelCls}>Title (optional)</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
            placeholder="e.g. Migration runbook"
          />
        </label>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Kind</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ExperienceKind)}
              className={`${inputCls} cursor-pointer`}
            >
              {EXPERIENCE_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Source tool (optional)</span>
            <input
              value={sourceTool}
              onChange={(e) => setSourceTool(e.target.value)}
              className={inputCls}
              placeholder="e.g. Glean"
            />
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Company (optional)</span>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className={inputCls}
              placeholder="e.g. Acme Corp"
            />
          </label>
          <label className="block">
            <span className={labelCls}>Period (optional)</span>
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className={inputCls}
              placeholder="e.g. 2023 Q3"
            />
          </label>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
            <i className="ri-error-warning-line text-base mt-0.5"></i>
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
        >
          {submitting ? (
            <>
              <i className="ri-loader-4-line animate-spin"></i>
              Uploading…
            </>
          ) : (
            <>
              <i className="ri-upload-2-line"></i>
              Upload &amp; extract
            </>
          )}
        </button>
      </form>
    </Modal>
  );
}