import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { listJobs, normalizeJobs, type Job } from "@/lib/jobs";
import {
  autofillExecute,
  autofillPreview,
  type AutofillPreview as AutofillPreviewType,
} from "@/lib/assistant";

export default function AutofillPreview() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | number>("");
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [jobsError, setJobsError] = useState("");

  const [preview, setPreview] = useState<AutofillPreviewType | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const [executing, setExecuting] = useState(false);
  const [submit, setSubmit] = useState(false);
  const [result, setResult] = useState("");

  async function loadJobs() {
    setLoadingJobs(true);
    setJobsError("");
    try {
      const data = await listJobs();
      const list = normalizeJobs(data);
      setJobs(list);
      if (list.length > 0) setSelectedId(list[0].id);
    } catch (err) {
      setJobsError(err instanceof ApiError ? err.message : "Could not load jobs.");
    } finally {
      setLoadingJobs(false);
    }
  }

  useEffect(() => {
    loadJobs();
  }, []);

  async function handlePreview() {
    if (!selectedId) return;
    setPreviewing(true);
    setPreviewError("");
    setPreview(null);
    setResult("");
    try {
      setPreview(await autofillPreview(selectedId));
    } catch (err) {
      setPreviewError(err instanceof ApiError ? err.message : "Could not preview autofill.");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleExecute() {
    if (!selectedId) return;
    setExecuting(true);
    setResult("");
    try {
      await autofillExecute(selectedId, submit);
      setResult(
        submit
          ? "Application filled and submitted."
          : "Application filled — review it before you hit submit."
      );
      setPreview(null);
    } catch (err) {
      setResult(err instanceof ApiError ? err.message : "Autofill failed.");
    } finally {
      setExecuting(false);
    }
  }

  const selectedJob = jobs.find((j) => j.id === selectedId);

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground-600">
        Preview exactly how the assistant would fill an application before anything is sent.
        Credentials are always refused and never pre-filled.
      </p>

      {jobsError && (
        <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
          <i className="ri-error-warning-line text-base mt-0.5"></i>
          <div className="flex-1">{jobsError}</div>
          <button
            onClick={loadJobs}
            className="inline-flex items-center gap-1 text-sm font-semibold hover:text-accent-900/80 cursor-pointer whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      )}

      <div className="rounded-2xl bg-background-100/60 border border-background-200 p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-foreground-600 mb-1.5">
            Select a job
          </label>
          {loadingJobs ? (
            <div className="py-2 text-sm text-foreground-500 flex items-center gap-2">
              <i className="ri-loader-4-line animate-spin"></i>
              Loading jobs…
            </div>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-foreground-500">No jobs available to preview.</p>
          ) : (
            <select
              value={String(selectedId)}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setPreview(null);
                setResult("");
              }}
              className="w-full rounded-lg bg-background-50 border border-background-200 px-3 py-2.5 text-sm text-foreground-900 outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 cursor-pointer"
            >
              {jobs.map((j) => (
                <option key={j.id} value={String(j.id)}>
                  {j.title} — {j.company}
                </option>
              ))}
            </select>
          )}
        </div>

        <button
          onClick={handlePreview}
          disabled={!selectedId || previewing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
        >
          {previewing ? (
            <>
              <i className="ri-loader-4-line animate-spin"></i>
              Previewing…
            </>
          ) : (
            <>
              <i className="ri-eye-line text-base"></i>
              Preview autofill
            </>
          )}
        </button>

        {previewError && (
          <div className="flex items-start gap-2 rounded-lg bg-accent-100 text-accent-900 px-3 py-2 text-sm">
            <i className="ri-error-warning-line text-base mt-0.5"></i>
            <span>{previewError}</span>
          </div>
        )}

        {preview && (
          <div className="space-y-3 animate-fade-in-up">
            {preview.credentials_refused && (
              <div className="flex items-start gap-2 rounded-lg bg-secondary-100 text-secondary-900 px-3 py-2 text-sm">
                <i className="ri-lock-line text-base mt-0.5"></i>
                <span>
                  Credentials (passwords, payment info) are <strong>never</strong> pre-filled.
                </span>
              </div>
            )}

            {preview.fields && Object.keys(preview.fields).length > 0 && (
              <div className="rounded-xl bg-background-50 border border-background-200 divide-y divide-background-200 overflow-hidden">
                {Object.entries(preview.fields).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="text-xs font-medium text-foreground-500 w-36 flex-shrink-0 capitalize">
                      {key.replace(/_/g, " ")}
                    </span>
                    <span className="text-sm text-foreground-900 break-words">
                      {value === null || value === undefined || value === ""
                        ? "—"
                        : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {preview.warnings && preview.warnings.length > 0 && (
              <ul className="space-y-1">
                {preview.warnings.map((w, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs text-foreground-600"
                  >
                    <i className="ri-error-warning-line text-sm mt-0.5 text-accent-600"></i>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-1">
              <label className="inline-flex items-center gap-2 text-sm text-foreground-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={submit}
                  onChange={(e) => setSubmit(e.target.checked)}
                  className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-400 cursor-pointer"
                />
                Submit after filling
              </label>
              <button
                onClick={handleExecute}
                disabled={executing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-foreground-950 text-background-50 hover:bg-foreground-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                {executing ? (
                  <>
                    <i className="ri-loader-4-line animate-spin"></i>
                    Filling…
                  </>
                ) : submit ? (
                  <>
                    <i className="ri-send-plane-line text-base"></i>
                    Fill &amp; submit
                  </>
                ) : (
                  <>
                    <i className="ri-checkbox-multiple-line text-base"></i>
                    Fill application
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {result && <p className="text-sm text-foreground-700">{result}</p>}
      </div>

      {selectedJob && (
        <p className="text-xs text-foreground-400">
          Previewing for <span className="font-medium text-foreground-600">{selectedJob.title}</span>{" "}
          at <span className="font-medium text-foreground-600">{selectedJob.company}</span>.
        </p>
      )}
    </div>
  );
}