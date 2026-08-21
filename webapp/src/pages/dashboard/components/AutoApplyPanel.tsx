import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";
import {
  listSessions, disconnectSession, listGrants, createGrant, setGrantStatus,
  deleteGrant, runGrant, runDue, getApplyQueue,
  type BrowserSession, type Grant, type RunResult, type QueueItem,
} from "@/lib/autoApply";

const PROVIDERS = ["linkedin", "indeed", "glassdoor"];

function ConnectHelp({ provider, onClose }: { provider: string; onClose: () => void }) {
  const cmd = `python -m jobsearch.connect ${provider} \\\n  --api https://YOUR_API_HOST --token YOUR_TOKEN --label "you@email.com"`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-background-50 border border-background-200 rounded-2xl max-w-lg w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-heading text-lg font-medium text-foreground-950">Connect your {provider} session</h3>
        <p className="text-sm text-foreground-600">
          Run this on <strong>your own computer</strong>. A browser opens where <strong>you</strong> log in to {provider} —
          your password is typed into {provider}&apos;s own page and <strong>never touches this app</strong>. It then captures
          the session (cookies only), which is stored encrypted so the assistant can auto-apply for you.
        </p>
        <pre className="text-xs bg-background-100 border border-background-200 rounded-lg p-3 overflow-x-auto text-foreground-800 whitespace-pre-wrap">{cmd}</pre>
        <p className="text-xs text-foreground-500">
          Needs the automation extra locally: <code>pip install .[automation] &amp;&amp; playwright install chromium</code>.
        </p>
        <div className="text-right">
          <button onClick={onClose} className="text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 cursor-pointer">Got it</button>
        </div>
      </div>
    </div>
  );
}

