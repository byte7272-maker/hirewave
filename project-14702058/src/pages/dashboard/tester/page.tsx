import { useState } from "react";
import { Link } from "react-router-dom";
import SetupChecklist from "./components/SetupChecklist";
import ConnectSiteWalkthrough from "./components/ConnectSiteWalkthrough";
import ConnectedSitesStrip from "./components/ConnectedSitesStrip";
import ShareInviteCard from "./components/ShareInviteCard";
import TesterFeedbackForm from "./components/TesterFeedbackForm";
import { useBrandName, useExtensionName } from "@/hooks/useBranding";

const DOES = [
  "Links a job site you're already logged into, so the assistant can help you tailor your résumé and apply.",
  "Uses cookies only — never your password. You stay signed in on the site's own page.",
  "Acts only when you click Connect, and you can disconnect any site anytime under Connected sites.",
  "Every real application waits for your explicit approval — nothing is submitted on your behalf without it.",
];

const DOESNT = [
  "Never stores or sees your password.",
  "Never submits an application you haven't approved.",
  "Never touches a site you haven't connected.",
  "Never keeps a session after you disconnect it.",
];

export default function TesterProgram() {
  const brandName = useBrandName();
  const extensionName = useExtensionName();

  // Handing the feedback form a preset lets shortcut buttons (like Report a bug)
  // drop the tester straight onto the right option. The token makes repeat taps work.
  const [preset, setPreset] = useState<{ rating?: string; token: number }>({ token: 0 });

  function scrollToFeedback() {
    document.getElementById("feedback")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function reportBug() {
    setPreset({ rating: "Ran into a problem", token: Date.now() });
    window.setTimeout(scrollToFeedback, 0);
  }

  return (
    <div className="space-y-6">
      {/* Welcome hero */}
      <section className="rounded-2xl bg-secondary-100 border border-secondary-200 p-6 md:p-8 animate-fade-in-up">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full bg-accent-500 text-background-50 dark:text-foreground-950">
            <i className="ri-flask-line"></i>
            Beta tester
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full bg-background-50/80 text-secondary-900">
            <i className="ri-time-line"></i>
            2-minute setup
          </span>
        </div>
        <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">
          Welcome to the {brandName} tester program
        </h1>
        <p className="text-sm md:text-base text-foreground-700 mt-2 max-w-2xl leading-relaxed">
          Thanks for helping kick the tires on {brandName} and {extensionName}. This page mirrors the
          welcome email — work through the checklist below, follow the walkthrough to connect your
          first job site, and drop us feedback whenever something looks off.
        </p>
        <div className="flex items-center gap-2.5 flex-wrap mt-4">
          <a
            href="#feedback"
            onClick={(e) => {
              e.preventDefault();
              scrollToFeedback();
            }}
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-feedback-line"></i>
            Share feedback
          </a>
          <button
            type="button"
            onClick={reportBug}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-900 bg-accent-100 border border-accent-300 px-4 py-2.5 rounded-md hover:bg-accent-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-bug-line"></i>
            Report a bug
          </button>
          <Link
            to="/dashboard/auto-apply?tab=apps"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground-700 bg-background-50 border border-background-300 px-4 py-2.5 rounded-md hover:bg-background-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-plug-line"></i>
            Connect a site
          </Link>
        </div>
      </section>

      <ConnectedSitesStrip />

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <SetupChecklist onReportBug={reportBug} />
          <ConnectSiteWalkthrough />
          <ShareInviteCard />
        </div>

        <aside className="space-y-6">
          {/* What it does / doesn't do */}
          <section
            className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden animate-fade-in-up"
            style={{ animationDelay: "0.06s" }}
          >
            <div className="px-5 py-4 border-b border-background-200">
              <h2 className="font-heading text-lg font-medium text-foreground-950">
                What it does &amp; doesn&apos;t do
              </h2>
            </div>
            <div className="p-5 space-y-4">
              <ul className="space-y-2.5">
                {DOES.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-foreground-700">
                    <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full bg-primary-100 text-primary-900 mt-0.5">
                      <i className="ri-check-line text-xs"></i>
                    </span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="h-px bg-background-200"></div>
              <ul className="space-y-2.5">
                {DOESNT.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-foreground-600">
                    <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full bg-accent-100 text-accent-900 mt-0.5">
                      <i className="ri-close-line text-xs"></i>
                    </span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Quick links */}
          <section
            className="rounded-2xl bg-background-100/60 border border-background-200 p-5 animate-fade-in-up"
            style={{ animationDelay: "0.12s" }}
          >
            <h2 className="font-heading text-lg font-medium text-foreground-950">Jump to</h2>
            <div className="mt-3 space-y-1">
              <Link
                to="/dashboard/auto-apply?tab=apps"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground-600 hover:bg-background-100 hover:text-foreground-900 transition-colors cursor-pointer"
              >
                <span className="w-5 h-5 flex items-center justify-center text-foreground-500">
                  <i className="ri-plug-line"></i>
                </span>
                Connect a site
                <i className="ri-arrow-right-s-line ml-auto text-foreground-400"></i>
              </Link>
              <Link
                to="/dashboard/auto-apply?tab=apps"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground-600 hover:bg-background-100 hover:text-foreground-900 transition-colors cursor-pointer"
              >
                <span className="w-5 h-5 flex items-center justify-center text-foreground-500">
                  <i className="ri-links-line"></i>
                </span>
                Connected sites
                <i className="ri-arrow-right-s-line ml-auto text-foreground-400"></i>
              </Link>
              <Link
                to="/dashboard/documents"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground-600 hover:bg-background-100 hover:text-foreground-900 transition-colors cursor-pointer"
              >
                <span className="w-5 h-5 flex items-center justify-center text-foreground-500">
                  <i className="ri-file-text-line"></i>
                </span>
                Tailor your résumé
                <i className="ri-arrow-right-s-line ml-auto text-foreground-400"></i>
              </Link>
              <Link
                to="/dashboard/assistant"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground-600 hover:bg-background-100 hover:text-foreground-900 transition-colors cursor-pointer"
              >
                <span className="w-5 h-5 flex items-center justify-center text-foreground-500">
                  <i className="ri-magic-line"></i>
                </span>
                Ask the assistant
                <i className="ri-arrow-right-s-line ml-auto text-foreground-400"></i>
              </Link>
            </div>
          </section>
        </aside>
      </div>

      <TesterFeedbackForm presetRating={preset.rating} presetToken={preset.token} />
    </div>
  );
}