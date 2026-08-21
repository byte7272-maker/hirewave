import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "@/lib/toast";
import { getConsent, setConsent, listActions, prepareDrafts, type Consent, type AutomationAction } from "@/lib/assistant";
import AutoApplyPanel from "@/pages/dashboard/components/AutoApplyPanel";
import RemindersPanel from "@/pages/dashboard/components/RemindersPanel";

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function Assistant() {
  const toast = useToast();
  const [consent, setC] = useState<Consent | null>(null);
  const [actions, setActions] = useState<AutomationAction[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  const reload = useCallback(() => {
    getConsent().then(setC).catch(() => {});
    listActions().then(setActions).catch(() => {});
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function toggle(scope: string) {
    if (!consent) return;
    const granted = consent.granted.includes(scope)
      ? consent.granted.filter((s) => s !== scope)
      : [...consent.granted, scope];
    setSaving(scope);
    try {
      setC(await setConsent(granted));
    } catch {
      toast.push("Couldn't update permission.", "error");
    } finally { setSaving(null); }
  }

  async function runDraftPrep() {
    setPreparing(true);
    try {
      const r = await prepareDrafts(60);
      reload();
      toast.push(r.prepared > 0 ? `Prepared ${r.prepared} draft(s) — review in Applications.` : "No strong matches without a draft right now.", r.prepared > 0 ? "success" : "info");
    } catch {
      toast.push("Couldn't prepare drafts.", "error");
    } finally { setPreparing(false); }
  }

  const draftPrepOn = consent?.granted.includes("draft_prep");

  return (
    <div className="space-y-6 max-w-3xl">
      <section className="animate-fade-in-up">
        <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">Automation assistant</h1>
        <p className="text-sm text-foreground-600 mt-1">Let the assistant do the busywork — only what you switch on, and always with a review before anything is submitted.</p>
      </section>

      {/* the promise */}
      <section className="rounded-2xl bg-primary-50 border border-primary-200 p-4 flex items-start gap-3 animate-fade-in-up">
        <i className="ri-shield-keyhole-line text-primary-700 text-xl mt-0.5"></i>
        <div className="text-sm text-primary-900">
          <strong>We never see or store your passwords.</strong> You sign in to LinkedIn, Gmail and job boards <em>directly with those providers</em> (OAuth). The assistant fills only your own factual details, refuses any credential field (passwords, SSN, card numbers), and never invents an answer.
        </div>
      </section>

      {/* permissions */}
      <section className="rounded-2xl bg-background-100/60 border border-background-200 p-5 animate-fade-in-up">
        <h2 className="font-heading text-lg font-medium text-foreground-950 mb-1">Permissions</h2>
        <p className="text-xs text-foreground-500 mb-4">Everything is off until you turn it on.</p>
        <div className="space-y-3">
          {consent && Object.entries(consent.available).map(([scope, label]) => {
            const on = consent.granted.includes(scope);
            return (
              <div key={scope} className="flex items-start justify-between gap-4 rounded-xl bg-background-50 border border-background-200 px-4 py-3">
                <span className="text-sm text-foreground-800">{label}</span>
                <button onClick={() => toggle(scope)} disabled={saving === scope} role="switch" aria-checked={on}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 cursor-pointer disabled:opacity-60 ${on ? "bg-primary-500" : "bg-background-300"}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`}></span>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* draft prep action */}
      {draftPrepOn && (
        <section className="rounded-2xl bg-background-100/60 border border-background-200 p-5 animate-fade-in-up flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-heading text-base font-medium text-foreground-950">Prepare drafts now</h2>
            <p className="text-xs text-foreground-500 mt-1">Generate résumé + cover-letter drafts for your strong matches. They land in <Link to="/dashboard/applications" className="text-primary-700 hover:text-primary-900">Applications</Link> for your review — nothing is submitted.</p>
          </div>
          <button onClick={runDraftPrep} disabled={preparing} className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 cursor-pointer disabled:opacity-60 whitespace-nowrap">
            <i className="ri-file-add-line"></i>{preparing ? "Preparing…" : "Prepare drafts"}
          </button>
        </section>
      )}

      {/* standing auto-apply: connected sessions + pre-authorized grants */}
      <AutoApplyPanel />

      {/* out-of-band reminders for the review checkpoint */}
      <RemindersPanel />

      {/* audit log */}
      <section className="rounded-2xl bg-background-100/60 border border-background-200 p-5 animate-fade-in-up">
        <h2 className="font-heading text-lg font-medium text-foreground-950 mb-3">Activity log</h2>
        {actions.length === 0 ? (
          <p className="text-sm text-foreground-500">Nothing yet. When the assistant acts on your behalf, it shows up here.</p>
        ) : (
          <div className="space-y-2">
            {actions.map((a) => (
              <div key={a.id} className="flex items-center gap-3 text-sm border border-background-200 rounded-lg px-3 py-2 bg-background-50">
                <i className="ri-magic-line text-primary-600"></i>
                <span className="capitalize font-medium text-foreground-900">{a.kind}</span>
                <span className="text-foreground-600 flex-1 truncate">{a.detail}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-background-200 text-foreground-600">{a.status}</span>
                <span className="text-[11px] text-foreground-400">{ago(a.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
