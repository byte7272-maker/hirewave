import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  getConsent,
  prepareDrafts,
  updateConsent,
  type AssistantFeatureKey,
  type ConsentMap,
} from "@/lib/assistant";

const FEATURES: {
  key: AssistantFeatureKey;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    key: "prepare_drafts",
    label: "Auto-prepare drafts",
    description: "Draft tailored résumés and cover letters for your strongest matches.",
    icon: "ri-file-text-line",
  },
  {
    key: "autofill",
    label: "Auto-fill applications",
    description: "Pre-fill application forms using your profile and documents.",
    icon: "ri-checkbox-multiple-line",
  },
  {
    key: "auto_submit",
    label: "Auto-submit applications",
    description: "Submit filled applications automatically after you approve them.",
    icon: "ri-send-plane-line",
  },
  {
    key: "notifications",
    label: "Assistant notifications",
    description: "Get notified when the assistant acts on your behalf.",
    icon: "ri-notification-3-line",
  },
];

export default function ConsentSettings() {
  const [consent, setConsent] = useState<ConsentMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [prepareMsg, setPrepareMsg] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setConsent((await getConsent()) ?? {});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load permissions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(key: AssistantFeatureKey, next: boolean) {
    const prev = consent;
    setConsent((c) => ({ ...c, [key]: next }));
    try {
      await updateConsent({ [key]: next });
    } catch {
      setConsent(prev);
    }
  }

  async function handlePrepare() {
    setPreparing(true);
    setPrepareMsg("");
    try {
      await prepareDrafts();
      setPrepareMsg("Drafts are being prepared for your strongest matches.");
    } catch (err) {
      setPrepareMsg(
        err instanceof ApiError ? err.message : "Could not prepare drafts."
      );
    } finally {
      setPreparing(false);
    }
  }

  if (loading) {
    return (
      <div className="py-14 text-sm text-foreground-500 flex items-center justify-center gap-2">
        <i className="ri-loader-4-line animate-spin"></i>
        Loading permissions…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
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

      <p className="text-sm text-foreground-600">
        Everything the assistant does is opt-in. Turn on only what you&apos;re comfortable with —
        credentials are never shared or auto-submitted without your approval.
      </p>

      <div className="rounded-2xl bg-background-100/60 border border-background-200 divide-y divide-background-200">
        {FEATURES.map((f) => {
          const on = !!consent[f.key];
          return (
            <div key={f.key} className="flex items-center gap-4 p-4 flex-wrap">
              <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-background-50 border border-background-200 text-foreground-600 flex-shrink-0">
                <i className={`${f.icon} text-lg`}></i>
              </div>
              <div className="flex-1 min-w-[220px]">
                <p className="text-sm font-semibold text-foreground-950">{f.label}</p>
                <p className="text-xs text-foreground-500 mt-0.5">{f.description}</p>
              </div>
              <button
                role="switch"
                aria-checked={on}
                onClick={() => toggle(f.key, !on)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                  on ? "bg-primary-500" : "bg-background-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-background-50 transition-transform ${
                    on ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl bg-background-100/60 border border-background-200 p-4 flex items-center gap-4 flex-wrap">
        <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-secondary-100 text-secondary-700 flex-shrink-0">
          <i className="ri-magic-line text-lg"></i>
        </div>
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm font-semibold text-foreground-950">Prepare drafts now</p>
          <p className="text-xs text-foreground-500 mt-0.5">
            Ask the assistant to draft résumés and cover letters for your strongest matches.
          </p>
        </div>
        <button
          onClick={handlePrepare}
          disabled={preparing}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-foreground-950 text-background-50 hover:bg-foreground-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
        >
          {preparing ? (
            <>
              <i className="ri-loader-4-line animate-spin"></i>
              Preparing…
            </>
          ) : (
            "Prepare drafts"
          )}
        </button>
      </div>

      {prepareMsg && (
        <p className="text-xs text-foreground-500">{prepareMsg}</p>
      )}
    </div>
  );
}