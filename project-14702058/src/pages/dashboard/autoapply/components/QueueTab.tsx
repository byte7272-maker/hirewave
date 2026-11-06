import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { listQueue, type QueueItem } from "@/lib/autoApply";
import ActiveSessionNote from "./ActiveSessionNote";
import { useToast } from "@/components/base/ToastProvider";
import { listConnectedApps, type ConnectedApp } from "@/lib/integrations";

const SOURCE_META: Record<string, { label: string; tone: string }> = {
  linkedin: { label: "LinkedIn", tone: "bg-primary-100 text-primary-900" },
  assisted: { label: "Assisted", tone: "bg-secondary-100 text-secondary-900" },
};

function sourceMeta(source?: string) {
  return SOURCE_META[source ?? ""] ?? { label: "LinkedIn", tone: "bg-primary-100 text-primary-900" };
}

export default function QueueTab() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "linkedin" | "assisted">("all");
  const { showToast } = useToast();
  const [sessions, setSessions] = useState<ConnectedApp[]>([]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setItems((await listQueue()) ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the apply queue.");
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

  const filtered = items.filter((it) => {
    if (filter === "all") return true;
    const src = (it.source ?? "").toLowerCase();
    return src === filter || (filter === "assisted" && src !== "linkedin");
  });

  const tabs = [
    { id: "all" as const, label: "All" },
    { id: "linkedin" as const, label: "LinkedIn" },
    { id: "assisted" as const, label: "Assisted" },
  ];

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

  return (
    <div className="space-y-4">
      <ActiveSessionNote context="queue" />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-foreground-600">
          Jobs the assistant found but couldn&apos;t fully auto-apply — they need your manual click.
        </p>
        <div className="inline-flex items-center rounded-full bg-background-100 border border-background-200 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                filter === t.id
                  ? "bg-background-50 text-foreground-950"
                  : "text-foreground-600 hover:text-foreground-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

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
          Loading queue…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-background-100/60 border border-background-200 border-dashed py-16 text-center">
          <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-full bg-background-200 text-foreground-500">
            <i className="ri-check-double-line text-xl"></i>
          </div>
          <p className="text-sm font-medium text-foreground-900 mt-3">Queue is clear</p>
          <p className="text-sm text-foreground-500 mt-1">
            No jobs are waiting for a manual apply click right now.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((it) => {
            const meta = sourceMeta(it.source);
            const session = resolveSession(it.provider);
            return (
              <div
                key={it.id}
                className="rounded-2xl bg-background-100/60 border border-background-200 p-4 flex items-center gap-4 flex-wrap"
              >
                <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-background-200 text-foreground-500 flex-shrink-0">
                  <i className="ri-briefcase-line text-lg"></i>
                </div>
                <div className="flex-1 min-w-[220px]">
                  <h3 className="text-sm font-semibold text-foreground-950">{it.title}</h3>
                  <p className="text-xs text-foreground-500 mt-0.5">{it.company}</p>
                </div>
                <span
                  className={`text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${meta.tone}`}
                >
                  {meta.label}
                </span>
                {autoApplySessions.length > 1 && (
                  <span
                    className={`text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap flex items-center gap-1 ${
                      session.found
                        ? "bg-accent-100 text-accent-900"
                        : "bg-background-200 text-foreground-500"
                    }`}
                  >
                    <i className="ri-user-3-line"></i>
                    {session.label}
                  </span>
                )}
                <Link
                  to={it.job_id != null ? `/dashboard/jobs/${it.job_id}` : "/dashboard/jobs"}
                  onClick={() => showToast("Application submitted.")}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Apply
                  <i className="ri-arrow-right-line"></i>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}