import { useEffect, useRef, useState } from "react";
import { api, apiUpload, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import type { Resume } from "@/lib/backend";
import ImportFromLinkedIn from "@/pages/dashboard/components/ImportFromLinkedIn";

interface JobPreferences {
  seniority: string | null;
  target_roles: string[];
  remote_ok: boolean;
  salary_range: { currency: string; minimum: number | null; maximum: number | null };
}
interface UserProfile {
  headline: string;
  summary: string;
  skills: string[];
  preferences: JobPreferences;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-foreground-600 mb-1.5">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400" />
    </label>
  );
}

const SENIORITY = ["", "junior", "mid", "senior", "lead", "staff", "principal", "director"];

export default function Settings() {
  const { user } = useAuth();
  const profile = useApi<UserProfile>("/api/v1/users/me/profile");
  const resumes = useApi<Resume[]>("/api/v1/resumes");
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [skills, setSkills] = useState("");
  const [roles, setRoles] = useState("");
  const [seniority, setSeniority] = useState("");
  const [remoteOk, setRemoteOk] = useState(true);
  const [salMin, setSalMin] = useState("");
  const [salMax, setSalMax] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setHeadline(p.headline);
    setSummary(p.summary);
    setSkills(p.skills.join(", "));
    setRoles(p.preferences.target_roles.join(", "));
    setSeniority(p.preferences.seniority ?? "");
    setRemoteOk(p.preferences.remote_ok);
    setSalMin(p.preferences.salary_range.minimum?.toString() ?? "");
    setSalMax(p.preferences.salary_range.maximum?.toString() ?? "");
  }, [profile.data]);

  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  async function save() {
    setBusy(true);
    try {
      await api("/api/v1/users/me", { method: "PUT", body: { headline, summary, skills: list(skills) } });
      await api("/api/v1/users/me/preferences", {
        method: "PUT",
        body: {
          seniority: seniority || null,
          target_roles: list(roles),
          remote_ok: remoteOk,
          salary_range: { currency: "USD", minimum: salMin ? Number(salMin) : null, maximum: salMax ? Number(salMax) : null },
        },
      });
      toast.push("Profile saved. Matches will re-rank against it.", "success");
      profile.reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Save failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await apiUpload("/api/v1/resumes/upload", form);
      toast.push(`Uploaded ${file.name}.`, "success");
      resumes.reload();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Upload failed.", "error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <section className="animate-fade-in-up">
        <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">Settings</h1>
        <p className="text-sm text-foreground-600 mt-1">Your profile drives job matching and generated documents.</p>
      </section>

      <section className="rounded-2xl bg-background-100/60 border border-background-200 p-5 md:p-6 animate-fade-in-up">
        <h2 className="font-heading text-lg font-medium text-foreground-950 mb-4">Account</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name" value={user?.full_name ?? ""} onChange={() => {}} />
          <Field label="Email" value={user?.email ?? ""} onChange={() => {}} />
        </div>
      </section>

      <ImportFromLinkedIn onApplied={() => profile.reload()} />

      <section className="rounded-2xl bg-background-100/60 border border-background-200 p-5 md:p-6 animate-fade-in-up">
        <h2 className="font-heading text-lg font-medium text-foreground-950 mb-4">Profile</h2>
        <div className="space-y-4">
          <Field label="Headline" value={headline} onChange={setHeadline} />
          <label className="block">
            <span className="block text-xs font-medium text-foreground-600 mb-1.5">Summary</span>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-foreground-600 mb-1.5">Skills (comma-separated)</span>
            <textarea value={skills} onChange={(e) => setSkills(e.target.value)} rows={2} placeholder="Figma, Design systems, Prototyping" className="w-full px-3 py-2 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </label>
        </div>
      </section>

      <section className="rounded-2xl bg-background-100/60 border border-background-200 p-5 md:p-6 animate-fade-in-up">
        <h2 className="font-heading text-lg font-medium text-foreground-950 mb-4">Job preferences</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Target roles (comma-separated)" value={roles} onChange={setRoles} />
          <label className="block">
            <span className="block text-xs font-medium text-foreground-600 mb-1.5">Seniority</span>
            <select value={seniority} onChange={(e) => setSeniority(e.target.value)} className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
              {SENIORITY.map((s) => (
                <option key={s} value={s}>{s || "Any"}</option>
              ))}
            </select>
          </label>
          <Field label="Salary min (USD)" value={salMin} onChange={setSalMin} type="number" />
          <Field label="Salary max (USD)" value={salMax} onChange={setSalMax} type="number" />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-foreground-700 cursor-pointer mt-4">
          <input type="checkbox" checked={remoteOk} onChange={(e) => setRemoteOk(e.target.checked)} className="w-4 h-4 rounded border-background-300 accent-primary-500 cursor-pointer" />
          Open to remote roles
        </label>
      </section>

      <section className="rounded-2xl bg-background-100/60 border border-background-200 p-5 md:p-6 animate-fade-in-up">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-medium text-foreground-950">Résumé</h2>
          <input ref={fileInput} type="file" accept=".pdf,.doc,.docx,.md,.txt" onChange={onUpload} className="hidden" />
          <button onClick={() => fileInput.current?.click()} disabled={uploading} className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer disabled:opacity-60">
            {uploading ? "Uploading…" : "⬆ Upload résumé"}
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {(resumes.data ?? []).map((r) => (
            <div key={r.id} className="flex items-center gap-3 text-sm text-foreground-700 border border-background-200 rounded-lg px-3 py-2 bg-background-50">
              <i className={r.source === "uploaded" ? "ri-upload-2-line" : "ri-sparkling-line"}></i>
              <span className="truncate">{r.source === "uploaded" ? r.original_filename : `${r.target_role || "Résumé"} (v${r.version})`}</span>
              {r.ats_score != null && <span className="ml-auto text-xs text-foreground-500">ATS {r.ats_score}%</span>}
            </div>
          ))}
          {(resumes.data ?? []).length === 0 && <p className="text-sm text-foreground-500">No résumés yet — upload one, or generate from a match.</p>}
        </div>
      </section>

      <div className="flex justify-end animate-fade-in-up">
        <button onClick={save} disabled={busy} className="h-11 px-6 inline-flex items-center justify-center text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 rounded-md hover:bg-primary-600 transition-colors cursor-pointer disabled:opacity-60">
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
