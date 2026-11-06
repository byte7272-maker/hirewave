import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { createApplication, type Application } from "@/lib/applications";
import { listJobs, type Job } from "@/lib/jobs";
import Modal from "@/components/base/Modal";

interface AddApplicationModalProps {
  onClose: () => void;
  onCreated: (app: Application) => void;
}

export default function AddApplicationModal({ onClose, onCreated }: AddApplicationModalProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobId, setJobId] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    listJobs()
      .then((list) => {
        if (active) setJobs(list ?? []);
      })
      .catch(() => {
        // Job picker is optional — silently skip if it fails.
      });
    return () => {
      active = false;
    };
  }, []);

  function selectJob(id: string) {
    setJobId(id);
    const job = jobs.find((j) => String(j.id) === String(id));
    if (job) {
      setTitle(job.title ?? "");
      setCompany(job.company ?? "");
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim() || !company.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const created = await createApplication({
        title: title.trim(),
        company: company.trim(),
        job_id: jobId ? jobId : undefined,
      });
      onCreated(created);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add the role.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Add a role" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {jobs.length > 0 && (
          <label className="block">
            <span className="block text-xs font-medium text-foreground-600 mb-1.5">
              Link to a job (optional)
            </span>
            <select
              value={jobId}
              onChange={(e) => selectJob(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 cursor-pointer"
            >
              <option value="">None — enter manually</option>
              {jobs.map((j) => (
                <option key={j.id} value={String(j.id)}>
                  {j.title} · {j.company}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="block text-xs font-medium text-foreground-600 mb-1.5">Role title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Senior Product Designer"
            className="w-full px-3 py-2.5 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-foreground-600 mb-1.5">Company</span>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g. Figma"
            className="w-full px-3 py-2.5 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
          />
        </label>

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
            <i className="ri-error-warning-line text-base mt-0.5"></i>
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !title.trim() || !company.trim()}
          className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
        >
          {submitting ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-add-line"></i>}
          {submitting ? "Adding…" : "Add a role"}
        </button>
      </form>
    </Modal>
  );
}