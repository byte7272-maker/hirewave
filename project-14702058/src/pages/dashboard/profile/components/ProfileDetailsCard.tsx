import { useEffect, useState, type FormEvent } from "react";
import {
  getProfile,
  updateProfile,
  type Education,
  type WorkExperience,
} from "@/lib/profile";
import { ApiError } from "@/lib/api";
import TagInput from "@/components/base/TagInput";

const inputCls =
  "w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300";

const emptyExperience = (): WorkExperience => ({
  company: "",
  title: "",
  start_date: "",
  end_date: "",
  description: "",
});

const emptyEducation = (): Education => ({
  school: "",
  degree: "",
  field: "",
  start_date: "",
  end_date: "",
});

export default function ProfileDetailsCard() {
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [experience, setExperience] = useState<WorkExperience[]>([]);
  const [education, setEducation] = useState<Education[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const p = await getProfile();
      setHeadline(p.headline ?? "");
      setSummary(p.summary ?? "");
      setSkills(p.skills ?? []);
      setExperience(p.work_experience ?? []);
      setEducation(p.education ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function patchExperience(i: number, patch: Partial<WorkExperience>) {
    setExperience((prev) =>
      prev.map((item, idx) => (idx === i ? { ...item, ...patch } : item))
    );
  }

  function patchEducation(i: number, patch: Partial<Education>) {
    setEducation((prev) =>
      prev.map((item, idx) => (idx === i ? { ...item, ...patch } : item))
    );
  }

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await updateProfile({
        headline,
        summary,
        skills,
        work_experience: experience,
        education,
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-medium text-foreground-950">
            Professional profile
          </h2>
          <p className="text-xs text-foreground-500 mt-0.5">
            Your headline, summary, skills, and history
          </p>
        </div>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-900 bg-primary-100 px-3 py-1.5 rounded-full whitespace-nowrap">
            <i className="ri-check-line"></i>
            Saved
          </span>
        )}
      </div>

      {loading ? (
        <div className="p-6 text-sm text-foreground-500 flex items-center gap-2">
          <i className="ri-loader-4-line animate-spin"></i>
          Loading…
        </div>
      ) : (
        <form onSubmit={handleSave} className="p-5 space-y-6">
          <label className="block">
            <span className="block text-xs font-medium text-foreground-600 mb-1.5">Headline</span>
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className={inputCls}
              placeholder="Senior Product Designer"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-foreground-600 mb-1.5">Summary</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={500}
              rows={4}
              className="w-full px-3 py-2.5 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 resize-none"
              placeholder="A short summary of who you are and what you do…"
            />
          </label>

          <TagInput
            label="Skills"
            tags={skills}
            onChange={setSkills}
            placeholder="Type a skill and press Enter"
            hint="Press Enter or comma to add each skill."
          />

          {/* Work experience */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-foreground-600">Work experience</span>
              <button
                type="button"
                onClick={() => setExperience((prev) => [...prev, emptyExperience()])}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
              >
                <i className="ri-add-line"></i>
                Add role
              </button>
            </div>
            <div className="space-y-3">
              {experience.map((exp, i) => (
                <div key={i} className="rounded-xl bg-background-50 border border-background-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground-500">Role {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => setExperience((prev) => prev.filter((_, idx) => idx !== i))}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 hover:bg-background-200 cursor-pointer"
                      aria-label="Remove role"
                    >
                      <i className="ri-delete-bin-line"></i>
                    </button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <input
                      value={exp.title}
                      onChange={(e) => patchExperience(i, { title: e.target.value })}
                      className={inputCls}
                      placeholder="Job title"
                    />
                    <input
                      value={exp.company}
                      onChange={(e) => patchExperience(i, { company: e.target.value })}
                      className={inputCls}
                      placeholder="Company"
                    />
                    <input
                      value={exp.start_date ?? ""}
                      onChange={(e) => patchExperience(i, { start_date: e.target.value })}
                      className={inputCls}
                      placeholder="Start date (e.g. 2021)"
                    />
                    <input
                      value={exp.end_date ?? ""}
                      onChange={(e) => patchExperience(i, { end_date: e.target.value })}
                      className={inputCls}
                      placeholder="End date (e.g. 2024 or Present)"
                    />
                  </div>
                  <textarea
                    value={exp.description ?? ""}
                    onChange={(e) => patchExperience(i, { description: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2.5 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 resize-none"
                    placeholder="What you did and achieved…"
                  />
                </div>
              ))}
              {experience.length === 0 && (
                <p className="text-sm text-foreground-400 py-2">No roles added yet.</p>
              )}
            </div>
          </div>

          {/* Education */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-foreground-600">Education</span>
              <button
                type="button"
                onClick={() => setEducation((prev) => [...prev, emptyEducation()])}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
              >
                <i className="ri-add-line"></i>
                Add education
              </button>
            </div>
            <div className="space-y-3">
              {education.map((edu, i) => (
                <div key={i} className="rounded-xl bg-background-50 border border-background-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground-500">School {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => setEducation((prev) => prev.filter((_, idx) => idx !== i))}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 hover:bg-background-200 cursor-pointer"
                      aria-label="Remove education"
                    >
                      <i className="ri-delete-bin-line"></i>
                    </button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <input
                      value={edu.school}
                      onChange={(e) => patchEducation(i, { school: e.target.value })}
                      className={inputCls}
                      placeholder="School / university"
                    />
                    <input
                      value={edu.degree}
                      onChange={(e) => patchEducation(i, { degree: e.target.value })}
                      className={inputCls}
                      placeholder="Degree"
                    />
                    <input
                      value={edu.field ?? ""}
                      onChange={(e) => patchEducation(i, { field: e.target.value })}
                      className={inputCls}
                      placeholder="Field of study"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        value={edu.start_date ?? ""}
                        onChange={(e) => patchEducation(i, { start_date: e.target.value })}
                        className={inputCls}
                        placeholder="Start"
                      />
                      <input
                        value={edu.end_date ?? ""}
                        onChange={(e) => patchEducation(i, { end_date: e.target.value })}
                        className={inputCls}
                        placeholder="End"
                      />
                    </div>
                  </div>
                </div>
              ))}
              {education.length === 0 && (
                <p className="text-sm text-foreground-400 py-2">No education added yet.</p>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
              <i className="ri-error-warning-line text-base mt-0.5"></i>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
          >
            {saving ? (
              <>
                <i className="ri-loader-4-line animate-spin"></i>
                Saving…
              </>
            ) : (
              <>
                <i className="ri-save-line"></i>
                Save profile
              </>
            )}
          </button>
        </form>
      )}
    </section>
  );
}