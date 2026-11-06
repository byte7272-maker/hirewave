import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import {
  deleteSearch,
  listSearches,
  runSavedSearch,
  updateSearch,
  type SavedSearch,
} from "@/lib/jobs";
import Modal from "@/components/base/Modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/base";

const SOURCES = ["LinkedIn", "Indeed", "Greenhouse", "Lever", "Workday", "Company sites"];

interface SavedSearchesProps {
  refreshKey: number;
  onRun: (result: unknown) => void;
}

const inputCls =
  "w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300";

function formatDate(v?: string) {
  if (!v) return "Never run";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function SavedSearches({ refreshKey, onRun }: SavedSearchesProps) {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [runningId, setRunningId] = useState<string | number | null>(null);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);

  const [editing, setEditing] = useState<SavedSearch | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editRemote, setEditRemote] = useState(false);
  const [editSources, setEditSources] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const list = await listSearches();
      setSearches(list ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load saved searches.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [refreshKey]);

  async function handleRun(s: SavedSearch) {
    setRunningId(s.id);
    setError("");
    try {
      const result = await runSavedSearch(s.id);
      onRun(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Run failed.");
    } finally {
      setRunningId(null);
    }
  }

  async function handleDelete(id: string | number) {
    setDeletingId(id);
    setError("");
    try {
      await deleteSearch(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  function openEdit(s: SavedSearch) {
    setEditing(s);
    setEditRole(s.role ?? "");
    setEditLocation(s.location ?? "");
    setEditRemote(Boolean(s.remote));
    setEditSources(s.sources ?? []);
  }

  function toggleSource(src: string) {
    setEditSources((prev) =>
      prev.includes(src) ? prev.filter((x) => x !== src) : [...prev, src]
    );
  }

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      await updateSearch(editing.id, {
        role: editRole.trim(),
        location: editLocation.trim(),
        remote: editRemote,
        sources: editSources,
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the search.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-background-200">
        <h2 className="font-heading text-lg font-medium text-foreground-950">Saved searches</h2>
        <p className="text-xs text-foreground-500 mt-0.5">
          Your agent re-runs these on a schedule and surfaces new roles.
        </p>
      </div>

      <div className="p-5 space-y-3">
        {error && (
          <ErrorState
            title="Couldn't load saved searches"
            message={error}
            onRetry={load}
            className="py-8"
          />
        )}

        {loading ? (
          <LoadingState label="Loading saved searches…" rows={3} />
        ) : searches.length === 0 ? (
          <EmptyState
            icon="ri-save-line"
            title="No saved searches yet"
            description="Build a search above, then hit “Save search” to have the agent track it for new roles."
            tone="secondary"
            className="py-10"
          />
        ) : (
          searches.map((s) => (
            <div
              key={s.id}
              className="rounded-xl bg-background-50 border border-background-200 p-4 flex items-center gap-3 flex-wrap"
            >
              <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-primary-100 text-primary-700 flex-shrink-0">
                <i className="ri-radar-line text-lg"></i>
              </div>
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm font-medium text-foreground-950 whitespace-nowrap">
                  {s.role || "Untitled search"}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {s.location && (
                    <span className="text-xs text-foreground-600 whitespace-nowrap">
                      <i className="ri-map-pin-line mr-1"></i>
                      {s.location}
                    </span>
                  )}
                  {s.remote && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-900 whitespace-nowrap">
                      Remote
                    </span>
                  )}
                  {(s.sources ?? []).slice(0, 3).map((src) => (
                    <span
                      key={src}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-background-200/70 text-foreground-600 whitespace-nowrap"
                    >
                      {src}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-foreground-400 mt-1">
                  Last run {formatDate(s.last_run_at)}
                  {typeof s.result_count === "number" ? ` · ${s.result_count} results` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => handleRun(s)}
                  disabled={runningId === s.id}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                >
                  <i className={runningId === s.id ? "ri-loader-4-line animate-spin" : "ri-play-line"}></i>
                  {runningId === s.id ? "Running…" : "Run"}
                </button>
                <button
                  onClick={() => openEdit(s)}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-foreground-500 hover:bg-background-200 hover:text-foreground-900 cursor-pointer"
                  title="Edit"
                  aria-label="Edit"
                >
                  <i className="ri-edit-line"></i>
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  disabled={deletingId === s.id}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-foreground-500 hover:bg-background-200 hover:text-foreground-900 cursor-pointer disabled:opacity-60"
                  title="Delete"
                  aria-label="Delete"
                >
                  <i className="ri-delete-bin-line"></i>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {editing && (
        <Modal title="Edit saved search" onClose={() => setEditing(null)}>
          <form onSubmit={handleSave} className="space-y-4">
            <label className="block">
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">Role</span>
              <input
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                placeholder="e.g. Senior Product Designer"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">Location</span>
              <input
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder="e.g. Remote · US"
                className={inputCls}
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-foreground-700 cursor-pointer">
              <input
                type="checkbox"
                checked={editRemote}
                onChange={(e) => setEditRemote(e.target.checked)}
                className="w-4 h-4 rounded border-background-300 accent-primary-500 cursor-pointer"
              />
              Remote only
            </label>
            <div>
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">Sources</span>
              <div className="flex flex-wrap gap-2">
                {SOURCES.map((src) => (
                  <button
                    type="button"
                    key={src}
                    onClick={() => toggleSource(src)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer whitespace-nowrap transition-colors ${
                      editSources.includes(src)
                        ? "bg-primary-500 text-background-50 dark:text-foreground-950 border-primary-500"
                        : "bg-background-50 text-foreground-600 border-background-300 hover:border-foreground-300"
                    }`}
                  >
                    {src}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={saving || !editRole.trim()}
              className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              {saving ? (
                <i className="ri-loader-4-line animate-spin"></i>
              ) : (
                <i className="ri-save-line"></i>
              )}
              {saving ? "Saving…" : "Save search"}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}