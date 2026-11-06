import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import {
  createExperience,
  EXPERIENCE_KINDS,
  type CreateExperienceInput,
  type Experience,
  type ExperienceKind,
  type ExperienceSource,
} from "@/lib/experience";
import Modal from "@/components/base/Modal";
import TagInput from "@/components/base/TagInput";

const labelCls = "block text-xs font-medium text-foreground-600 mb-1.5";
const inputCls =
  "w-full px-3 py-2.5 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300";

interface AddHighlightModalProps {
  onClose: () => void;
  onCreated: (item: Experience) => void;
}

export default function AddHighlightModal({ onClose, onCreated }: AddHighlightModalProps) {
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ExperienceKind>("highlight");
  const [source, setSource] = useState<ExperienceSource>("self_written");
  const [sourceTool, setSourceTool] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [company, setCompany] = useState("");
  const [period, setPeriod] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (content.trim().length < 10) {
      setError("Please add at least 10 characters of content.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const body: CreateExperienceInput = {
        content: content.trim(),
        title: title.trim() || undefined,
        kind,
        source,
        source_tool:
          source === "ai_generated" && sourceTool.trim() ? sourceTool.trim() : undefined,
        skills: skills.length ? skills : undefined,
        company: company.trim() || undefined,
        period: period.trim() || undefined,
      };
      const created = await createExperience(body);
      onCreated(created);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add highlight.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Add highlight" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className={labelCls}>
            Paste your highlight, story, or what your work AI assistant wrote
          </span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={7}
            className="w-full px-3 py-2.5 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 resize-none"
            placeholder="Paste the accomplishment, STAR story, project write-up, or analysis here…"
          />
          <span className="block text-xs text-foreground-400 mt-1">
            {content.trim().length} characters · minimum 10
          </span>
        </label>

        <label className="block">
          <span className={labelCls}>Title (optional)</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
            placeholder="e.g. Shipped checkout redesign"
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

          <div>
            <span className={labelCls}>Source</span>
            <div className="inline-flex items-center rounded-full bg-background-100 border border-background-200 p-1">
              <button
                type="button"
                onClick={() => setSource("self_written")}
                className={`px-3 py-1.5 text-sm font-semibold rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                  source === "self_written"
                    ? "bg-background-50 text-foreground-950"
                    : "text-foreground-600 hover:text-foreground-900"
                }`}
              >
                I wrote this
              </button>
              <button
                type="button"
                onClick={() => setSource("ai_generated")}
                className={`px-3 py-1.5 text-sm font-semibold rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                  source === "ai_generated"
                    ? "bg-background-50 text-foreground-950"
                    : "text-foreground-600 hover:text-foreground-900"
                }`}
              >
                AI-generated
              </button>
            </div>
          </div>
        </div>

        {source === "ai_generated" && (
          <label className="block">
            <span className={labelCls}>Which tool?</span>
            <input
              value={sourceTool}
              onChange={(e) => setSourceTool(e.target.value)}
              className={inputCls}
              placeholder="e.g. Microsoft 365 Copilot"
            />
          </label>
        )}

        <TagInput
          label="Skills (optional)"
          tags={skills}
          onChange={setSkills}
          placeholder="Type a skill and press Enter"
          hint="Press Enter or comma to add each skill."
        />

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
              Adding…
            </>
          ) : (
            <>
              <i className="ri-add-line"></i>
              Add highlight
            </>
          )}
        </button>
      </form>
    </Modal>
  );
}