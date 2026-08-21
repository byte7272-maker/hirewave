import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { listActions, type AutomationAction } from "@/lib/assistant";
import { listGrants, type Grant } from "@/lib/autoApply";

/** Periodic consent checkpoint (every ~3.5 days = half the session lifetime).
 *  The user reviews recent automation and explicitly renews, or signs out. Until
 *  they act, background automation is paused and the session stops sliding. */
export default function SessionReviewModal() {
  const { reviewDue, renew, logout } = useAuth();
  const toast = useToast();
  const [actions, setActions] = useState<AutomationAction[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!reviewDue) return;
    listActions().then(setActions).catch(() => {});
    listGrants().then(setGrants).catch(() => {});
  }, [reviewDue]);

  if (!reviewDue) return null;

  const activeGrants = grants.filter((g) => g.status === "active");
  const recent = actions.slice(0, 5);

  async function doRenew() {
    setBusy(true);
    try {
      await renew();
      toast.push("Session renewed — automation resumed.", "success");
    } catch {
      toast.push("Couldn't renew — please sign in again.", "error");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background-50 border border-background-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
        <div className="flex items-start gap-3">
          <i className="ri-shield-check-line text-primary-700 text-2xl mt-0.5"></i>
          <div>
            <h3 className="font-heading text-lg font-medium text-foreground-950">Quick check-in — renew your automation</h3>
            <p className="text-sm text-foreground-600 mt-1">
              It&apos;s been about half your session&apos;s lifetime. For your safety we&apos;ve <strong>paused background
              automation</strong> and stopped keeping this session alive until you confirm you still want it running.
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-background-100/70 border border-background-200 p-4 space-y-2">
          <p className="text-sm text-foreground-800">
            <strong>{activeGrants.length}</strong> active auto-apply rule{activeGrants.length === 1 ? "" : "s"} · <strong>{actions.length}</strong> recent action{actions.length === 1 ? "" : "s"}
          </p>
          {recent.length > 0 ? (
            <ul className="space-y-1">
              {recent.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-xs text-foreground-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0"></span>
                  <span className="capitalize font-medium text-foreground-800">{a.kind}</span>
                  <span className="flex-1 truncate">{a.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-foreground-500">No automated actions in this period.</p>
          )}
          <Link to="/dashboard/assistant" className="text-xs text-primary-700 hover:text-primary-900">Review full activity →</Link>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={doRenew} disabled={busy} className="text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 cursor-pointer disabled:opacity-60">
            {busy ? "Renewing…" : "Keep running — renew for 3½ days"}
          </button>
          <button onClick={() => logout()} className="text-sm font-medium text-foreground-600 hover:text-foreground-900 px-3 py-2.5 cursor-pointer">
            Sign out &amp; stop
          </button>
        </div>
      </div>
    </div>
  );
}
