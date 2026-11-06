import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useExtensionName } from "@/hooks/useBranding";
import { useExtensionInstall } from "@/hooks/useExtensionInstall";
import { hasSeenExtension, markExtensionSeen } from "@/lib/extensionSeenMemory";
import { sessionTimeAgo } from "@/lib/sessionStatus";

const STEPS = [
  { icon: "ri-global-line", text: "Open LinkedIn, Indeed or an ATS in this browser" },
  { icon: "ri-links-line", text: "Click the Connect card the extension shows on the page" },
  { icon: "ri-check-double-line", text: "Your site is linked — tailor and apply right away" },
];

/**
 * "You're connected" hero card for installed users. Replaces the install pitch
 * with a confirmation plus the short next-steps to actually connect a site. The
 * "seen it" checkbox lives here (folded in from the old standalone banner): tick
 * it once and the setup steps collapse, so the page stops prompting people who
 * already know the drill. Settings can bring the steps back.
 */
export default function ExtensionConnectedCard() {
  const extensionName = useExtensionName();
  const { version, outdated, storeUrl, lastSeenAt, refresh } = useExtensionInstall();
  const [seen, setSeen] = useState(() => hasSeenExtension());
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [justChecked, setJustChecked] = useState(false);
  const spinTimer = useRef<number | null>(null);
  const feedbackTimer = useRef<number | null>(null);
  const lastCheckedLabel = lastSeenAt ? sessionTimeAgo(new Date(lastSeenAt).toISOString()) : null;

  // Clear any pending timers if the card unmounts mid-check.
  useEffect(
    () => () => {
      if (spinTimer.current !== null) window.clearTimeout(spinTimer.current);
      if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    },
    []
  );

  /** Re-run detection on demand, with a brief spinner + confirmation so the press feels answered. */
  function handleCheck() {
    if (checking) return;
    setChecking(true);
    setJustChecked(false);
    spinTimer.current = window.setTimeout(() => {
      refresh();
      setChecking(false);
      setJustChecked(true);
      feedbackTimer.current = window.setTimeout(() => setJustChecked(false), 3200);
    }, 500);
  }

  function handleSeen() {
    if (checked) return;
    setChecked(true);
    markExtensionSeen();
    // Let the checkbox tick land before the steps fade out.
    window.setTimeout(() => setSeen(true), 260);
  }

  return (
    <div className="relative rounded-3xl border border-secondary-200 bg-background-100/70 p-6 md:p-8 animate-fade-in-up">
      <div className="flex items-center gap-2 rounded-xl bg-background-50 border border-background-200 px-3 py-2.5 mb-6">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-background-300"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-background-300"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-background-300"></span>
        </span>
        <div className="flex-1 mx-2 h-5 rounded bg-background-100"></div>
        <span className="w-6 h-6 flex items-center justify-center rounded-md bg-secondary-100 text-secondary-800 flex-shrink-0">
          <i className="ri-puzzle-2-line text-sm"></i>
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl bg-secondary-500 text-background-50 dark:text-foreground-950 text-xl">
          <i className="ri-check-double-line"></i>
        </span>
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-semibold text-secondary-900">
            <span className="w-1.5 h-1.5 flex items-center justify-center rounded-full bg-secondary-500"></span>
            Connected
          </span>
          <h2 className="font-heading text-2xl font-medium text-foreground-950 mt-0.5">
            {extensionName} is ready
          </h2>
        </div>
      </div>

      <p className="text-sm text-foreground-600 mt-3 leading-relaxed">
        You&apos;re all set on this browser — there&apos;s nothing to install. Just open a site and
        connect.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-foreground-600">
        <span className="inline-flex items-center gap-1.5">
          <i className="ri-puzzle-2-line text-secondary-700"></i>
          {version ? `v${version}` : "Installed"}
        </span>
        {lastCheckedLabel && (
          <span className="inline-flex items-center gap-1.5">
            <i className="ri-shield-check-line text-secondary-700"></i>
            Last checked {lastCheckedLabel}
          </span>
        )}
        <button
          type="button"
          onClick={handleCheck}
          disabled={checking}
          className="inline-flex items-center gap-1.5 font-semibold text-secondary-900 hover:text-secondary-700 cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          <i className={checking ? "ri-loader-4-line animate-spin" : "ri-refresh-line"}></i>
          {checking ? "Checking…" : "Check again"}
        </button>
      </div>

      {justChecked && (
        <p
          className={`mt-2 inline-flex items-center gap-1.5 text-xs font-medium animate-fade-in-up ${
            outdated ? "text-accent-700" : "text-secondary-900"
          }`}
        >
          <i className={outdated ? "ri-error-warning-line" : "ri-check-line"}></i>
          {outdated
            ? "Update available — grab the latest version below."
            : "You're on the latest build."}
        </p>
      )}

      {!seen ? (
        <>
          <ul className="mt-6 space-y-3">
            {STEPS.map((s) => (
              <li key={s.text} className="flex items-start gap-3 text-sm text-foreground-700">
                <span className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg bg-background-50 border border-background-200 text-secondary-700">
                  <i className={`${s.icon} text-sm`}></i>
                </span>
                {s.text}
              </li>
            ))}
          </ul>

          <div className="mt-5 flex justify-end">
            <label
              className={`flex items-center gap-2 text-xs font-medium text-foreground-600 cursor-pointer whitespace-nowrap transition-opacity ${
                checked ? "opacity-50" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={handleSeen}
                className="w-4 h-4 rounded border-background-300 text-secondary-600 focus:ring-secondary-400 cursor-pointer"
              />
              Seen it — hide these steps
            </label>
          </div>
        </>
      ) : (
        <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-background-50 border border-background-200 px-3.5 py-3 text-xs text-foreground-600 leading-relaxed">
          <i className="ri-information-line text-sm text-secondary-700 mt-0.5"></i>
          <span>
            Setup steps hidden. You can bring them back anytime from{" "}
            <Link
              to="/dashboard/settings"
              className="font-semibold text-secondary-900 underline underline-offset-2 hover:text-secondary-700 cursor-pointer"
            >
              Settings
            </Link>
            .
          </span>
        </div>
      )}

      {outdated && storeUrl && (
        <a
          href={storeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-700 hover:text-accent-800 cursor-pointer whitespace-nowrap"
        >
          <i className="ri-refresh-line"></i>
          Update available — get the latest version
        </a>
      )}

      <div className="mt-6 pt-5 border-t border-background-200">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-3 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-dashboard-3-line"></i>
          Go to your dashboard
        </Link>
      </div>
    </div>
  );
}