import { useState, type FormEvent } from "react";
import Modal from "@/components/base/Modal";
import type { QuestionTitle } from "@/lib/questions";

export const QUESTION_CATEGORIES = [
  "Behavioral",
  "Technical",
  "Case study",
  "Leadership",
  "General",
];

interface ContributeModalProps {
  titles: QuestionTitle[];
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (data: { job_title: string; question: string; category: string; tips: string }) => void;
}

export default function ContributeModal({
  titles,
  saving,
  error,
  onClose,
  onSubmit,
}: ContributeModalProps) {
  const [jobTitle, setJobTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState(QUESTION_CATEGORIES[0]);
  const [tips, setTips] = useState("");

  const canSubmit = jobTitle.trim() !== "" && question.trim() !== "" && !saving;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      job_title: jobTitle.trim(),
      question: question.trim(),
      category,
      tips: tips.trim(),
    });
  }

  return (
    <Modal title="Contribute a question" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-foreground-600 mb-1.5">
            Job title
          </label>
          <input
            list="contribute-titles"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g. Senior Product Designer"
            className="w-full rounded-lg bg-background-50 border border-background-200 px-3 py-2 text-sm text-foreground-900 placeholder:text-foreground-400 outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
          />
          <datalist id="contribute-titles">
            {titles.map((t) => (
              <option key={t.title} value={t.title} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground-600 mb-1.5">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg bg-background-50 border border-background-200 px-3 py-2 text-sm text-foreground-900 outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 cursor-pointer"
          >
            {QUESTION_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground-600 mb-1.5">Question</label>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="What's a question you wish you'd been ready for?"
            className="w-full rounded-lg bg-background-50 border border-background-200 px-3 py-2 text-sm text-foreground-900 placeholder:text-foreground-400 outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 resize-none"
          />
          <span className="block text-right text-[11px] text-foreground-400 mt-0.5">
            {question.length}/500
          </span>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground-600 mb-1.5">
            Interview tips <span className="text-foreground-400">(optional)</span>
          </label>
          <textarea
            value={tips}
            onChange={(e) => setTips(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Share how you'd approach answering this one."
            className="w-full rounded-lg bg-background-50 border border-background-200 px-3 py-2 text-sm text-foreground-900 placeholder:text-foreground-400 outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 resize-none"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-accent-100 text-accent-900 px-3 py-2 text-sm">
            <i className="ri-error-warning-line text-base mt-0.5"></i>
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-semibold text-foreground-600 hover:bg-background-100 cursor-pointer whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-4 py-2 rounded-md text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
          >
            {saving ? "Posting…" : "Post question"}
          </button>
        </div>
      </form>
    </Modal>
  );
}