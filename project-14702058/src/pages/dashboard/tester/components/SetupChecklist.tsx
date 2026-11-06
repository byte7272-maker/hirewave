import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EXTENSION_STORE_URL } from "@/lib/connectExtension";
import { readSetupProgress, writeSetupProgress } from "@/lib/testerChecklist";
import { useExtensionName } from "@/hooks/useBranding";

interface ChecklistStep {
  id: string;
  title: string;
  body: string;
  icon: string;
  action?: {
    label: string;
    icon: string;
    /** Internal router link when `href` starts with "/". */
    href: string;
    external?: boolean;
  };
  note?: string;
}

interface SetupChecklistProps {
  /** Fired by the "Connect it" step's bug shortcut so the tester can file a problem in one tap. */
  onReportBug?: () => void;
}

/**
 * The tester-program setup checklist — the four steps from the welcome email,
 * rendered as tappable cards with a live progress bar. Progress is kept in local
 * state per visit so a tester can tick steps off as they go; there's no backend,
 * it's a companion to the email. Ticking all four reveals a small celebration.
 */
export default function SetupChecklist({ onReportBug }: SetupChecklistProps) {
  const extensionName = useExtensionName();

  const steps = useMemo<ChecklistStep[]>(() => {
    const list: ChecklistStep[] = [
      {
        id: "install",
        title: "Install the extension",
        body: `Open the Chrome Web Store listing and click Add to Chrome. You must be signed into Chrome with the Google account you gave us — that's how tester access was granted.`,
        icon: "ri-puzzle-2-line",
        note: 'Seeing "item not available"? Send us the Google email you use and we\'ll enable access.',
      },
      {
        id: "signin-app",
        title: "Sign in to the app",
        body: "Sign in with the account (or access code) we sent you. You're looking at it now — so if you can read this, step 2 is done.",
        icon: "ri-user-received-2-line",
        action: { label: "Go to dashboard", icon: "ri-dashboard-3-line", href: "/dashboard" },
      },
      {
        id: "signin-site",
        title: "Sign in to a job site",
        body: "In the same browser, log into a job site you use — e.g. Indeed or LinkedIn. Just reach your logged-in homepage there; nothing else to do.",
        icon: "ri-window-line",
        action: {
          label: "Open LinkedIn",
          icon: "ri-linkedin-fill",
          href: "https://www.linkedin.com/login",
          external: true,
        },
      },
      {
        id: "connect",
        title: "Connect it",
        body: `Open Connect a site, pick the site, and click Connect. You'll see "Connected" — no codes to copy.`,
        icon: "ri-link",
        action: {
          label: "Connect a site",
          icon: "ri-plug-line",
          href: "/dashboard/auto-apply?tab=apps",
        },
      },
    ];
    if (EXTENSION_STORE_URL) {
      list[0].action = {
        label: "Add to Chrome",
        icon: "ri-chrome-line",
        href: EXTENSION_STORE_URL,
        external: true,
      };
    }
    return list;
  }, []);

  const [done, setDone] = useState<Record<string, boolean>>(
    () => readSetupProgress()?.done ?? {},
  );
  const completed = steps.filter((s) => done[s.id]).length;

  // Persist progress on every change so the feedback form can report which step
  // a tester stalled on — the "abandon point" — at submit time.
  useEffect(() => {
    writeSetupProgress({
      done,
      steps: steps.map((s) => ({ id: s.id, title: s.title })),
    });
  }, [done, steps]);
  const pct = Math.round((completed / steps.length) * 100);
  const allDone = completed === steps.length;

  function toggle(id: string) {
    setDone((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function reset() {
    setDone({});
  }

  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden animate-fade-in-up">
      <div className="px-5 py-4 border-b border-background-200">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary-100 text-primary-900 flex-shrink-0">
              <i className="ri-list-check-2"></i>
            </span>
            <div className="min-w-0">
              <h2 className="font-heading text-lg font-medium text-foreground-950">
                Finish your 2-minute setup
              </h2>
              <p className="text-xs text-foreground-500 mt-0.5">
                Tap a step to tick it off as you go
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-background-200 text-foreground-700 whitespace-nowrap">
            <i className="ri-progress-4-line"></i>
            {completed} of {steps.length} done
          </span>
        </div>
        <div className="mt-3 h-1.5 w-full rounded-full bg-background-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary-500 transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          ></div>
        </div>
      </div>

      <ol className="divide-y divide-background-200">
        {steps.map((step, index) => {
          const isDone = !!done[step.id];
          return (
            <li key={step.id} className="flex items-start gap-4 px-5 py-4">
              <button
                type="button"
                onClick={() => toggle(step.id)}
                aria-pressed={isDone}
                aria-label={isDone ? `Mark step ${index + 1} as not done` : `Mark step ${index + 1} as done`}
                className={`mt-0.5 w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full text-sm font-semibold transition-colors cursor-pointer ${
                  isDone
                    ? "bg-primary-500 text-background-50 dark:text-foreground-950"
                    : "bg-background-200 text-foreground-600 hover:bg-background-300"
                }`}
              >
                {isDone ? <i className="ri-check-line"></i> : index + 1}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="w-5 h-5 flex items-center justify-center text-foreground-500">
                    <i className={step.icon}></i>
                  </span>
                  <h3
                    className={`text-sm font-semibold ${
                      isDone ? "text-foreground-500 line-through" : "text-foreground-950"
                    }`}
                  >
                    {step.title}
                  </h3>
                </div>
                <p className="text-sm text-foreground-600 mt-1 leading-relaxed">{step.body}</p>
                {step.note && (
                  <p className="text-xs text-foreground-500 mt-2 flex items-start gap-1.5">
                    <i className="ri-lightbulb-line text-sm text-accent-600 mt-0.5 flex-shrink-0"></i>
                    <span>{step.note}</span>
                  </p>
                )}
                {step.action &&
                  (step.action.external ? (
                    <a
                      href={step.action.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <i className={step.action.icon}></i>
                      {step.action.label}
                    </a>
                  ) : (
                    <Link
                      to={step.action.href}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <i className={step.action.icon}></i>
                      {step.action.label}
                    </Link>
                  ))}
                {step.id === "connect" && onReportBug && (
                  <button
                    type="button"
                    onClick={onReportBug}
                    className="mt-3 ml-2 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-900 bg-accent-100 border border-accent-300 px-3.5 py-2 rounded-md hover:bg-accent-200 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-bug-line"></i>
                    Report a bug
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {allDone && (
        <div className="px-5 py-4 bg-primary-100/70 border-t border-background-200 flex items-start gap-3 animate-fade-in-up">
          <span className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full bg-primary-500 text-background-50 dark:text-foreground-950 text-lg">
            <i className="ri-trophy-line"></i>
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground-950">Setup complete — nice!</h3>
            <p className="text-sm text-foreground-600 mt-0.5 leading-relaxed">
              You&apos;re all set. Head to Auto-apply or your documents and put {extensionName} to work —
              and keep the feedback coming, it shapes what we build next.
            </p>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Link
                to="/dashboard/auto-apply"
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-play-circle-line"></i>
                Start using {extensionName}
              </Link>
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-600 hover:text-foreground-900 px-3.5 py-2 rounded-md hover:bg-background-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-restart-line"></i>
                Reset checklist
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-5 py-3 bg-secondary-100 text-secondary-900 text-xs flex items-start gap-2">
        <i className="ri-information-line text-sm mt-0.5 flex-shrink-0"></i>
        <span>
          Everything runs through {extensionName}. If a site doesn&apos;t auto-connect, we&apos;ll walk
          you through the one-time pairing code below.
        </span>
      </div>
    </section>
  );
}