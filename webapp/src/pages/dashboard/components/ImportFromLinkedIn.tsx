import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { importLinkedIn, importLinkedInFile, applyLinkedIn, type LinkedInImport, type ImportedProfile } from "@/lib/linkedin";

/** Import profile data from LinkedIn (connected account or a data export),
 *  shown as a reviewable draft. Each field can be individually accepted before
 *  applying — what you keep is exactly what's saved. */
export default function ImportFromLinkedIn({ onApplied }: { onApplied: () => void }) {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [preview, setPreview] = useState<LinkedInImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  // field-level selection (defaults to everything, reset whenever a draft loads)
  const [pickHeadline, setPickHeadline] = useState(true);
  const [pickSummary, setPickSummary] = useState(true);
  const [selSkills, setSelSkills] = useState<Set<string>>(new Set());
  const [selExp, setSelExp] = useState<Set<number>>(new Set());
  const [selEdu, setSelEdu] = useState<Set<number>>(new Set());

  useEffect(() => {
    const p = preview?.profile;
    if (!p) return;
    setPickHeadline(true); setPickSummary(true);
    setSelSkills(new Set(p.skills));
    setSelExp(new Set(p.work_experience.map((_, i) => i)));
    setSelEdu(new Set(p.education.map((_, i) => i)));
  }, [preview]);

  async function fromAccount() {
    setBusy(true);
    try {
      setPreview(await importLinkedIn(false));
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Import failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  // Auto-open when arriving from the Integrations "Import profile" action.
  useEffect(() => {
    if (params.get("import") === "linkedin") {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      fromAccount();
      params.delete("import");
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      setPreview(await importLinkedInFile(f, false));
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Couldn't read that file.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    const p = preview?.profile;
    if (!p) return;
    const body: Partial<ImportedProfile> = {};
    if (pickHeadline && p.headline) body.headline = p.headline;
    if (pickSummary && p.summary) body.summary = p.summary;
    const skills = p.skills.filter((s) => selSkills.has(s));
    if (skills.length) body.skills = skills;
    const exp = p.work_experience.filter((_, i) => selExp.has(i));
    if (exp.length) body.work_experience = exp;
    const edu = p.education.filter((_, i) => selEdu.has(i));
    if (edu.length) body.education = edu;

    if (!Object.keys(body).length) { toast.push("Pick at least one field to import.", "error"); return; }
    setApplying(true);
    try {
      await applyLinkedIn(body);
      toast.push("Profile updated from LinkedIn. Your preferences were kept.", "success");
      setPreview(null);
      onApplied();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Couldn't apply.", "error");
    } finally {
      setApplying(false);
    }
  }

  const toggle = <T,>(set: Set<T>, key: T, setter: (s: Set<T>) => void) => {
    const n = new Set(set); n.has(key) ? n.delete(key) : n.add(key); setter(n);
  };

  const p = preview?.profile;
  const selectedCount = (pickHeadline && p?.headline ? 1 : 0) + (pickSummary && p?.summary ? 1 : 0) + selSkills.size + selExp.size + selEdu.size;

  return (
    <section ref={sectionRef} className="rounded-2xl bg-background-100/60 border border-background-200 p-5 md:p-6 animate-fade-in-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-heading text-lg font-medium text-foreground-950 flex items-center gap-2">
            <i className="ri-linkedin-box-fill text-[#0a66c2]"></i> Import from LinkedIn
          </h2>
          <p className="text-xs text-foreground-500 mt-1 max-w-xl">
            Pull your headline, summary, skills, experience and education. Review a draft and tick exactly what to keep — nothing is saved until you apply, and your job preferences stay intact.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInput} type="file" accept=".pdf,.doc,.docx,.md,.txt" onChange={onFile} className="hidden" />
          <button onClick={() => fileInput.current?.click()} disabled={busy} className="text-sm font-medium bg-background-50 border border-background-200 text-foreground-700 px-3 py-2 rounded-md hover:bg-background-100 cursor-pointer disabled:opacity-60">
            Upload export
          </button>
          <button onClick={fromAccount} disabled={busy} className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 cursor-pointer disabled:opacity-60">
            <i className="ri-download-2-line"></i>{busy ? "Importing…" : "Import"}
          </button>
        </div>
      </div>

      {p && (
        <div className="mt-5 rounded-xl bg-background-50 border border-background-200 p-4 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs font-semibold text-foreground-700">
              Draft from {preview.source === "export" ? "your export file" : "LinkedIn"} — tick what to keep ({selectedCount} selected)
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPreview(null)} className="text-xs text-foreground-500 hover:text-foreground-800 cursor-pointer px-2">Discard</button>
              <button onClick={apply} disabled={applying || selectedCount === 0} className="text-sm font-semibold bg-accent-600 text-white px-4 py-2 rounded-md hover:bg-accent-700 cursor-pointer disabled:opacity-60">
                {applying ? "Applying…" : `Apply ${selectedCount} field${selectedCount === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>

          {p.headline && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={pickHeadline} onChange={() => setPickHeadline((v) => !v)} className="mt-1 w-4 h-4 rounded border-background-300 accent-primary-500 cursor-pointer" />
              <span><span className="block text-[11px] uppercase tracking-wide text-foreground-400">Headline</span><span className="text-sm text-foreground-900">{p.headline}</span></span>
            </label>
          )}
          {p.summary && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={pickSummary} onChange={() => setPickSummary((v) => !v)} className="mt-1 w-4 h-4 rounded border-background-300 accent-primary-500 cursor-pointer" />
              <span><span className="block text-[11px] uppercase tracking-wide text-foreground-400">Summary</span><span className="text-sm text-foreground-700">{p.summary}</span></span>
            </label>
          )}
          {p.skills.length > 0 && (
            <div>
              <span className="text-[11px] uppercase tracking-wide text-foreground-400">Skills — tap to toggle</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {p.skills.map((s) => {
                  const on = selSkills.has(s);
                  return (
                    <button key={s} onClick={() => toggle(selSkills, s, setSelSkills)} className={`text-[11px] px-2 py-0.5 rounded-full cursor-pointer transition-colors ${on ? "bg-primary-500 text-background-50 dark:text-foreground-950" : "bg-background-200 text-foreground-400 line-through"}`}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {p.work_experience.length > 0 && (
            <div>
              <span className="text-[11px] uppercase tracking-wide text-foreground-400">Experience</span>
              <div className="mt-1 space-y-1.5">
                {p.work_experience.map((e, i) => (
                  <label key={i} className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={selExp.has(i)} onChange={() => toggle(selExp, i, setSelExp)} className="mt-1 w-4 h-4 rounded border-background-300 accent-primary-500 cursor-pointer" />
                    <span className="text-sm">
                      <span className="text-foreground-900 font-medium">{e.title}</span>
                      {e.company && <span className="text-foreground-600"> · {e.company}</span>}
                      {(e.start || e.end) && <span className="text-foreground-400 text-xs"> ({e.start ?? "?"}–{e.end ?? "present"})</span>}
                      {e.summary && <span className="block text-xs text-foreground-500">{e.summary}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {p.education.length > 0 && (
            <div>
              <span className="text-[11px] uppercase tracking-wide text-foreground-400">Education</span>
              <div className="mt-1 space-y-1">
                {p.education.map((e, i) => (
                  <label key={i} className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={selEdu.has(i)} onChange={() => toggle(selEdu, i, setSelEdu)} className="mt-1 w-4 h-4 rounded border-background-300 accent-primary-500 cursor-pointer" />
                    <span className="text-sm text-foreground-800">
                      {e.institution}{e.degree ? ` — ${e.degree}` : ""}{e.field_of_study ? `, ${e.field_of_study}` : ""}{e.graduation_year ? ` (${e.graduation_year})` : ""}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {!p.headline && !p.summary && p.skills.length === 0 && p.work_experience.length === 0 && p.education.length === 0 && (
            <p className="text-sm text-foreground-500">Couldn't find structured fields to import from this source.</p>
          )}
        </div>
      )}
    </section>
  );
}