function GrantForm({ onCreated }: { onCreated: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [locations, setLocations] = useState("");
  const [minScore, setMinScore] = useState("");
  const [maxSubmits, setMaxSubmits] = useState(10);
  const [dailyCap, setDailyCap] = useState(5);
  const [requireVerified, setRequireVerified] = useState(true);
  const [mode, setMode] = useState<"auto" | "assisted">("auto");
  const [everyHours, setEveryHours] = useState(0);
  const [busy, setBusy] = useState(false);

  const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  async function submit() {
    setBusy(true);
    try {
      await createGrant({
        name: name.trim(),
        scope: "criteria",
        criteria: {
          title_keywords: split(keywords),
          locations: split(locations),
          min_fit_score: minScore ? Number(minScore) : null,
        },
        require_verified: requireVerified,
        max_submits: maxSubmits,
        daily_cap: dailyCap,
        mode,
        interval_minutes: Math.max(0, Math.round(everyHours * 60)),
      });
      setName(""); setKeywords(""); setLocations(""); setMinScore("");
      toast.push("Auto-apply rule created.", "success");
      onCreated();
    } catch {
      toast.push("Couldn't create the rule.", "error");
    } finally { setBusy(false); }
  }

  const field = "w-full text-sm rounded-lg bg-background-50 border border-background-200 px-3 py-2 text-foreground-900 placeholder:text-foreground-400";
  return (
    <div className="rounded-xl bg-background-50 border border-background-200 p-4 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <input className={field} placeholder="Rule name (e.g. Senior Python, remote)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={field} placeholder="Title keywords (comma-sep)" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        <input className={field} placeholder="Locations (comma-sep, blank = any)" value={locations} onChange={(e) => setLocations(e.target.value)} />
        <input className={field} placeholder="Min match score (0-100)" value={minScore} onChange={(e) => setMinScore(e.target.value)} inputMode="numeric" />
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm text-foreground-700">
        <label className="flex items-center gap-2">Total cap
          <input type="number" min={1} className="w-16 rounded-md bg-background-50 border border-background-200 px-2 py-1" value={maxSubmits} onChange={(e) => setMaxSubmits(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-2">Per-day cap
          <input type="number" min={1} className="w-16 rounded-md bg-background-50 border border-background-200 px-2 py-1" value={dailyCap} onChange={(e) => setDailyCap(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={requireVerified} onChange={(e) => setRequireVerified(e.target.checked)} />
          Verified jobs only
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm text-foreground-700">
        <label className="flex items-center gap-2">Mode
          <select className="rounded-md bg-background-50 border border-background-200 px-2 py-1" value={mode} onChange={(e) => setMode(e.target.value as "auto" | "assisted")}>
            <option value="auto">Auto-submit</option>
            <option value="assisted">Assisted (I click Apply)</option>
          </select>
        </label>
        <label className="flex items-center gap-2">Auto-run every
          <input type="number" min={0} step={1} className="w-16 rounded-md bg-background-50 border border-background-200 px-2 py-1" value={everyHours} onChange={(e) => setEveryHours(Number(e.target.value))} />
          <span className="text-foreground-500">h (0 = manual)</span>
        </label>
        <button onClick={submit} disabled={busy} className="ml-auto text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 cursor-pointer disabled:opacity-60">
          {busy ? "Creating…" : "Create rule"}
        </button>
      </div>
      <p className="text-[11px] text-foreground-400">LinkedIn is always assisted — you click Apply, then automation fills the form. Other providers follow the mode above.</p>
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  active: "bg-green-100 text-green-800", paused: "bg-amber-100 text-amber-800",
  exhausted: "bg-background-200 text-foreground-600", expired: "bg-background-200 text-foreground-600",
  revoked: "bg-red-100 text-red-800",
};

function GrantCard({ grant, onChange }: { grant: Grant; onChange: () => void }) {
  const toast = useToast();
  const [run, setRun] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function doRun(dry: boolean) {
    setBusy(dry ? "preview" : "run");
    try {
      const r = await runGrant(grant.id, dry);
      setRun(r);
      if (!dry) {
        toast.push(r.submitted > 0 ? `Auto-applied to ${r.submitted} job(s).` : "No new eligible jobs to apply to.", r.submitted > 0 ? "success" : "info");
        onChange();
      }
    } catch {
      toast.push("Run failed.", "error");
    } finally { setBusy(null); }
  }
  async function toggle() {
    try { await setGrantStatus(grant.id, grant.status === "active" ? "paused" : "active"); onChange(); }
    catch { toast.push("Couldn't update.", "error"); }
  }
  async function remove() {
    try { await deleteGrant(grant.id); onChange(); }
    catch { toast.push("Couldn't delete.", "error"); }
  }

  const c = grant.criteria;
  const bits = [
    c.title_keywords.length ? `title ~ ${c.title_keywords.join(", ")}` : "",
    c.locations.length ? `in ${c.locations.join(", ")}` : "",
    c.min_fit_score != null ? `score ≥ ${c.min_fit_score}` : "",
    grant.require_verified ? "verified only" : "",
  ].filter(Boolean).join(" · ");

  return (
    <div className="rounded-xl bg-background-50 border border-background-200 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-foreground-900">{grant.name || "Auto-apply rule"}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[grant.status] ?? "bg-background-200 text-foreground-600"}`}>{grant.status}</span>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-background-200 text-foreground-600">{grant.mode === "assisted" ? "assisted" : "auto-submit"}</span>
        {grant.interval_minutes > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-background-200 text-foreground-600">every {Math.round(grant.interval_minutes / 60) || 1}h</span>}
        <span className="text-xs text-foreground-500 ml-auto">{grant.submits_used}/{grant.max_submits} used · {grant.submitted_today}/{grant.daily_cap} today</span>
      </div>
      {bits && <p className="text-xs text-foreground-500">{grant.scope === "jobs" ? `${grant.job_ids.length} selected job(s)` : bits}</p>}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => doRun(true)} disabled={!!busy} className="text-xs font-medium border border-background-300 rounded-md px-3 py-1.5 hover:bg-background-100 cursor-pointer disabled:opacity-60">
          {busy === "preview" ? "Previewing…" : "Preview"}
        </button>
        <button onClick={() => doRun(false)} disabled={!!busy || grant.status !== "active"} className="text-xs font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 rounded-md px-3 py-1.5 hover:bg-primary-600 cursor-pointer disabled:opacity-50">
          {busy === "run" ? "Running…" : "Run now"}
        </button>
        <button onClick={toggle} className="text-xs font-medium border border-background-300 rounded-md px-3 py-1.5 hover:bg-background-100 cursor-pointer">
          {grant.status === "active" ? "Pause" : "Resume"}
        </button>
        <button onClick={remove} className="text-xs text-red-600 hover:text-red-700 rounded-md px-2 py-1.5 cursor-pointer ml-auto">Delete</button>
      </div>
      {run && (
        <div className="text-xs bg-background-100 border border-background-200 rounded-lg p-3 space-y-1">
          <p className="text-foreground-600">
            {run.dry_run ? "Preview" : "Result"}: {run.eligible} eligible · {run.submitted} submitted · {run.remaining_total} left in total cap
          </p>
          {run.outcomes.slice(0, 8).map((o) => (
            <div key={o.job_id} className="flex items-center gap-2 text-foreground-700">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0"></span>
              <span className="flex-1 truncate">{o.title} · {o.company}</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-background-200 text-foreground-600">{o.status.replace(/_/g, " ")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AutoApplyPanel() {
  const toast = useToast();
  const { reviewDue } = useAuth();
  const [sessions, setSessions] = useState<BrowserSession[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [help, setHelp] = useState<string | null>(null);
  const [runningDue, setRunningDue] = useState(false);
  const [autoRun, setAutoRun] = useState(true);
  const tickBusy = useRef(false);

  const reload = useCallback(() => {
    listSessions().then(setSessions).catch(() => {});
    listGrants().then(setGrants).catch(() => {});
    getApplyQueue().then(setQueue).catch(() => {});
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const connected = new Set(sessions.filter((s) => s.status === "active").map((s) => s.provider));
  const hasScheduled = grants.some((g) => g.interval_minutes > 0 && g.status === "active");

  // While this page is open, tick due scheduled rules (a lightweight stand-in
  // for the server cron for users who aren't self-hosting). run-due only fires
  // grants whose interval has actually elapsed, so polling every 60s is cheap.
  useEffect(() => {
    if (!autoRun || !hasScheduled || reviewDue) return;  // paused until the user renews
    const tick = async () => {
      if (tickBusy.current) return;
      tickBusy.current = true;
      try {
        const runs = await runDue();
        const submitted = runs.reduce((n, r) => n + r.submitted, 0);
        if (submitted > 0) {
          reload();
          toast.push(`Scheduled auto-apply: submitted ${submitted} job(s).`, "success");
        } else if (runs.some((r) => r.outcomes.length > 0)) {
          getApplyQueue().then(setQueue).catch(() => {});  // refresh queue only
        }
      } catch { /* ignore transient errors */ }
      finally { tickBusy.current = false; }
    };
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [autoRun, hasScheduled, reviewDue, reload, toast]);

  async function disconnect(provider: string) {
    try { await disconnectSession(provider); reload(); toast.push(`Disconnected ${provider}.`, "info"); }
    catch { toast.push("Couldn't disconnect.", "error"); }
  }

  async function doRunDue() {
    setRunningDue(true);
    try {
      const runs = await runDue();
      const submitted = runs.reduce((n, r) => n + r.submitted, 0);
      toast.push(runs.length ? `Ran ${runs.length} scheduled rule(s) — ${submitted} submitted.` : "No rules are due right now.", "info");
      reload();
    } catch { toast.push("Couldn't run scheduled rules.", "error"); }
    finally { setRunningDue(false); }
  }

  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-200 p-5 animate-fade-in-up space-y-5">
      <div>
        <h2 className="font-heading text-lg font-medium text-foreground-950">Standing auto-apply</h2>
        <p className="text-xs text-foreground-500 mt-1">Connect a provider session once, then pre-authorize the assistant to apply to matching jobs — within caps you set. Credential fields are always refused; a login wall pauses and asks you to reconnect.</p>
      </div>

      {/* connected sessions */}
      <div>
        <h3 className="text-sm font-medium text-foreground-800 mb-2">Connected sessions</h3>
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map((p) => {
            const on = connected.has(p);
            return (
              <div key={p} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${on ? "border-green-300 bg-green-50" : "border-background-200 bg-background-50"}`}>
                <i className={`ri-${on ? "checkbox-circle-fill text-green-600" : "link"}`}></i>
                <span className="capitalize text-foreground-800">{p}</span>
                {on ? (
                  <button onClick={() => disconnect(p)} className="text-xs text-red-600 hover:text-red-700 cursor-pointer">disconnect</button>
                ) : (
                  <button onClick={() => setHelp(p)} className="text-xs text-primary-700 hover:text-primary-900 cursor-pointer">connect</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* create rule */}
      <div>
        <h3 className="text-sm font-medium text-foreground-800 mb-2">Create an auto-apply rule</h3>
        <GrantForm onCreated={reload} />
      </div>

      {/* rules list */}
      {grants.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-medium text-foreground-800">Your rules</h3>
            {hasScheduled && (
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-foreground-600 cursor-pointer" title="While this page is open, run scheduled rules as they come due.">
                  <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} />
                  <span className="inline-flex items-center gap-1">
                    {autoRun && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>}
                    Auto-run while open
                  </span>
                </label>
                <button onClick={doRunDue} disabled={runningDue} className="text-xs font-medium border border-background-300 rounded-md px-3 py-1.5 hover:bg-background-100 cursor-pointer disabled:opacity-60">
                  {runningDue ? "Running…" : "Run scheduled now"}
                </button>
              </div>
            )}
          </div>
          {grants.map((g) => <GrantCard key={g.id} grant={g} onChange={reload} />)}
        </div>
      )}

      {/* assisted apply queue: you click Apply, automation fills the rest */}
      {queue.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground-800">Apply queue — you click Apply, automation fills the rest ({queue.length})</h3>
          <p className="text-xs text-foreground-500">
            These matched a LinkedIn/assisted rule. Run <code className="text-foreground-700">python -m jobsearch.assist</code> locally to walk the queue, or open each and apply.
          </p>
          <div className="space-y-1.5">
            {queue.map((q) => (
              <div key={q.job_id} className="flex items-center gap-3 text-sm rounded-lg border border-background-200 bg-background-50 px-3 py-2">
                <i className="ri-briefcase-line text-primary-600"></i>
                <span className="flex-1 truncate text-foreground-800">{q.title} · {q.company}</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-background-200 text-foreground-600 capitalize">{q.provider}</span>
                <a href={q.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary-700 hover:text-primary-900 whitespace-nowrap">Open &amp; Apply →</a>
              </div>
            ))}
          </div>
        </div>
      )}

      {help && <ConnectHelp provider={help} onClose={() => setHelp(null)} />}
    </section>
  );
}
