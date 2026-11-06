import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { createExperience, uploadExperience } from "@/lib/experience";
import { dismissOnboardingStep } from "@/lib/onboarding";

type WizardStep = "explain" | "add" | "done";
type Source = "self_written" | "ai_generated";

const labelCls = "block text-xs font-medium text-foreground-600 mb-1.5";
const inputCls =
  "w-full px-3 py-2.5 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300";

const STEP_LABELS: { id: WizardStep; label: string }[] = [
  { id: "explain", label: "Explain" },
  { id: "add", label: "Add" },
  { id: "done", label: "Done" },
];

interface HighlightsWizardProps {
  stepKey?: string;
  onComplete?: () => void;
  onSkip?: () => void;
  onClose?: () => void;
}

export default function HighlightsWizard({
  stepKey = "highlights",
  onComplete,
  onSkip,
  onClose,
}: HighlightsWizardProps) {
  const [step, setStep] = useState<WizardStep>("explain");
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState<Source>("self_written");
  const [sourceTool, setSourceTool] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState("");

  function handleClose() {
    if (step === "done") {
      onComplete?.();
    } else {
      onClose?.();
    }
  }

  async function handleSkip() {
    if (skipping) return;
    setSkipping(true);
    setError("");
    try {
      await dismissOnboardingStep(stepKey);
    } catch {
      // Even if the dismiss call fails, let the user move on.
    } finally {
      setSkipping(false);
      onSkip?.();
    }
  }

  function handleFile(fileList: FileList | null) {
    const f = fileList?.[0];
    if (f) setFile(f);
  }

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (file) {
      setSubmitting(true);
      try {
        await uploadExperience(file, {
          title: title.trim() || undefined,
          source: "imported",
          source_tool:
            source === "ai_generated" && sourceTool.trim() ? sourceTool.trim() : undefined,
        });
        setStep("done");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not upload file.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (content.trim().length < 10) {
      setError("Please add at least 10 characters of content.");
      return;
    }

    setSubmitting(true);
    try {
      await createExperience({
        content: content.trim(),
        title: title.trim() || undefined,
        source,
        source_tool:
          source === "ai_generated" && sourceTool.trim() ? sourceTool.trim() : undefined,
      });
      setStep("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add highlight.");
    } finally {
      setSubmitting(false);
    }
  }

  const currentIndex = STEP_LABELS.findIndex((s) => s.id === step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground-950/40 dark:bg-black/55" onClick={handleClose}></div>

      <div className="relative w-full max-w-lg bg-background-50 rounded-2xl border border-background-200 animate-fade-in-up max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-background-200">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-lg font-medium text-foreground-950">
              Add work highlights
            </h3>
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 cursor-pointer"
              aria-label="Close"
            >
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            {STEP_LABELS.map((s, idx) => (
              <div key={s.id} className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-1.5 ${
                    idx <= currentIndex ? "text-primary-600" : "text-foreground-400"
                  }`}
                >
                  <span
                    className={`w-5 h-5 flex items-center justify-center rounded-full text-[11px] font-semibold ${
                      idx < currentIndex
                        ? "bg-primary-500 text-background-50"
                        : idx === currentIndex
                        ? "bg-primary-100 text-primary-700"
                        : "bg-background-200 text-foreground-500"
                    }`}
                  >
                    {idx < currentIndex ? (
                      <i className="ri-check-line text-xs"></i>
                    ) : (
                      idx + 1
                    )}
                  </span>
                  <span className="text-xs font-medium whitespace-nowrap">{s.label}</span>
                </div>
                {idx < STEP_LABELS.length - 1 && (
                  <span className="h-px w-6 bg-background-300"></span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="p-5">
          {step === "explain" && (
            <div className="space-y-5">
              <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                <i className="ri-lightbulb-flash-line text-2xl"></i>
              </div>
              <div>
                <h4 className="font-heading text-xl font-medium text-foreground-950">
                  Bring in your best work
                </h4>
                <p className="text-sm text-foreground-600 mt-2 leading-relaxed">
                  Accomplishments, project stories, or wins. You can write them yourself, or paste
                  what an AI assistant in your own work tools (Copilot, Glean, a Teams/email
                  assistant) summarized for you. These make your interview answers stronger and
                  more specific.
                </p>
              </div>
              <div className="flex items-start gap-2.5 rounded-lg bg-background-100 border border-background-200 px-3.5 py-3">
                <i className="ri-lock-line text-foreground-500 mt-0.5"></i>
                <p className="text-xs text-foreground-600 leading-relaxed">
                  We never connect to your work email or accounts — you bring the finished text.
                </p>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleSkip}
                  disabled={skipping}
                  className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-foreground-600 px-4 py-2.5 rounded-md hover:bg-background-100 transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap"
                >
                  {skipping ? <i className="ri-loader-4-line animate-spin"></i> : null}
                  Skip for now
                </button>
                <button
                  type="button"
                  onClick={() => setStep("add")}
                  className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-add-line"></i>
                  Add a highlight
                </button>
              </div>
            </div>
          )}

          {step === "add" && (
            <form onSubmit={handleAdd} className="space-y-4">
              <label className="block">
                <span className={labelCls}>
                  Paste your highlight, story, or what your work AI assistant wrote
                </span>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
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

              {source === "ai_generated" && (
                <label className="block">
                  <span className={labelCls}>Which tool? (optional)</span>
                  <input
                    value={sourceTool}
                    onChange={(e) => setSourceTool(e.target.value)}
                    className={inputCls}
                    placeholder="e.g. Microsoft 365 Copilot"
                  />
                </label>
              )}

              <div className="flex items-center gap-3 rounded-lg border border-dashed border-background-300 bg-background-50 px-4 py-3">
                <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-lg bg-background-200 text-foreground-500">
                  <i className="ri-file-upload-line text-lg"></i>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground-900 truncate">
                    {file ? file.name : "Or upload a file instead"}
                  </p>
                  <p className="text-xs text-foreground-500">
                    {file ? `${(file.size / 1024).toFixed(0)} KB` : "PDF, DOCX, MD, or TXT"}
                  </p>
                </div>
                <label className="text-sm font-semibold text-primary-600 hover:text-primary-700 cursor-pointer whitespace-nowrap">
                  {file ? "Change" : "Choose"}
                  <input
                    type="file"
                    accept=".pdf,.docx,.md,.txt,application/pdf,text/plain,text/markdown"
                    onChange={(e) => handleFile(e.target.files)}
                    className="hidden"
                  />
                </label>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
                  <i className="ri-error-warning-line text-base mt-0.5"></i>
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setStep("explain")}
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-foreground-600 px-4 py-2.5 rounded-md hover:bg-background-100 transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                >
                  {submitting ? (
                    <>
                      <i className="ri-loader-4-line animate-spin"></i>
                      {file ? "Uploading…" : "Adding…"}
                    </>
                  ) : (
                    <>
                      <i className="ri-add-line"></i>
                      {file ? "Upload & extract" : "Add highlight"}
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {step === "done" && (
            <div className="space-y-5 text-center py-2">
              <div className="w-14 h-14 mx-auto flex items-center justify-center rounded-full bg-accent-100 text-accent-700">
                <i className="ri-check-line text-3xl"></i>
              </div>
              <div>
                <h4 className="font-heading text-xl font-medium text-foreground-950">
                  Added — this now feeds your interview prep.
                </h4>
                <p className="text-sm text-foreground-600 mt-2 leading-relaxed">
                  Your highlight will sharpen suggested answers, so you walk into interviews ready
                  with concrete, specific stories.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onComplete?.()}
                className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
              >
                Done
              </button>
              <Link
                to="/dashboard/interview"
                className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-primary-600 hover:text-primary-700 px-5 py-2 rounded-md hover:bg-primary-100/60 transition-colors cursor-pointer whitespace-nowrap"
              >
                See it in Interview Prep
                <i className="ri-arrow-right-line"></i>
              </Link>
              <Link
                to="/dashboard/auto-apply?connect=linkedin"
                className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-foreground-600 border border-background-300 px-5 py-2.5 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-link"></i>
                Connect LinkedIn to auto-apply
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}