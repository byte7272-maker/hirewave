import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  getReminderPrefs,
  pushSubscribe,
  pushUnsubscribe,
  sendTestReminder,
  updateReminderPrefs,
  type ReminderPrefs,
} from "@/lib/notifications";
import { useBrandName } from "@/hooks/useBranding";

const TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function Toggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-foreground-900">{label}</div>
        <div className="text-xs text-foreground-500 mt-0.5">{desc}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0 ${
          checked ? "bg-primary-500" : "bg-background-300"
        }`}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background-50 transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        ></span>
      </button>
    </div>
  );
}

export default function Reminders() {
  const brandName = useBrandName();
  const [prefs, setPrefs] = useState<ReminderPrefs>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pushActive, setPushActive] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const p = await getReminderPrefs();
      setPrefs(p ?? {});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load reminder preferences.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function set<K extends keyof ReminderPrefs>(key: K, value: ReminderPrefs[K]) {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await updateReminderPrefs(prefs);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save preferences.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePush() {
    setPushBusy(true);
    setError("");
    try {
      if (pushActive) {
        await pushUnsubscribe();
        setPushActive(false);
      } else {
        await pushSubscribe();
        setPushActive(true);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update push subscription.");
    } finally {
      setPushBusy(false);
    }
  }

  async function test() {
    setTestSending(true);
    setTestResult("");
    setError("");
    try {
      await sendTestReminder();
      setTestResult("Test reminder sent. Check your selected channels.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send a test reminder.");
    } finally {
      setTestSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">
            Reminders &amp; notifications
          </h1>
          <p className="text-sm text-foreground-600 mt-1">
            Choose how and when {brandName} keeps you in the loop.
          </p>
        </div>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-900 bg-primary-100 px-3 py-1.5 rounded-full">
            <i className="ri-check-line"></i>
            Saved
          </span>
        )}
      </section>

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm animate-fade-in-up">
          <i className="ri-error-warning-line text-base mt-0.5"></i>
          <div className="flex-1">{error}</div>
          <button
            onClick={load}
            className="inline-flex items-center gap-1 text-sm font-semibold hover:text-accent-900/80 cursor-pointer whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-14 text-sm text-foreground-500 flex items-center justify-center gap-2">
          <i className="ri-loader-4-line animate-spin"></i>
          Loading preferences…
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden animate-fade-in-up">
              <div className="px-5 py-4 border-b border-background-200">
                <h2 className="font-heading text-lg font-medium text-foreground-950">
                  Delivery channels
                </h2>
                <p className="text-xs text-foreground-500 mt-0.5">
                  Pick where your reminders land
                </p>
              </div>
              <div className="p-5 space-y-4">
                <Toggle
                  label="In-app"
                  desc="Notifications in the bell menu"
                  checked={prefs.in_app !== false}
                  onChange={(v) => set("in_app", v)}
                />
                <Toggle
                  label="Email"
                  desc="Reminders sent to your inbox"
                  checked={prefs.email !== false}
                  onChange={(v) => set("email", v)}
                />
                <Toggle
                  label="SMS"
                  desc="Text messages for time-sensitive reminders"
                  checked={prefs.sms === true}
                  onChange={(v) => set("sms", v)}
                />
                <Toggle
                  label="Push"
                  desc="Browser push notifications on this device"
                  checked={prefs.push === true}
                  onChange={(v) => set("push", v)}
                />
              </div>
            </section>

            <section
              className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden animate-fade-in-up"
              style={{ animationDelay: "0.06s" }}
            >
              <div className="px-5 py-4 border-b border-background-200">
                <h2 className="font-heading text-lg font-medium text-foreground-950">
                  Quiet hours
                </h2>
                <p className="text-xs text-foreground-500 mt-0.5">
                  No reminders will be sent during this window
                </p>
              </div>
              <div className="p-5 grid sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                    Start
                  </span>
                  <input
                    type="time"
                    value={prefs.quiet_hours_start ?? "22:00"}
                    onChange={(e) => set("quiet_hours_start", e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                    End
                  </span>
                  <input
                    type="time"
                    value={prefs.quiet_hours_end ?? "08:00"}
                    onChange={(e) => set("quiet_hours_end", e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                    Timezone
                  </span>
                  <select
                    value={prefs.timezone ?? "America/New_York"}
                    onChange={(e) => set("timezone", e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 cursor-pointer"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section
              className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden animate-fade-in-up"
              style={{ animationDelay: "0.12s" }}
            >
              <div className="px-5 py-4 border-b border-background-200">
                <h2 className="font-heading text-lg font-medium text-foreground-950">
                  Digest &amp; alerts
                </h2>
                <p className="text-xs text-foreground-500 mt-0.5">
                  Your daily summary and application alerts
                </p>
              </div>
              <div className="p-5 space-y-4">
                <label className="block">
                  <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                    Daily digest time
                  </span>
                  <select
                    value={(prefs.daily_digest_hour ?? 9).toString()}
                    onChange={(e) => set("daily_digest_hour", Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 cursor-pointer"
                  >
                    {Array.from({ length: 24 }, (_, i) => {
                      const hour = i % 12 === 0 ? 12 : i % 12;
                      const suffix = i < 12 ? "AM" : "PM";
                      return (
                        <option key={i} value={i}>
                          {hour}:00 {suffix}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <Toggle
                  label="Notify on apply"
                  desc="Alert me each time an application is submitted"
                  checked={prefs.notify_on_apply !== false}
                  onChange={(v) => set("notify_on_apply", v)}
                />
              </div>
            </section>

            <div className="animate-fade-in-up" style={{ animationDelay: "0.18s" }}>
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                {saving ? (
                  <i className="ri-loader-4-line animate-spin"></i>
                ) : (
                  <i className="ri-save-line"></i>
                )}
                Save preferences
              </button>
            </div>
          </div>

          <aside className="space-y-6 animate-fade-in-up" style={{ animationDelay: "0.06s" }}>
            <section className="rounded-2xl bg-background-100/60 border border-background-200 p-5">
              <h3 className="text-sm font-semibold text-foreground-950">SMS number</h3>
              <p className="text-sm text-foreground-600 mt-1">
                Used for text reminders when SMS is on.
              </p>
              <label className="block mt-3">
                <input
                  type="tel"
                  value={prefs.phone ?? ""}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="+1 555 000 0000"
                  className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
                />
              </label>
            </section>

            <section className="rounded-2xl bg-background-100/60 border border-background-200 p-5">
              <h3 className="text-sm font-semibold text-foreground-950">Web push</h3>
              <p className="text-sm text-foreground-600 mt-1">
                Manage the push subscription for this browser.
              </p>
              <button
                onClick={togglePush}
                disabled={pushBusy}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground-700 bg-background-100 border border-background-300 px-4 py-2 rounded-md hover:bg-background-200 cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                {pushBusy ? (
                  <i className="ri-loader-4-line animate-spin"></i>
                ) : pushActive ? (
                  <i className="ri-notification-off-line"></i>
                ) : (
                  <i className="ri-notification-3-line"></i>
                )}
                {pushActive ? "Disable push" : "Enable push"}
              </button>
            </section>

            <section className="rounded-2xl bg-background-100/60 border border-background-200 p-5">
              <h3 className="text-sm font-semibold text-foreground-950">Test it out</h3>
              <p className="text-sm text-foreground-600 mt-1">
                Send a sample reminder to confirm your channels work.
              </p>
              <button
                onClick={test}
                disabled={testSending}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                {testSending ? (
                  <i className="ri-loader-4-line animate-spin"></i>
                ) : (
                  <i className="ri-send-plane-line"></i>
                )}
                Send test reminder
              </button>
              {testResult && (
                <p className="text-xs text-primary-900 bg-primary-100 rounded-lg px-3 py-2 mt-3">
                  {testResult}
                </p>
              )}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}