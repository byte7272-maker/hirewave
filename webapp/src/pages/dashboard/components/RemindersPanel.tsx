import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/lib/toast";
import {
  getReminderPrefs, updateReminderPrefs, testReminder, enablePush, disablePush, pushSupported,
  type ReminderPrefs,
} from "@/lib/reminders";

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button onClick={onChange} disabled={disabled} role="switch" aria-checked={on}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 cursor-pointer disabled:opacity-40 ${on ? "bg-primary-500" : "bg-background-300"}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`}></span>
    </button>
  );
}

export default function RemindersPanel() {
  const toast = useToast();
  const [prefs, setPrefs] = useState<ReminderPrefs | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(() => {
    getReminderPrefs().then((p) => {
      setPrefs(p); setPhone(p.phone);
      // Sync the browser's timezone so quiet hours / digest use the user's local
      // clock (the server can't know it otherwise).
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && tz !== p.timezone) updateReminderPrefs({ timezone: tz }).then(setPrefs).catch(() => {});
    }).catch(() => {});
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function patch(field: keyof ReminderPrefs, value: boolean | number) {
    if (!prefs) return;
    setBusy(field);
    try { setPrefs(await updateReminderPrefs({ [field]: value } as Record<string, unknown>)); }
    catch { toast.push("Couldn't update.", "error"); }
    finally { setBusy(null); }
  }
  const hour = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;
  const HourSelect = ({ field }: { field: "quiet_start" | "quiet_end" | "digest_hour" }) => (
    <select value={prefs![field]} onChange={(e) => patch(field, Number(e.target.value))} disabled={busy === field}
      className="text-sm rounded-md bg-background-50 border border-background-200 px-2 py-1 text-foreground-900">
      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hour(h)}</option>)}
    </select>
  );

  async function savePhone() {
    setBusy("phone");
    try { setPrefs(await updateReminderPrefs({ phone: phone.trim() })); toast.push("Phone saved.", "success"); }
    catch { toast.push("Couldn't save phone.", "error"); }
    finally { setBusy(null); }
  }

  async function togglePush() {
    if (!prefs) return;
    setBusy("push");
    try {
      if (prefs.push_enabled) { const p = await disablePush(); if (p) setPrefs(p); toast.push("Push disabled.", "info"); }
      else { setPrefs(await enablePush(prefs.vapid_public_key)); toast.push("Push notifications enabled.", "success"); }
    } catch (e) { toast.push(e instanceof Error ? e.message : "Couldn't change push.", "error"); }
    finally { setBusy(null); }
  }

  async function sendTest() {
    setBusy("test");
    try {
      const { channels } = await testReminder();
      const names = Object.keys(channels);
      toast.push(names.length ? `Test sent via ${names.join(", ")}.` : "No channels enabled to send a test.", names.length ? "success" : "info");
    } catch { toast.push("Couldn't send test.", "error"); }
    finally { setBusy(null); }
  }

  if (!prefs) return null;
  const pushAvailable = pushSupported() && !!prefs.vapid_public_key;

  const Row = ({ label, hint, field, extra }: { label: string; hint: string; field: keyof ReminderPrefs; extra?: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-4 rounded-xl bg-background-50 border border-background-200 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm text-foreground-800">{label}</p>
        <p className="text-xs text-foreground-500 mt-0.5">{hint}</p>
        {extra}
      </div>
      <Toggle on={prefs[field] as boolean} onChange={() => patch(field, !(prefs[field] as boolean))} disabled={busy === field} />
    </div>
  );

  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-200 p-5 animate-fade-in-up space-y-4">
      <div>
        <h2 className="font-heading text-lg font-medium text-foreground-950">Reminders</h2>
        <p className="text-xs text-foreground-500 mt-1">
          Every ~3½ days we ask you to review &amp; renew your automation. Get that nudge here even when the app is closed.
        </p>
      </div>

      <div className="space-y-3">
        <Row label="In-app" hint="A notification inside Hirewave." field="inapp_enabled" />
        <Row label="Email" hint="Sent to your account email." field="email_enabled" />
        <Row
          label="Text message (SMS)" hint="Requires a phone number." field="sms_enabled"
          extra={
            <div className="flex items-center gap-2 mt-2">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15551234567"
                className="text-sm rounded-md bg-background-50 border border-background-200 px-2 py-1 w-44 text-foreground-900 placeholder:text-foreground-400" />
              <button onClick={savePhone} disabled={busy === "phone" || phone.trim() === prefs.phone}
                className="text-xs font-medium border border-background-300 rounded-md px-2.5 py-1 hover:bg-background-100 cursor-pointer disabled:opacity-40">Save</button>
            </div>
          }
        />
        {/* Push is a button (browser permission flow), not a plain toggle. */}
        <div className="flex items-start justify-between gap-4 rounded-xl bg-background-50 border border-background-200 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm text-foreground-800">Push notifications</p>
            <p className="text-xs text-foreground-500 mt-0.5">
              {pushAvailable ? "System notifications on this device." : "Not available (needs a supported browser + server VAPID keys)."}
            </p>
            {prefs.push_subscription_count > 0 && <p className="text-[11px] text-foreground-400 mt-0.5">{prefs.push_subscription_count} device(s) subscribed</p>}
          </div>
          <button onClick={togglePush} disabled={!pushAvailable || busy === "push"}
            className={`text-xs font-semibold rounded-md px-3 py-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap ${prefs.push_enabled ? "border border-background-300 hover:bg-background-100" : "bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600"}`}>
            {busy === "push" ? "…" : prefs.push_enabled ? "Disable" : "Enable"}
          </button>
        </div>
      </div>

      {/* what to send */}
      <div className="space-y-3 pt-1 border-t border-background-200">
        <Row label="Notify me when the assistant applies" hint="Get a message each time auto-apply submits on your behalf." field="notify_on_apply" />

        {/* quiet hours */}
        <div className="rounded-xl bg-background-50 border border-background-200 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-foreground-800">Quiet hours</p>
              <p className="text-xs text-foreground-500 mt-0.5">No texts or push in this window ({prefs.timezone}). Email &amp; in-app still arrive.</p>
            </div>
            <Toggle on={prefs.quiet_hours_enabled} onChange={() => patch("quiet_hours_enabled", !prefs.quiet_hours_enabled)} disabled={busy === "quiet_hours_enabled"} />
          </div>
          {prefs.quiet_hours_enabled && (
            <div className="flex items-center gap-2 text-sm text-foreground-600">
              <span>From</span><HourSelect field="quiet_start" /><span>to</span><HourSelect field="quiet_end" />
            </div>
          )}
        </div>

        {/* daily digest */}
        <div className="rounded-xl bg-background-50 border border-background-200 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-foreground-800">Daily digest</p>
              <p className="text-xs text-foreground-500 mt-0.5">One summary a day of applies, your queue, and review status.</p>
            </div>
            <Toggle on={prefs.digest_enabled} onChange={() => patch("digest_enabled", !prefs.digest_enabled)} disabled={busy === "digest_enabled"} />
          </div>
          {prefs.digest_enabled && (
            <div className="flex items-center gap-2 text-sm text-foreground-600">
              <span>Send at</span><HourSelect field="digest_hour" />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-foreground-500">{prefs.review_due ? "A review is due now." : "Session review is up to date."}</p>
        <button onClick={sendTest} disabled={busy === "test"}
          className="text-xs font-medium border border-background-300 rounded-md px-3 py-1.5 hover:bg-background-100 cursor-pointer disabled:opacity-60">
          {busy === "test" ? "Sending…" : "Send a test reminder"}
        </button>
      </div>
    </section>
  );
}
