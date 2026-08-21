import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { autofill, executeFill, type FillPlan, type FillEntry, type LiveFillResult } from "@/lib/assistant";

const RESULT_META: Record<string, { label: string; cls: string; icon: string }> = {
  submitted: { label: "Application submitted", cls: "bg-primary-100 text-primary-900", icon: "ri-check-double-line" },
  filled_pending_submit: { label: "Form filled — review, then submit", cls: "bg-accent-100 text-accent-900", icon: "ri-edit-2-line" },
  needs_login: { label: "Sign in to the provider first", cls: "bg-secondary-100 text-secondary-900", icon: "ri-login-circle-line" },
  captcha: { label: "Human check — please solve it", cls: "bg-secondary-100 text-secondary-900", icon: "ri-shield-user-line" },
  no_apply_button: { label: "No apply button found — apply manually", cls: "bg-background-200 text-foreground-700", icon: "ri-error-warning-line" },
  needs_input: { label: "Some questions need your answers", cls: "bg-accent-100 text-accent-900", icon: "ri-question-line" },
  no_url: { label: "This posting has no application URL", cls: "bg-background-200 text-foreground-700", icon: "ri-link-unlink" },
  error: { label: "Something went wrong", cls: "bg-background-200 text-foreground-700", icon: "ri-error-warning-line" },
};

const STATUS_META: Record<string, { label: string; cls: string; icon: string }> = {
  filled: { label: "Auto-filled", cls: "text-primary-700", icon: "ri-check-line" },
  needs_input: { label: "For you to fill", cls: "text-accent-700", icon: "ri-edit-line" },
  blocked: { label: "Refused (credential)", cls: "text-foreground-500", icon: "ri-lock-line" },
};

function Group({ title, entries }: { title: string; entries: FillEntry[] }) {
  if (!entries.length) return null;
  const meta = STATUS_META[entries[0].status];
  return (
    <div>
      <div className={`flex items-center gap-1.5 text-xs font-semibold mb-1.5 ${meta.cls}`}><i className={meta.icon}></i>{title}</div>
      <div className="space-y-1">
        {entries.map((e) => (
          <div key={e.field} className="flex items-start justify-between gap-3 text-sm px-3 py-1.5 rounded-lg bg-background-50 border border-background-200">
            <span className="text-foreground-600 flex-shrink-0">{e.label}</span>
            <span className="text-foreground-900 text-right truncate">{e.value || <em className="text-foreground-400">{e.reason}</em>}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Trigger + modal previewing how the assistant would fill this job's form. */
export default function AutofillPreview({ jobId, title }: { jobId: string; title: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<FillPlan | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LiveFillResult | null>(null);

  async function launch() {
    setOpen(true); setLoading(true); setPlan(null); setNeedsPermission(false); setResult(null);
    try {
      setPlan(await autofill(jobId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setNeedsPermission(true);
    } finally { setLoading(false); }
  }

  async function run(submit: boolean) {
    setRunning(true); setResult(null);
    try {
      setResult(await executeFill(jobId, submit));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) toast.push("Turn on ‘submit after review’ in Assistant settings to let it submit.", "error");
      else toast.push("Couldn't run the browser fill.", "error");
    } finally { setRunning(false); }
  }

  const filled = plan?.entries.filter((e) => e.status === "filled") ?? [];
  const needs = plan?.entries.filter((e) => e.status === "needs_input") ?? [];
  const blocked = plan?.entries.filter((e) => e.status === "blocked") ?? [];

  return (
    <>
      <button onClick={launch} title="Preview auto-fill" aria-label="Preview auto-fill"
        className="w-9 h-9 flex items-center justify-center rounded-lg border border-background-300 text-foreground-400 hover:text-primary-700 hover:border-primary-300 cursor-pointer transition-colors">
        <i className="ri-magic-line"></i>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div onClick={(e) => e.stopPropagation()} className="relative bg-background-50 rounded-2xl border border-background-200 shadow-xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
              <div>
                <h3 className="font-heading text-lg font-medium text-foreground-950">Auto-fill preview</h3>
                <p className="text-xs text-foreground-500 truncate max-w-[380px]">{title}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-foreground-400 hover:text-foreground-700 cursor-pointer"><i className="ri-close-line text-xl"></i></button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {loading ? (
                <div className="py-10 text-center text-foreground-500"><i className="ri-loader-4-line text-2xl animate-spin"></i></div>
              ) : needsPermission ? (
                <div className="text-center py-6">
                  <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-xl bg-background-200 text-foreground-500 mb-3"><i className="ri-shield-keyhole-line text-xl"></i></div>
                  <p className="text-sm text-foreground-700">Turn on <strong>auto-fill</strong> to let the assistant prepare application forms from your profile.</p>
                  <Link to="/dashboard/assistant" onClick={() => setOpen(false)} className="inline-block mt-3 text-sm font-semibold text-primary-700 hover:text-primary-900">Enable in Assistant settings →</Link>
                </div>
              ) : plan ? (
                <>
                  <p className="text-xs text-foreground-500">The assistant fills these when you apply — <strong>you review first, and nothing submits automatically</strong>.</p>
                  <Group title={`Auto-filled from your profile (${filled.length})`} entries={filled} />
                  <Group title={`You'll need to fill (${needs.length})`} entries={needs} />
                  {blocked.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold mb-1.5 text-foreground-500"><i className="ri-lock-line"></i>Never filled — you authenticate directly ({blocked.length})</div>
                      <div className="space-y-1">
                        {blocked.map((e) => (
                          <div key={e.field} className="text-sm px-3 py-1.5 rounded-lg bg-background-100 border border-background-200 text-foreground-500">{e.label} <span className="text-[11px]">· refused</span></div>
                        ))}
                      </div>
                    </div>
                  )}

                  {result && (() => {
                    const meta = RESULT_META[result.status] ?? RESULT_META.error;
                    return (
                      <div className={`rounded-lg px-3 py-2 text-sm flex items-start gap-2 ${meta.cls}`}>
                        <i className={`${meta.icon} mt-0.5`}></i>
                        <div>
                          <div className="font-semibold">{meta.label}{result.live ? " (live browser)" : " (simulated)"}</div>
                          <div className="text-xs opacity-90">{result.detail}</div>
                        </div>
                      </div>
                    );
                  })()}
                </>
              ) : null}
            </div>

            {plan && !needsPermission && (
              <div className="px-5 py-3 border-t border-background-200 flex items-center justify-end gap-2">
                <button onClick={() => run(false)} disabled={running} className="text-sm font-medium bg-background-50 border border-background-200 text-foreground-700 px-4 py-2 rounded-md hover:bg-background-100 cursor-pointer disabled:opacity-60">
                  {running ? "Running…" : "Fill in browser"}
                </button>
                <button onClick={() => run(true)} disabled={running} className="text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 cursor-pointer disabled:opacity-60">
                  Fill &amp; submit
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
