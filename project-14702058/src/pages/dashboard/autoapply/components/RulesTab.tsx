import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  createGrant,
  deleteGrant,
  listGrants,
  patchGrant,
  runGrant,
  runDueRules,
  type AutoApplyGrant,
} from "@/lib/autoApply";
import ActiveSessionNote from "./ActiveSessionNote";
import { listConnectedApps, type ConnectedApp } from "@/lib/integrations";
import ConfirmDialog from "@/components/base/ConfirmDialog";
import { useToast } from "@/components/base/ToastProvider";
import { useBrandName } from "@/hooks/useBranding";

interface RuleModalProps {
  onClose: () => void;
  onCreated: () => void;
  sessions: ConnectedApp[];
}

function RuleModal({ onClose, onCreated, sessions }: RuleModalProps) {
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [remote, setRemote] = useState(false);
  const [limit, setLimit] = useState("20");
  const [provider, setProvider] = useState(() => {
    const first = sessions[0];
    return first ? String(first.provider ?? first.key ?? first.id ?? "").toLowerCase() : "";
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!role.trim()) {
      setError("Add a role or title to match on.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createGrant({
        role: role.trim(),
        location: location.trim() || undefined,
        remote,
        limit: Number(limit) || 20,
        enabled: true,
        provider: provider || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create rule.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose}></div>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-background-50 border border-background-200 rounded-2xl overflow-hidden animate-fade-in-up">
          <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
            <h3 className="font-heading text-lg font-medium text-foreground-950">New auto-apply rule</h3>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 cursor-pointer"
              aria-label="Close"
            >
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>
          <div className="p-5 space-y-4">
            <label className="block">
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                Role / title
              </span>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Frontend Engineer"
                className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                Location (optional)
              </span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. San Francisco"
                className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
              />
            </label>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-foreground-700">Remote only</span>
              <button
                onClick={() => setRemote((v) => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                  remote ? "bg-primary-500" : "bg-background-300"
                }`}
                role="switch"
                aria-checked={remote}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background-50 transition-transform ${
                    remote ? "translate-x-5" : "translate-x-0"
                  }`}
                ></span>
              </button>
            </div>
            <label className="block">
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                Max applications per run
              </span>
              <input
                type="number"
                min={1}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
              />
            </label>
            {sessions.length > 0 ? (
              <label className="block">
                <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                  Session
                </span>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 cursor-pointer"
                >
                  {sessions.map((s) => {
                    const key = String(s.provider ?? s.key ?? s.id ?? "").toLowerCase();
                    const label = s.label ?? s.name ?? key;
                    return (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : (
              <div className="text-xs text-foreground-500 bg-background-100 rounded-lg px-3 py-2.5">
                Connect an app first to bind this rule to a session.
              </div>
            )}
            {error && (
              <div className="flex items-start gap-2 text-sm text-accent-900 bg-accent-100 rounded-lg px-3 py-2.5">
                <i className="ri-error-warning-line mt-0.5"></i>
                <span>{error}</span>
              </div>
            )}
          </div>
          <div className="px-5 py-4 border-t border-background-200 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="inline-flex items-center text-sm font-semibold text-foreground-600 px-4 py-2 rounded-md hover:bg-background-100 cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {saving ? (
                <>
                  <i className="ri-loader-4-line animate-spin"></i>
                  Saving…
                </>
              ) : (
                "Create rule"
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

interface RunModalProps {
  grant: AutoApplyGrant;
  onClose: () => void;
}

function RunModal({ grant, onClose }: RunModalProps) {
  const [dryRun, setDryRun] = useState(true);
  const [limit, setLimit] = useState(grant.limit?.toString() ?? "20");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function run() {
    setRunning(true);
    setError("");
    setResult("");
    try {
      await runGrant(grant.id, { dry_run: dryRun, limit: Number(limit) || undefined });
      setResult(
        dryRun
          ? "Dry run complete. No applications were submitted — review the matches below."
          : "Rule ran successfully and matching jobs were applied to."
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not run rule.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose}></div>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-background-50 border border-background-200 rounded-2xl overflow-hidden animate-fade-in-up">
          <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
            <h3 className="font-heading text-lg font-medium text-foreground-950">Run rule</h3>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 cursor-pointer"
              aria-label="Close"
            >
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div className="rounded-lg bg-background-100 px-4 py-3">
              <div className="text-sm font-semibold text-foreground-900">
                {grant.role || grant.title || "Untitled rule"}
              </div>
              <div className="text-xs text-foreground-500 mt-0.5">
                {[grant.location, grant.remote ? "Remote" : ""].filter(Boolean).join(" · ") ||
                  "No filters"}
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-foreground-900">Dry run</div>
                <div className="text-xs text-foreground-500 mt-0.5">
                  Preview matches without applying
                </div>
              </div>
              <button
                onClick={() => setDryRun((v) => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                  dryRun ? "bg-primary-500" : "bg-background-300"
                }`}
                role="switch"
                aria-checked={dryRun}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background-50 transition-transform ${
                    dryRun ? "translate-x-5" : "translate-x-0"
                  }`}
                ></span>
              </button>
            </div>
            <label className="block">
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                Application limit
              </span>
              <input
                type="number"
                min={1}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
              />
            </label>
            {result && (
              <div className="flex items-start gap-2 text-sm text-primary-900 bg-primary-100 rounded-lg px-3 py-2.5">
                <i className="ri-check-line mt-0.5"></i>
                <span>{result}</span>
              </div>
            )}
            {error && (
              <div className="flex items-start gap-2 text-sm text-accent-900 bg-accent-100 rounded-lg px-3 py-2.5">
                <i className="ri-error-warning-line mt-0.5"></i>
                <span>{error}</span>
              </div>
            )}
          </div>
          <div className="px-5 py-4 border-t border-background-200 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="inline-flex items-center text-sm font-semibold text-foreground-600 px-4 py-2 rounded-md hover:bg-background-100 cursor-pointer whitespace-nowrap"
            >
              Close
            </button>
            <button
              onClick={run}
              disabled={running}
              className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {running ? (
                <>
                  <i className="ri-loader-4-line animate-spin"></i>
                  Running…
                </>
              ) : (
                <>
                  <i className="ri-play-line"></i>
                  Run rule
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function RulesTab() {
  const brandName = useBrandName();
  const [grants, setGrants] = useState<AutoApplyGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [runTarget, setRunTarget] = useState<AutoApplyGrant | null>(null);
  const [runningDue, setRunningDue] = useState(false);
  const [dueNotice, setDueNotice] = useState("");
  const [sessions, setSessions] = useState<ConnectedApp[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<AutoApplyGrant | null>(null);
  const { showToast } = useToast();

  async function load() {
    setLoading(true);
    setError("");
    try {
      setGrants((await listGrants()) ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load rules.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    let active = true;
    listConnectedApps()
      .then((apps) => {
        if (active) setSessions(apps ?? []);
      })
      .catch(() => {
        if (active) setSessions([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const autoApplySessions = sessions.filter(
    (s) => !!(s.connected ?? s.authenticated) && !!(s.supports_auto_apply ?? s.ai_access)
  );

  function resolveSession(provider: unknown): { label: string; found: boolean } {
    const key = String(provider ?? "").toLowerCase();
    if (!key) return { label: "No session", found: false };
    const match = autoApplySessions.find(
      (s) => String(s.provider ?? s.key ?? s.id ?? "").toLowerCase() === key
    );
    if (match) {
      return { label: match.label ?? match.name ?? key, found: true };
    }
    return { label: "No session", found: false };
  }

  async function toggleEnabled(g: AutoApplyGrant, enabled: boolean) {
    setGrants((prev) => prev.map((x) => (x.id === g.id ? { ...x, enabled } : x)));
    try {
      await patchGrant(g.id, { enabled });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update rule.");
    }
  }

  async function handleRebind(g: AutoApplyGrant, provider: string) {
    const previous = g.provider;
    setGrants((prev) => prev.map((x) => (x.id === g.id ? { ...x, provider } : x)));
    try {
      await patchGrant(g.id, { provider: provider || undefined });
    } catch (err) {
      setGrants((prev) => prev.map((x) => (x.id === g.id ? { ...x, provider: previous } : x)));
      setError(err instanceof ApiError ? err.message : "Could not update rule.");
    }
  }

  async function handleDelete(g: AutoApplyGrant) {
    setGrants((prev) => prev.filter((x) => x.id !== g.id));
    try {
      await deleteGrant(g.id);
      showToast("Rule deleted.", "info", {
        label: "Undo",
        onUndo: async () => {
          try {
            await createGrant({
              role: g.role,
              location: g.location,
              remote: g.remote,
              limit: g.limit,
              enabled: g.enabled,
              provider: g.provider,
            });
            load();
          } catch {
            // Re-creation failed; leave the rule removed.
          }
        },
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete rule.");
    }
  }

  async function handleRunDue() {
    setRunningDue(true);
    setDueNotice("");
    try {
      await runDueRules();
      setDueNotice("All scheduled rules have been triggered.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not run scheduled rules.");
    } finally {
      setRunningDue(false);
    }
  }

  return (
    <div className="space-y-4">
      <ActiveSessionNote context="rules" />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-foreground-600">
          Rules automatically scan new postings and apply on your behalf within your set limits.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunDue}
            disabled={runningDue}
            className="inline-flex items-center gap-2 text-sm font-semibold text-foreground-700 bg-background-100 border border-background-300 px-4 py-2 rounded-md hover:bg-background-200 cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            {runningDue ? (
              <i className="ri-loader-4-line animate-spin"></i>
            ) : (
              <i className="ri-time-line"></i>
            )}
            Run due rules
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line"></i>
            New rule
          </button>
        </div>
      </div>

      {dueNotice && (
        <div className="flex items-start gap-2.5 rounded-lg bg-primary-100 text-primary-900 px-4 py-3 text-sm">
          <i className="ri-check-line text-base mt-0.5"></i>
          <span>{dueNotice}</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
          <i className="ri-error-warning-line text-base mt-0.5"></i>
          <div className="flex-1">{error}</div>
          <button
            onClick={load}
            className="inline-flex items-center gap-1 text-sm font-semibold hover:text-accent-900/80 cursor-pointer whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-14 text-sm text-foreground-500 flex items-center justify-center gap-2">
          <i className="ri-loader-4-line animate-spin"></i>
          Loading rules…
        </div>
      ) : grants.length === 0 ? (
        <div className="rounded-2xl bg-background-100/60 border border-background-200 border-dashed py-16 text-center">
          <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-full bg-background-200 text-foreground-500">
            <i className="ri-magic-line text-xl"></i>
          </div>
          <p className="text-sm font-medium text-foreground-900 mt-3">No rules yet</p>
          <p className="text-sm text-foreground-500 mt-1">
            Create a rule to let {brandName} apply to matching jobs automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {grants.map((g) => {
            const session = resolveSession(g.provider);
            return (
            <div
              key={g.id}
              className="rounded-2xl bg-background-100/60 border border-background-200 p-5 flex flex-col"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-heading text-lg font-medium text-foreground-950 truncate">
                    {g.role || g.title || "Untitled rule"}
                  </h2>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {g.location && (
                      <span className="text-[11px] font-semibold text-foreground-600 bg-background-200 px-2 py-0.5 rounded-full">
                        {g.location}
                      </span>
                    )}
                    {g.remote && (
                      <span className="text-[11px] font-semibold text-secondary-900 bg-secondary-100 px-2 py-0.5 rounded-full">
                        Remote
                      </span>
                    )}
                    <span className="text-[11px] font-semibold text-foreground-600 bg-background-200 px-2 py-0.5 rounded-full">
                      ≤ {g.limit ?? 20}/run
                    </span>

                  </div>
                </div>
                <button
                  onClick={() => toggleEnabled(g, !g.enabled)}
                  className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                    g.enabled ? "bg-primary-500" : "bg-background-300"
                  }`}
                  role="switch"
                  aria-checked={g.enabled}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background-50 transition-transform ${
                      g.enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  ></span>
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-background-200">
                <span className="text-xs text-foreground-500">
                  {g.enabled ? "Active" : "Paused"}
                  {g.last_run_at ? ` · last run ${g.last_run_at}` : ""}
                </span>
                <div className="flex items-center gap-1.5">
                  {autoApplySessions.length > 1 && (
                    <select
                      value={session.found ? String(g.provider ?? "").toLowerCase() : ""}
                      onChange={(e) => handleRebind(g, e.target.value)}
                      className="text-xs font-medium bg-background-50 border border-background-200 rounded-md px-2 py-1.5 text-foreground-700 focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer"
                      aria-label="Rule session"
                    >
                      {!session.found && <option value="">No session</option>}
                      {autoApplySessions.map((s) => {
                        const key = String(s.provider ?? s.key ?? s.id ?? "").toLowerCase();
                        const label = s.label ?? s.name ?? key;
                        return (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  )}
                  <button
                    onClick={() => setRunTarget(g)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-900 px-3 py-1.5 rounded-md hover:bg-primary-100 cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-play-line"></i>
                    Run
                  </button>
                  <button
                    onClick={() => setConfirmDelete(g)}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-200 hover:text-foreground-900 cursor-pointer"
                    aria-label="Delete rule"
                  >
                    <i className="ri-delete-bin-line text-base"></i>
                  </button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <RuleModal
          sessions={autoApplySessions}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
      {runTarget && <RunModal grant={runTarget} onClose={() => setRunTarget(null)} />}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete rule?"
          message={`Remove "${confirmDelete.role || confirmDelete.title || "this rule"}"? It will stop applying to matching jobs.`}
          confirmLabel="Delete"
          onConfirm={async () => {
            await handleDelete(confirmDelete);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}