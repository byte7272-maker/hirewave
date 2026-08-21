"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/Toast";
import { PageHeader } from "@/components/ui";
import type { UserProfile } from "@/lib/types";

export default function ProfilePage() {
  const profile = useApi<UserProfile>("/api/v1/users/me/profile");
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [skills, setSkills] = useState("");
  const [seniority, setSeniority] = useState("");
  const [targetRoles, setTargetRoles] = useState("");
  const [remoteOk, setRemoteOk] = useState(true);
  const [salMin, setSalMin] = useState("");
  const [salMax, setSalMax] = useState("");

  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setHeadline(p.headline);
    setSummary(p.summary);
    setSkills(p.skills.join(", "));
    setSeniority(p.preferences.seniority ?? "");
    setTargetRoles(p.preferences.target_roles.join(", "));
    setRemoteOk(p.preferences.remote_ok);
    setSalMin(p.preferences.salary_range.minimum?.toString() ?? "");
    setSalMax(p.preferences.salary_range.maximum?.toString() ?? "");
  }, [profile.data]);

  const list = (s: string) =>
    s.split(",").map((x) => x.trim()).filter(Boolean);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/v1/users/me", {
        method: "PUT",
        body: { headline, summary, skills: list(skills) },
      });
      await api("/api/v1/users/me/preferences", {
        method: "PUT",
        body: {
          seniority: seniority || null,
          target_roles: list(targetRoles),
          remote_ok: remoteOk,
          salary_range: {
            currency: "USD",
            minimum: salMin ? Number(salMin) : null,
            maximum: salMax ? Number(salMax) : null,
          },
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

  if (profile.loading) return <span className="spinner" />;

  return (
    <>
      <PageHeader title="Profile & Preferences" subtitle="This drives your matches and generated documents." />
      <form onSubmit={save} className="grid cols-2">
        <div className="card stack">
          <h2>Profile</h2>
          <div className="field">
            <label htmlFor="headline">Headline</label>
            <input id="headline" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Senior Backend Engineer" />
          </div>
          <div className="field">
            <label htmlFor="summary">Summary</label>
            <textarea id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="skills">Skills (comma-separated)</label>
            <textarea id="skills" style={{ minHeight: 80 }} value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Python, FastAPI, AWS" />
          </div>
        </div>

        <div className="card stack">
          <h2>Job preferences</h2>
          <div className="field">
            <label htmlFor="roles">Target roles (comma-separated)</label>
            <input id="roles" value={targetRoles} onChange={(e) => setTargetRoles(e.target.value)} placeholder="Backend Engineer, Platform Engineer" />
          </div>
          <div className="field">
            <label htmlFor="seniority">Seniority</label>
            <select id="seniority" value={seniority} onChange={(e) => setSeniority(e.target.value)}>
              <option value="">Any</option>
              {["junior", "mid", "senior", "lead", "staff", "principal", "director"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="min">Salary min (USD)</label>
              <input id="min" type="number" value={salMin} onChange={(e) => setSalMin(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="max">Salary max (USD)</label>
              <input id="max" type="number" value={salMax} onChange={(e) => setSalMax(e.target.value)} />
            </div>
          </div>
          <label className="row" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={remoteOk}
              onChange={(e) => setRemoteOk(e.target.checked)}
              style={{ width: "auto" }}
            />
            Open to remote roles
          </label>
        </div>

        <div className="row" style={{ gridColumn: "1 / -1" }}>
          <button className="btn primary" disabled={busy}>
            {busy ? <span className="spinner" /> : "Save changes"}
          </button>
        </div>
      </form>
    </>
  );
}
