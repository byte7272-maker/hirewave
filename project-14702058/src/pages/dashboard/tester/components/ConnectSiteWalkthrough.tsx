import { useState } from "react";
import { Link } from "react-router-dom";
import { EXTENSION_STORE_URL } from "@/lib/connectExtension";
import { useExtensionName } from "@/hooks/useBranding";

interface WalkStep {
  id: string;
  title: string;
  body: string;
  icon: string;
}

/**
 * A click-through helper for connecting a job site. Mirrors the real flow in
 * Auto-apply → Authenticated apps, and ends with a button that drops the tester
 * straight into that screen. Purely front-of-house: no network calls.
 */
export default function ConnectSiteWalkthrough() {
  const extensionName = useExtensionName();

  const steps: WalkStep[] = [
    {
      id: "ext",
      title: `Have ${extensionName} installed`,
      body: "If you already added it from the welcome email, you're set. Installing takes one click and needs to happen in the same browser you'll use for job sites.",
      icon: "ri-puzzle-2-line",
    },
    {
      id: "login",
      title: "Log in on the job site",
      body: "In the same browser, sign in to Indeed, LinkedIn, or wherever you apply. There's nothing to do on their page — just reach your logged-in homepage.",
      icon: "ri-user-received-2-line",
    },
    {
      id: "pick",
      title: "Open Connect a site",
      body: "Head to Auto-apply → Authenticated apps. Every site you can link is listed as a card with a Connect button.",
      icon: "ri-plug-line",
    },
    {
      id: "connect",
      title: "Click Connect",
      body: 'Pick the site and hit Connect. When it works you\'ll see a green "Connected" chip — that means the assistant can now help you tailor and apply.',
      icon: "ri-link",
    },
    {
      id: "fallback",
      title: "If it doesn't auto-connect",
      body: "Click the extension icon in your browser toolbar, pick the site, and paste the one-time code shown in the app. Same result, just a manual handshake.",
      icon: "ri-key-2-line",
    },
  ];

  const [index, setIndex] = useState(0);
  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden animate-fade-in-up">
      <div className="px-5 py-4 border-b border-background-200 flex items-center gap-2.5">
        <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-accent-100 text-accent-900 flex-shrink-0">
          <i className="ri-route-line"></i>
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-medium text-foreground-950">
            Guided connect walkthrough
          </h2>
          <p className="text-xs text-foreground-500 mt-0.5">
            Five short steps from install to &ldquo;Connected&rdquo;
          </p>
        </div>
      </div>

      <div className="px-5 pt-4">
        <div className="flex items-center gap-1.5">
          {steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Go to step ${i + 1}: ${s.title}`}
              aria-current={i === index}
              className={`h-1.5 flex-1 rounded-full transition-colors cursor-pointer ${
                i <= index ? "bg-accent-500" : "bg-background-200 hover:bg-background-300"
              }`}
            ></button>
          ))}
        </div>
      </div>

      <div className="p-5">
        <div className="rounded-xl bg-background-50 border border-background-200 p-5">
          <div className="flex items-start gap-4">
            <span className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl bg-accent-500 text-background-50 dark:text-foreground-950 text-xl">
              <i className={step.icon}></i>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-foreground-400">
                Step {index + 1} of {steps.length}
              </p>
              <h3 className="font-heading text-lg font-medium text-foreground-950 mt-0.5">
                {step.title}
              </h3>
              <p className="text-sm text-foreground-600 mt-1.5 leading-relaxed">{step.body}</p>

              {step.id === "ext" && EXTENSION_STORE_URL && (
                <a
                  href={EXTENSION_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-download-line"></i>
                  Open the store listing
                </a>
              )}
              {(step.id === "pick" || step.id === "connect") && (
                <Link
                  to="/dashboard/auto-apply?tab=apps"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-plug-line"></i>
                  Take me there
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mt-4">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={isFirst}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground-700 bg-background-100 border border-background-300 px-3.5 py-2 rounded-md hover:bg-background-200 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <i className="ri-arrow-left-line"></i>
            Back
          </button>

          {isLast ? (
            <Link
              to="/dashboard/auto-apply?tab=apps"
              className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-plug-line"></i>
              Start connecting
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}
              className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              Next
              <i className="ri-arrow-right-line"></i>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}