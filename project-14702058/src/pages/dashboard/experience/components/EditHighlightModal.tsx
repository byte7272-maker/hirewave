import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import {
  EXPERIENCE_KINDS,
  updateExperience,
  type Experience,
  type ExperienceKind,
  type ExperienceSource,
  type UpdateExperienceInput,
} from "@/lib/experience";
import Modal from "@/components/base/Modal";
import TagInput from "@/components/base/TagInput";

const labelCls = "block text-xs font-medium text-foreground-600 mb-1.5";
const inputCls =
  "w-full px-3 py-2.5 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300";

interface EditHighlightModalProps {
  item: Experience;
  onClose: () => void;
  onUpdated: (item: Experience) => void;
}

const SOURCES: { id: ExperienceSource; label: string }[] = [
  { id: "self_written", label: "I wrote this" },
  { id: "ai_generated", label: "AI-generated" },
  { id: "imported", label: "Imported" },
];

export default function EditHighlightModal({ item, onClose, onUpdated }: EditHighlightModalProps) {
  const [content, setContent] = useState(item.content ?? "");
  const [title, setTitle] = useState(item.title ?? "");
  const [kind, setKind] = useState<ExperienceKind>(item.kind ?? "highlight");
  const [source, setSource] = useState<ExperienceSource>(
    item.source === "imported" ? "imported" : item.source ?? "self_written"
  );
  const [sourceTool, setSourceTool] = useState(item.source_tool ?? "");
  const [skills, setSkills] = useState<string[]>(item.skills ?? []);
  const [company, setCompany] = useState(item.company ?? "");
  const [period, setPeriod] = useState(item.period ?? "");
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
      const diff: UpdateExperienceInput = {};
      if (content.trim() !== (item.content ?? "")) diff.content = content.trim();
      if ((title.trim() || "") !== (item.title ?? "")) diff.title = title.trim() || undefined;
      if (kind !== (item.kind ?? "highlight")) diff.kind = kind;
      if (source !== (item.source ?? "self_written")) diff.source = source;
      const st = source === "ai_generated" ? sourceTool.trim() : "";
      if (st !== (item.source_tool ?? "")) diff.source_tool = st || undefined;
      if ((company.trim() || "") !== (item.company ?? ""))
        diff.company = company.trim() || undefined;
      if ((period.trim() || "") !== (item.period ?? ""))
        diff.period = period.trim() || undefined;
      if (JSON.stringify(skills) !== JSON.stringify(item.skills ?? [])) diff.skills = skills;

      const updated = await updateExperience(item.id, diff);
      onUpdated(updated);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save changes.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Edit highlight" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className={labelCls}>Content</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={7}
            className="w-full px-3 py-2.5 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 resize-none"
            placeholder="Paste the accomplishment, story, or analysis here…"
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
              {SOURCES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSource(s.id)}
                  className={`px-3 py-1.5 text-sm font-semibold rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                    source === s.id
                      ? "bg-background-50 text-foreground-950"
                      : "text-foreground-600 hover:text-foreground-900"
                  }`}
                >
                  {s.label}
                </button>
              ))}
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
              Saving…
            </>
          ) : (
            <>
              <i className="ri-save-line"></i>
              Save changes
            </>
          )}
        </button>
      </form>
    </Modal>
  );
}