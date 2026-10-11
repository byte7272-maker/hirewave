import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import {
  aiEdit,
  activateVersion,
  applyEdits,
  getResume,
  listResumes,
  previewHtml,
  saveVersion,
  suggestEdits,
  synthesize,
  type EditSuggestion,
  type EvidenceGroup,
  type ResumeDoc,
} from "@/lib/documents";

export default function Documents() {
  const { id } = useParams();
  return id ? <ResumeEditor id={id} /> : <ResumeList />;
}

// --- résumé picker ----------------------------------------------------------
function ResumeList() {
  const toast = useToast();
  const [items, setItems] = useState<ResumeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        setItems(await listResumes());
      } catch (err) {
        toast.push(err instanceof ApiError ? err.message : "Failed to load résumés.", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-900">Documents</h1>
      <p className="mt-1 text-sm text-gray-500">Open a résumé to edit it with AI.</p>
      {loading ? (
        <p className="mt-6 text-sm text-gray-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-6 text-sm text-gray-400">No résumés yet.</p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((r) => (
            <li key={r.id}>
              <Link
                to={`/dashboard/documents/${r.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-400 hover:shadow-sm"
              >
                <div className="font-medium text-gray-900">
                  {r.target_role || r.original_filename || "Untitled résumé"}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  v{r.active_version || 1} · {r.versions?.length || 1} version
                  {(r.versions?.length || 1) === 1 ? "" : "s"}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- editor -----------------------------------------------------------------
function ResumeEditor({ id }: { id: string }) {
  const toast = useToast();
  const [doc, setDoc] = useState<ResumeDoc | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [instruction, setInstruction] = useState("");
  const [working, setWorking] = useState(false);

  // Re-fetch the server-rendered preview of the ACTIVE version. This is the step the
  // Readdy build skipped — after any change we always pull a fresh render, so the
  // preview visibly reflects the current version.
  const reloadPreview = useCallback(async () => {
    setRefreshing(true);
    try {
      setPreview(await previewHtml(id));
    } catch {
      setPreview("");
    } finally {
      setRefreshing(false);
    }
  }, [id]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getResume(id);
      setDoc(d);
      await reloadPreview();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Failed to load the résumé.", "error");
    } finally {
      setLoading(false);
    }
  }, [id, reloadPreview, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAiEdit() {
    const text = instruction.trim();
    if (!text) {
      toast.push("Type an instruction first.", "error");
      return;
    }
    if (!doc) return;
    const before = doc.active_version;
    setWorking(true);
    try {
      // Always POST — no client-side dedup. The response is the updated résumé.
      const updated = await aiEdit(id, text);
      setDoc(updated);
      await reloadPreview(); // visible refresh to the new version
      if (updated.active_version > before) {
        toast.push(`Applied — now v${updated.active_version}.`, "success");
        setInstruction("");
      } else {
        toast.push("No change was made — try rewording.", "info");
      }
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "The edit failed.", "error");
    } finally {
      setWorking(false);
    }
  }

  async function switchTo(version: number) {
    if (!doc || version === doc.active_version) return;
    setWorking(true);
    try {
      const updated = await activateVersion(id, version);
      setDoc(updated);
      await reloadPreview();
      toast.push(`Switched to v${version}.`, "success");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Couldn't switch version.", "error");
    } finally {
      setWorking(false);
    }
  }

  const versions = useMemo(
    () => (doc?.versions ?? []).slice().sort((a, b) => b.version - a.version),
    [doc],
  );

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading résumé…</div>;
  if (!doc) return <div className="p-6 text-sm text-gray-400">Résumé not found.</div>;

  return (
    <div className="flex h-full flex-col gap-4 p-6 lg:flex-row">
      {/* Preview */}
      <section className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-3">
          <Link to="/dashboard/documents" className="text-sm text-blue-600 hover:underline">
            ← Documents
          </Link>
          <h1 className="truncate text-lg font-semibold text-gray-900">
            {doc.target_role || doc.original_filename || "Résumé"}
          </h1>
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
            v{doc.active_version}
          </span>
          {refreshing && <span className="text-xs text-gray-400">refreshing…</span>}
        </div>
        <div className="h-[70vh] overflow-hidden rounded-xl border border-gray-200 bg-white">
          {preview ? (
            <iframe
              title="résumé preview"
              className="h-full w-full"
              // srcDoc changes on every reload -> the iframe re-renders (visible refresh).
              srcDoc={preview}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              No preview available.
            </div>
          )}
        </div>
      </section>

      {/* Controls */}
      <aside className="w-full shrink-0 space-y-4 lg:w-[380px]">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Ask AI to change it</h2>
          <p className="mt-1 text-xs text-gray-500">
            Applies a targeted change right away — the preview refreshes to the new version.
          </p>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void runAiEdit();
              }
            }}
            maxLength={500}
            rows={3}
            placeholder="e.g. remove the bold from the Education lines"
            className="mt-2 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-400">{instruction.length}/500 · Enter to apply</span>
            <button
              onClick={() => void runAiEdit()}
              disabled={working}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {working ? "Working…" : "Apply change"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Versions</h2>
          <p className="mt-1 text-xs text-gray-500">Click a version to view it. Undo = switch back.</p>
          <ul className="mt-2 space-y-1">
            {versions.map((v) => (
              <li key={v.version}>
                <button
                  onClick={() => void switchTo(v.version)}
                  disabled={working}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm disabled:opacity-50 ${
                    v.version === doc.active_version
                      ? "bg-blue-50 text-blue-700"
                      : "hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <span className="truncate">
                    v{v.version} · {v.label || v.change_summary || v.source}
                  </span>
                  {v.version === doc.active_version && <span className="text-xs">active</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <MyWorkHighlights id={id} onSaved={load} />
      </aside>
    </div>
  );
}

// --- My Work Highlights -----------------------------------------------------
function MyWorkHighlights({ id, onSaved }: { id: string; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [paste, setPaste] = useState("");
  const [groups, setGroups] = useState<EvidenceGroup[] | null>(null);
  const [suggestions, setSuggestions] = useState<EditSuggestion[] | null>(null);
  const [accepted, setAccepted] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState<"" | "synth" | "suggest" | "apply">("");

  async function runSynthesize() {
    if (!paste.trim()) return;
    setBusy("synth");
    try {
      const res = await synthesize(id, paste);
      setGroups(res.groups);
      setSuggestions(null);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Analysis failed.", "error");
    } finally {
      setBusy("");
    }
  }

  async function toSuggestions() {
    if (!groups?.length) return;
    setBusy("suggest");
    try {
      const context = groups.map((g) => `- ${g.summary}`).join("\n");
      const res = await suggestEdits(id, context);
      setSuggestions(res.suggestions);
      setAccepted(Object.fromEntries(res.suggestions.map((_, i) => [i, true])));
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Couldn't build suggestions.", "error");
    } finally {
      setBusy("");
    }
  }

  async function applyAndSave() {
    if (!suggestions) return;
    const chosen = suggestions.filter((_, i) => accepted[i]);
    if (!chosen.length) {
      toast.push("Accept at least one suggestion.", "error");
      return;
    }
    setBusy("apply");
    try {
      const preview = await applyEdits(id, chosen);
      await saveVersion(id, preview.rendered_text);
      toast.push(`Saved as a new version (${preview.applied} applied, ${preview.skipped} skipped).`, "success");
      setGroups(null);
      setSuggestions(null);
      setPaste("");
      await onSaved(); // reload the editor so the preview shows the saved version
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Apply/save failed.", "error");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">My Work Highlights</h2>
      <p className="mt-1 text-xs text-gray-500">
        Paste the output from your work AI → group into concepts → review editable edits → save.
      </p>
      <textarea
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        rows={4}
        placeholder="Paste your work-AI output here…"
        className="mt-2 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />
      <button
        onClick={() => void runSynthesize()}
        disabled={busy !== "" || !paste.trim()}
        className="mt-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {busy === "synth" ? "Analyzing…" : "Analyze into concepts"}
      </button>

      {groups && (
        <div className="mt-3 space-y-2">
          {groups.map((g, i) => (
            <div key={i} className="rounded-lg border border-gray-200 p-2">
              <div className="text-xs font-semibold text-gray-700">{g.theme}</div>
              <textarea
                value={g.summary}
                onChange={(e) => {
                  const next = groups.slice();
                  next[i] = { ...g, summary: e.target.value };
                  setGroups(next);
                }}
                rows={2}
                className="mt-1 w-full resize-none rounded border border-gray-200 px-2 py-1 text-xs"
              />
            </div>
          ))}
          <button
            onClick={() => void toSuggestions()}
            disabled={busy !== ""}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy === "suggest" ? "Building…" : "Turn into suggested edits"}
          </button>
        </div>
      )}

      {suggestions && (
        <div className="mt-3 space-y-2">
          {suggestions.length === 0 && <p className="text-xs text-gray-400">No suggestions.</p>}
          {suggestions.map((s, i) => (
            <div key={i} className="rounded-lg border border-gray-200 p-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                <input
                  type="checkbox"
                  checked={!!accepted[i]}
                  onChange={(e) => setAccepted({ ...accepted, [i]: e.target.checked })}
                />
                {s.action.toUpperCase()} · {s.section}
              </label>
              {s.before && <div className="mt-1 text-xs text-red-500 line-through">{s.before}</div>}
              <textarea
                value={s.after}
                onChange={(e) => {
                  const next = suggestions.slice();
                  next[i] = { ...s, after: e.target.value };
                  setSuggestions(next);
                }}
                rows={2}
                className="mt-1 w-full resize-none rounded border border-gray-200 px-2 py-1 text-xs text-green-700"
              />
              {s.rationale && <div className="mt-1 text-[11px] text-gray-400">{s.rationale}</div>}
            </div>
          ))}
          <button
            onClick={() => void applyAndSave()}
            disabled={busy !== ""}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {busy === "apply" ? "Saving…" : "Accept & Save as new version"}
          </button>
        </div>
      )}
    </div>
  );
}
