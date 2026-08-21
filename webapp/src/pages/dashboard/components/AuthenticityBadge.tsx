import { useEffect, useState } from "react";
import { useToast } from "@/lib/toast";
import {
  getJobAuthenticity, reportJob, verifyEmployer, VERDICT_META, EMPLOYER_META, type Authenticity,
} from "@/lib/authenticity";

/** Shows the shared community verdict for a job and lets the user report it
 *  (real / dubious / scam) or verify it against the employer's site. */
export default function AuthenticityBadge({ jobId, source }: { jobId: string; source?: string }) {
  const toast = useToast();
  const [rec, setRec] = useState<Authenticity | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getJobAuthenticity(jobId).then((r) => { if (alive) setRec(r); }).catch(() => {});
    return () => { alive = false; };
  }, [jobId]);

  async function report(verdict: "legit" | "dubious" | "scam") {
    setOpen(false); setBusy(true);
    try {
      setRec(await reportJob(jobId, verdict));
      toast.push(verdict === "legit" ? "Thanks — marked as legit." : "Thanks — the community has been warned.", "success");
    } catch {
      toast.push("Couldn't submit your report.", "error");
    } finally { setBusy(false); }
  }

  async function verify() {
    setOpen(false); setBusy(true);
    try {
      const r = await verifyEmployer(jobId);
      setRec(r);
      toast.push(EMPLOYER_META[r.employer_status] ?? "Checked.", r.employer_status === "listed" ? "success" : "info");
    } catch {
      toast.push("Employer check failed.", "error");
    } finally { setBusy(false); }
  }

  const meta = rec ? (VERDICT_META[rec.verdict] ?? VERDICT_META.unverified) : null;
  const t = rec?.tally;
  const tallyText = t && (t.legit || t.dubious || t.scam)
    ? [t.legit && `${t.legit} legit`, t.dubious && `${t.dubious} dubious`, t.scam && `${t.scam} scam`].filter(Boolean).join(" · ")
    : "no reports yet";

  return (
    <div className="flex items-center gap-2 mt-2 relative">
      {meta ? (
        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${meta.cls}`} title={`${tallyText}${rec?.employer_status && rec.employer_status !== "unknown" ? ` · ${EMPLOYER_META[rec.employer_status]}` : ""}`}>
          <i className={meta.icon}></i>{meta.label}
        </span>
      ) : (
        <span className="text-[11px] text-foreground-400">{source ? `${source} · ` : ""}checking…</span>
      )}
      {source && meta && <span className="text-[11px] text-foreground-400">via {source}</span>}

      <button onClick={() => setOpen((v) => !v)} disabled={busy} className="text-[11px] text-foreground-400 hover:text-foreground-700 cursor-pointer disabled:opacity-50" title="Report or verify this posting">
        <i className="ri-flag-line"></i>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 z-20 w-44 rounded-lg bg-background-50 border border-background-200 shadow-lg overflow-hidden text-sm">
            <button onClick={() => report("legit")} className="w-full text-left px-3 py-2 hover:bg-background-100 cursor-pointer flex items-center gap-2 text-foreground-800"><i className="ri-checkbox-circle-line text-primary-600"></i> Looks legit</button>
            <button onClick={() => report("dubious")} className="w-full text-left px-3 py-2 hover:bg-background-100 cursor-pointer flex items-center gap-2 text-foreground-800"><i className="ri-error-warning-line text-secondary-700"></i> Seems dubious</button>
            <button onClick={() => report("scam")} className="w-full text-left px-3 py-2 hover:bg-background-100 cursor-pointer flex items-center gap-2 text-foreground-800"><i className="ri-alarm-warning-line text-accent-700"></i> Report as scam</button>
            <button onClick={verify} className="w-full text-left px-3 py-2 hover:bg-background-100 cursor-pointer flex items-center gap-2 text-foreground-800 border-t border-background-200"><i className="ri-shield-check-line text-primary-600"></i> Verify with employer</button>
          </div>
        </>
      )}
    </div>
  );
}
