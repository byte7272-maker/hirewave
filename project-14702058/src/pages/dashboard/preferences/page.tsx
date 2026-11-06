import { useEffect, useState, type FormEvent } from "react";
import { getPreferences, updatePreferences } from "@/lib/profile";
import { ApiError } from "@/lib/api";
import TagInput from "@/components/base/TagInput";
import { useNarration } from "@/components/feature/NarrationProvider";
import { useBrandName } from "@/hooks/useBranding";
import { formatRate, MAX_RATE, MIN_RATE } from "@/lib/narration";

const inputCls =
  "w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300";

const JOB_TYPES = ["Full-time", "Part-time", "Contract", "Internship"];
const SENIORITIES = [
  "Entry level",
  "Junior",
  "Mid-level",
  "Senior",
  "Lead",
  "Staff",
  "Director",
  "Executive",
];

export default function Preferences() {
  const brandName = useBrandName();
  const [jobType, setJobType] = useState("");
  const [salaryRange, setSalaryRange] = useState("");
  const [remoteOk, setRemoteOk] = useState(false);
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [targetLocations, setTargetLocations] = useState<string[]>([]);
  const [seniority, setSeniority] = useState("");
  const [weeklyGoalTarget, setWeeklyGoalTarget] = useState(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const {
    voices,
    voiceId,
    setVoiceId,
    serverTts,
    rate,
    setRate,
    autoRead,
    setAutoRead,
    activeId,
    toggle,
    ensureLoaded,
  } = useNarration();

  const previewId = "preferences-voice-preview";
  const previewText =
    "This is how your summaries will sound. Adjust the voice and speed until it feels right.";
  const previewing = activeId === previewId;

  async function load() {
    setLoading(true);
    setError("");
    try {
      const p = await getPreferences();
      setJobType(p.job_type ?? "");
      setSalaryRange(p.salary_range ?? "");
      setRemoteOk(Boolean(p.remote_ok));
      setTargetRoles(p.target_roles ?? []);
      setTargetLocations(p.target_locations ?? []);
      setSeniority(p.seniority ?? "");
      setWeeklyGoalTarget(p.weekly_goal_target ?? 30);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your preferences.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await updatePreferences({
        job_type: jobType,
        salary_range: salaryRange,
        remote_ok: remoteOk,
        target_roles: targetRoles,
        target_locations: targetLocations,
        seniority,
        weekly_goal_target: weeklyGoalTarget,
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save preferences.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">
            Preferences
          </h1>
          <p className="text-sm text-foreground-600 mt-1">
            Tune your job matching and how {brandName} reads summaries aloud.
          </p>
        </div>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-900 bg-primary-100 px-3 py-1.5 rounded-full">
            <i className="ri-check-line"></i>
            Saved
          </span>
        )}
      </section>

      <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden animate-fade-in-up" style={{ animationDelay: "0.04s" }}>
        {loading ? (
          <div className="p-6 text-sm text-foreground-500 flex items-center gap-2">
            <i className="ri-loader-4-line animate-spin"></i>
            Loading…
          </div>
        ) : (
          <form onSubmit={handleSave} className="p-5 md:p-6 space-y-6">
            <div className="grid sm:grid-cols-2 gap-5">
              <label className="block">
                <span className="block text-xs font-medium text-foreground-600 mb-1.5">Job type</span>
                <select
                  value={jobType}
                  onChange={(e) => setJobType(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Any type</option>
                  {JOB_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="block text-xs font-medium text-foreground-600 mb-1.5">Seniority</span>
                <select
                  value={seniority}
                  onChange={(e) => setSeniority(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Any seniority</option>
                  {SENIORITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block max-w-sm">
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                Target salary range
              </span>
              <input
                value={salaryRange}
                onChange={(e) => setSalaryRange(e.target.value)}
                className={inputCls}
                placeholder="e.g. $150k – $200k"
              />
            </label>

            <label className="block max-w-sm">
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                Weekly application goal
              </span>
              <input
                type="number"
                min={1}
                max={200}
                value={weeklyGoalTarget}
                onChange={(e) => setWeeklyGoalTarget(Math.max(1, Number(e.target.value) || 1))}
                className={inputCls}
                placeholder="30"
              />
              <p className="text-xs text-foreground-500 mt-1">
                Target applications per week shown on your dashboard.
              </p>
            </label>

            <div className="flex items-start justify-between gap-4 max-w-xl">
              <div>
                <div className="text-sm font-medium text-foreground-900">Remote work</div>
                <div className="text-xs text-foreground-500 mt-0.5">
                  Include fully-remote and remote-friendly roles in your matches.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRemoteOk((v) => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                  remoteOk ? "bg-primary-500" : "bg-background-300"
                }`}
                role="switch"
                aria-checked={remoteOk}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background-50 transition-transform ${
                    remoteOk ? "translate-x-5" : "translate-x-0"
                  }`}
                ></span>
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <TagInput
                label="Target roles"
                tags={targetRoles}
                onChange={setTargetRoles}
                placeholder="e.g. Product Designer"
                hint="Press Enter to add each role."
              />
              <TagInput
                label="Target locations"
                tags={targetLocations}
                onChange={setTargetLocations}
                placeholder="e.g. San Francisco, Remote"
                hint="Press Enter to add each location."
              />
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
                  Save preferences
                </>
              )}
            </button>
          </form>
        )}
      </section>

      <section
        className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden animate-fade-in-up"
        style={{ animationDelay: "0.08s" }}
      >
        <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-heading text-lg font-medium text-foreground-950 flex items-center gap-2">
              <i className="ri-volume-up-line text-primary-600"></i>
              Voice &amp; read-aloud
            </h2>
            <p className="text-xs text-foreground-500 mt-0.5">
              Choose the voice and speed used whenever {brandName} reads a summary aloud.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-600 bg-background-50 border border-background-200 px-2.5 py-1 rounded-full whitespace-nowrap">
            <i className={serverTts ? "ri-sparkling-line text-primary-600" : "ri-cpu-line text-secondary-600"}></i>
            {serverTts ? "Neural voices" : "Device voices"}
          </span>
        </div>

        <div className="p-5 md:p-6 space-y-6">
          <div className="grid sm:grid-cols-2 gap-5">
            <label className="block">
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                Reading voice
              </span>
              {voices.length > 0 ? (
                <select
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                  className={inputCls}
                >
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.kind ? ` · ${v.kind}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div className={`${inputCls} flex items-center text-foreground-500`}>
                  <i className="ri-loader-4-line animate-spin mr-2"></i>
                  Loading voices…
                </div>
              )}
            </label>

            <div className="block">
              <span className="flex items-center justify-between text-xs font-medium text-foreground-600 mb-1.5">
                <span>Speed</span>
                <span className="text-foreground-900 font-semibold">{formatRate(rate)}</span>
              </span>
              <div className="flex items-center gap-3 h-10">
                <span className="text-[11px] text-foreground-400 whitespace-nowrap">Slower</span>
                <input
                  type="range"
                  min={MIN_RATE}
                  max={MAX_RATE}
                  step={0.05}
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                  aria-label="Reading speed"
                  className="flex-1 accent-primary-500 cursor-pointer"
                />
                <span className="text-[11px] text-foreground-400 whitespace-nowrap">Faster</span>
              </div>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 max-w-xl">
            <div>
              <div className="text-sm font-medium text-foreground-900">
                Auto-read new summaries
              </div>
              <div className="text-xs text-foreground-500 mt-0.5">
                Start reading a review summary automatically the moment it finishes generating.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAutoRead(!autoRead)}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                autoRead ? "bg-primary-500" : "bg-background-300"
              }`}
              role="switch"
              aria-checked={autoRead}
              aria-label="Auto-read new summaries"
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background-50 transition-transform ${
                  autoRead ? "translate-x-5" : "translate-x-0"
                }`}
              ></span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => toggle(previewId, previewText)}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-secondary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-secondary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className={previewing ? "ri-stop-circle-line" : "ri-play-line"}></i>
            {previewing ? "Stop preview" : "Preview voice"}
          </button>
        </div>
      </section>
    </div>
  );
}