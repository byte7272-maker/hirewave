import { Link } from "react-router-dom";
import { useBrandName, useExtensionName } from "@/hooks/useBranding";
import { useExtensionInstall } from "@/hooks/useExtensionInstall";
import ExtensionWaitlistForm from "@/components/feature/ExtensionWaitlistForm";
import WorksWithStrip from "@/components/feature/WorksWithStrip";

/**
 * Public-facing teaser for the one-click browser extension. It reads the shared
 * install state, so people who already have the extension see a "you're
 * connected" confirmation (with their detected version) instead of the install
 * pitch — matching the dedicated extension page.
 */
export default function ExtensionTeaser() {
  const brandName = useBrandName();
  const extensionName = useExtensionName();
  const { installed, version, outdated, canInstall, storeUrl } = useExtensionInstall();

  const points = [
    { icon: "ri-flashlight-line", text: "Link a job board in a single click — no pairing codes." },
    { icon: "ri-shield-check-line", text: "Cookies only, never your password. Revoke anytime." },
    { icon: "ri-refresh-line", text: "Stays signed in across sessions." },
  ];

  return (
    <section id="extension" className="py-24 md:py-32 bg-background-50">
      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-accent-700 font-semibold mb-4">
              Browser extension
            </p>
            <h2 className="font-heading text-4xl md:text-6xl leading-[1.05] tracking-tight text-foreground-950 font-medium">
              Connect any site
              <br />
              <span className="italic text-accent-600">in one click.</span>
            </h2>
            <p className="mt-5 text-lg text-foreground-700 leading-relaxed max-w-xl">
              {extensionName} is the one-click companion to {brandName}. Instead of copying pairing
              codes, it links your job boards, inboxes and ATS accounts straight from the browser.
            </p>

            <ul className="mt-8 space-y-3.5">
              {points.map((p) => (
                <li key={p.text} className="flex items-start gap-3 text-sm text-foreground-700">
                  <span className="w-6 h-6 flex items-center justify-center rounded-full bg-primary-100 text-primary-800 flex-shrink-0 mt-0.5">
                    <i className={`${p.icon} text-sm`}></i>
                  </span>
                  {p.text}
                </li>
              ))}
            </ul>

            <Link
              to="/extension"
              className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-foreground-950 border-b border-accent-400 pb-0.5 hover:text-accent-700 transition-colors cursor-pointer whitespace-nowrap"
            >
              See everything the extension does
              <i className="ri-arrow-right-line"></i>
            </Link>
          </div>

          <div className="relative">
            <div className="rounded-3xl border border-background-200 bg-background-100/60 p-7 md:p-9">
              {/* Stylised browser toolbar with the extension pinned */}
              <div className="flex items-center gap-2 rounded-xl bg-background-50 border border-background-200 px-3 py-2.5 mb-6">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-background-300"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-background-300"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-background-300"></span>
                </span>
                <div className="flex-1 mx-2 h-5 rounded bg-background-100"></div>
                <span
                  className={`w-6 h-6 flex items-center justify-center rounded-md flex-shrink-0 ${
                    installed
                      ? "bg-secondary-100 text-secondary-800"
                      : "bg-primary-100 text-primary-800"
                  }`}
                >
                  <i className={`${installed ? "ri-check-line" : "ri-puzzle-2-line"} text-sm`}></i>
                </span>
              </div>

              {installed ? (
                <>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-secondary-100 text-secondary-900">
                    <i className="ri-check-line"></i>
                    Installed
                  </span>
                  <h3 className="font-heading text-2xl font-medium text-foreground-950 mt-4">
                    {extensionName} is connected
                  </h3>
                  <p className="text-sm text-foreground-600 mt-2 leading-relaxed">
                    You&apos;re all set{version ? ` on v${version}` : ""} — {extensionName} links
                    your sites in a single click, right from your browser toolbar. Nothing to install
                    again.
                  </p>

                  {outdated && storeUrl && (
                    <a
                      href={storeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-700 hover:text-accent-800 cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-refresh-line"></i>
                      Update available — get the latest version
                    </a>
                  )}

                  <Link
                    to="/dashboard"
                    className="mt-6 inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-3 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-dashboard-3-line"></i>
                    Go to your dashboard
                  </Link>
                </>
              ) : canInstall ? (
                <>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-primary-100 text-primary-900">
                    <i className="ri-check-line"></i>
                    Available
                  </span>
                  <h3 className="font-heading text-2xl font-medium text-foreground-950 mt-4">
                    {extensionName} is live
                  </h3>
                  <p className="text-sm text-foreground-600 mt-2 leading-relaxed">
                    Add it to your browser and connect any site in a single click.
                  </p>
                  <a
                    href={storeUrl ?? undefined}
                    target="_blank"
                    rel="noopener"
                    className="mt-6 inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-3 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-chrome-line"></i>
                    Add to Chrome
                  </a>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-secondary-100 text-secondary-900">
                    <i className="ri-computer-line"></i>
                    Desktop browser
                  </span>
                  <h3 className="font-heading text-2xl font-medium text-foreground-950 mt-4">
                    Available for Chrome and Edge
                  </h3>
                  <p className="text-sm text-foreground-600 mt-2 leading-relaxed">
                    {extensionName} runs on Chrome and Edge. Leave your email and we&apos;ll let you
                    know the moment it lands on your browser.
                  </p>

                  <div className="mt-6">
                    <ExtensionWaitlistForm />
                  </div>

                  <div className="flex items-start gap-2 rounded-lg bg-secondary-100 text-secondary-900 px-3 py-2.5 text-xs leading-relaxed mt-4">
                    <i className="ri-shield-check-line text-sm mt-0.5"></i>
                    <span>cookies only, never your password.</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-16 pt-10 border-t border-background-200">
          <WorksWithStrip label="Works with the job boards you already use" />
        </div>
      </div>
    </section>
  );
}