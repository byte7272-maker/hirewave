import { useEffect, useState, type FormEvent } from "react";
import { getMe, updateMe } from "@/lib/profile";
import { ApiError } from "@/lib/api";

const inputCls =
  "w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300";

export default function BasicInfoCard() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const me = await getMe();
      setFullName(me.full_name ?? "");
      setEmail(me.email ?? "");
      setLocation(me.location ?? "");
      setPhone(me.phone ?? "");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your account.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await updateMe({ full_name: fullName, location, phone: phone || undefined });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-medium text-foreground-950">
            Account
          </h2>
          <p className="text-xs text-foreground-500 mt-0.5">Your sign-in details and location</p>
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
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <label className="block">
            <span className="block text-xs font-medium text-foreground-600 mb-1.5">Full name</span>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputCls}
              placeholder="Jordan Lee"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-foreground-600 mb-1.5">Email</span>
            <input
              value={email}
              disabled
              className={`${inputCls} opacity-60 cursor-not-allowed`}
            />
            <span className="block text-xs text-foreground-400 mt-1">
              Your email is used to sign in and can&apos;t be changed here.
            </span>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-foreground-600 mb-1.5">Location</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={inputCls}
              placeholder="San Francisco, CA"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-foreground-600 mb-1.5">Phone</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputCls}
              placeholder="+1 555 000 0000"
            />
          </label>

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
                Save changes
              </>
            )}
          </button>
        </form>
      )}
    </section>
  );
}