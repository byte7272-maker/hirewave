import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { emitDataChanged } from "@/lib/backend";
import {
  runJobSearch, importEmailAlert, listSavedSearches, createSavedSearch, updateSavedSearch,
  deleteSavedSearch, runSavedSearch, type SavedSearch, type AggregationResult,
} from "@/lib/sourcing";

const INTERVALS = [
  { v: 60, label: "hourly" },
  { v: 720, label: "twice a day" },
  { v: 1440, label: "daily" },
  { v: 10080, label: "weekly" },
];

function summarize(r: AggregationResult): string {
  const bits = [`${r.ingested - r.hidden} new role${r.ingested - r.hidden === 1 ? "" : "s"}`];
  if (r.sources.length) bits.push(`across ${r.sources.join(", ")}`);
  const extra: string[] = [];
  if (r.hidden) extra.push(`${r.hidden} filtered as suspicious`);
  if (r.duplicates) extra.push(`${r.duplicates} duplicate${r.duplicates === 1 ? "" : "s"} skipped`);
  if (r.drafts_prepared) extra.push(`${r.drafts_prepared} draft${r.drafts_prepared === 1 ? "" : "s"} auto-prepared`);
  return bits.join(" ") + (extra.length ? ` · ${extra.join(" · ")}` : "");
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** The agent that searches Indeed / Monster / Glassdoor & co. on the user's
 *  behalf, ingesting new postings. `onSearched` lets the parent reload matches. */
export default function JobSiteSearch({ onSearched }: { onSearched: () => void }) {
  const toast = useToast();
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [interval, setIntervalMin] = useState(1440);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AggregationResult | null>(null);
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const emailInput = useRef<HTMLInputElement>(null);

  const reloadSaved = useCallback(() => { listSavedSearches().then(setSaved).catch(() => {}); }, []);
  useEffect(() => { reloadSaved(); }, [reloadSaved]);

  async function search() {
    if (!role.trim()) { toast.push("Enter a role to search for.", "error"); return; }
    setBusy(true); setResult(null);
    try {
      const r = await runJobSearch({ role, location, remote: remoteOnly ? true : null });
      setResult(r);
      emitDataChanged();
      onSearched();
      toast.push(`Search complete — ${r.ingested - r.hidden} new roles ingested.`, "success");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Search failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onEmail(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true); setResult(null);
    try {
      const r = await importEmailAlert(f);
      setResult(r.result);
      emitDataChanged();
      onSearched();
      const net = r.result.ingested - r.result.hidden;
      toast.push(r.parsed === 0 ? "No job links found in that email." : `Imported ${net} role${net === 1 ? "" : "s"} from your ${r.source} alert.`, r.parsed === 0 ? "info" : "success");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Couldn't read that email.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!role.trim()) { toast.push("Enter a role first.", "error"); return; }
    try {
      await createSavedSearch({ role, location, remote: remoteOnly ? true : null, interval_minutes: interval });
      toast.push("Saved — the agent will re-run this and alert you to new roles.", "success");
      reloadSaved();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Couldn't save.", "error");
    }
  }

  async function runSaved(s: SavedSearch) {
    setRowBusy(s.id);
    try {
      const r = await runSavedSearch(s.id);
      emitDataChanged(); onSearched(); reloadSaved();
      toast.push(`“${s.role}” · ${summarize(r)}.`, r.ingested - r.hidden > 0 ? "success" : "info");
    } catch {
      toast.push("Run failed.", "error");
    } finally {
      setRowBusy(null);
    }
  }

  async function toggle(s: SavedSearch) {
    try { await updateSavedSearch(s.id, !s.active); reloadSaved(); } catch { /* */ }
  }
  async function remove(s: SavedSearch) {
    try { await deleteSavedSearch(s.id); reloadSaved(); } catch { /* */ }
  }

  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-200 p-5 animate-fade-in-up">
      <div className="flex items-center gap-2 mb-1">
        <i className="ri-radar-line text-primary-600"></i>
        <h2 className="font-heading text-lg font-medium text-foreground-950">Search across job sites</h2>
      </div>
      <p className="text-xs text-foreground-500 mb-4">The agent queries Indeed, Monster, Glassdoor and others, de-duplicates, filters scams, and adds new roles to your matches.</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="block lg:col-span-2">
          <span className="block text-xs font-medium text-foreground-600 mb-1.5">Role / keywords</span>
          <input value={role} onChange={(e) => setRole(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="e.g. Senior Backend Engineer"
            className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-foreground-600 mb-1.5">Location</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Anywhere"
            className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
        </label>
        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 text-sm text-foreground-700 cursor-pointer h-10">
            <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} className="w-4 h-4 rounded border-background-300 accent-primary-500 cursor-pointer" />
            Remote only
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button onClick={search} disabled={busy} className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 cursor-pointer disabled:opacity-60">
          <i className="ri-search-line"></i>{busy ? "Searching…" : "Search across sites"}
        </button>
        <span className="text-xs text-foreground-500">or run automatically</span>
        <select value={interval} onChange={(e) => setIntervalMin(Number(e.target.value))} className="h-9 px-2 rounded-lg bg-background-50 border border-background-200 text-sm cursor-pointer">
          {INTERVALS.map((i) => <option key={i.v} value={i.v}>{i.label}</option>)}
        </select>
        <button onClick={save} className="inline-flex items-center gap-2 text-sm font-medium bg-background-50 border border-background-200 text-foreground-700 px-3 py-2 rounded-md hover:bg-background-100 cursor-pointer">
          <i className="ri-bookmark-line"></i>Save this search
        </button>
        <input ref={emailInput} type="file" accept=".eml,message/rfc822,text/html,.html,.txt" onChange={onEmail} className="hidden" />
        <button onClick={() => emailInput.current?.click()} disabled={busy} title="Upload a forwarded job-alert email (.eml)" className="inline-flex items-center gap-2 text-sm font-medium bg-background-50 border border-background-200 text-foreground-700 px-3 py-2 rounded-md hover:bg-background-100 cursor-pointer disabled:opacity-60">
          <i className="ri-mail-download-line"></i>Import email alert
        </button>
      </div>

      {result && <p className="text-sm text-foreground-700 mt-3">Found {summarize(result)}.</p>}

      {saved.length > 0 && (
        <div className="mt-5 border-t border-background-200 pt-4">
          <h3 className="text-xs font-semibold text-foreground-700 mb-2">Scheduled searches</h3>
          <div className="space-y-2">
            {saved.map((s) => (
              <div key={s.id} className="flex items-center gap-3 flex-wrap rounded-lg border border-background-200 bg-background-50 px-3 py-2">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.active ? "bg-primary-500" : "bg-background-300"}`} title={s.active ? "active" : "paused"} />
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-foreground-900 font-medium">{s.role}</span>
                  <span className="text-xs text-foreground-500">{s.location ? ` · ${s.location}` : ""}{s.remote ? " · remote" : ""} · {INTERVALS.find((i) => i.v === s.interval_minutes)?.label ?? `${s.interval_minutes}m`}</span>
                  <span className="block text-[11px] text-foreground-400">Last run {ago(s.last_run_at)}{s.last_run_at ? ` · ${s.last_new_count} new` : ""}</span>
                </div>
                <button onClick={() => runSaved(s)} disabled={rowBusy === s.id} className="text-xs font-semibold text-primary-700 hover:text-primary-900 cursor-pointer disabled:opacity-50">{rowBusy === s.id ? "Running…" : "Run now"}</button>
                <button onClick={() => toggle(s)} className="text-xs text-foreground-600 hover:text-foreground-900 cursor-pointer">{s.active ? "Pause" : "Resume"}</button>
                <button onClick={() => remove(s)} className="text-xs text-accent-700 hover:text-accent-900 cursor-pointer">Delete</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
