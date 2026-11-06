import SmartImage from "@/components/base/SmartImage";
import { useBrandName, useExtensionName } from "@/hooks/useBranding";
import { useExtensionInstall } from "@/hooks/useExtensionInstall";
import ExtensionInstallAction from "@/pages/extension/components/ExtensionInstallAction";
import ExtensionConnectedCard from "@/pages/extension/components/ExtensionConnectedCard";

const POINTS = [
  "Connect job boards, inboxes and ATS accounts in a single click",
  "No pairing codes, no copy-paste, no switching browser tabs",
  "Uses cookies only — your passwords never touch us",
];

/** Opening section for the dedicated extension landing page. */
export default function ExtensionHero() {
  const brandName = useBrandName();
  const extensionName = useExtensionName();
  const { installed } = useExtensionInstall();

  return (
    <section id="install" className="relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-28">
      <div className="absolute inset-0 -z-10">
        <SmartImage
          src="https://readdy.ai/api/search-image?query=Abstract%20minimal%20geometric%20composition%20with%20soft%20flowing%20ribbon%20shapes%20in%20warm%20cream%20ivory%20sand%20and%20deep%20emerald%20green%20tones%20with%20subtle%20coral%20orange%20accents%2C%20smooth%20matte%20gradients%2C%20soft%20diffused%20studio%20lighting%2C%20elegant%20editorial%20branding%20background%2C%20no%20text%2C%20ultra%20clean%2C%20high%20detail&width=1800&height=1100&seq=ext-hero-bg-2026&orientation=landscape&nocache=true"
          alt="Abstract warm-toned background"
          className="w-full h-full object-cover object-top"
          fallbackClassName="bg-gradient-to-br from-background-100 via-background-50 to-accent-100"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background-50 via-background-50/85 to-background-50/55"></div>
        <div className="absolute inset-0 hw-dotgrid opacity-[0.5]"></div>
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background-50 to-transparent"></div>
      </div>

      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-2 bg-background-100 border border-background-200 text-foreground-800 text-xs font-medium px-3 py-1.5 rounded-full mb-6 animate-fade-in-up">
              <span className="w-2 h-2 flex items-center justify-center rounded-full bg-accent-500"></span>
              Browser extension
            </div>

            <h1 className="font-heading text-4xl md:text-6xl leading-[1.04] tracking-tight text-foreground-950 font-medium">
              {extensionName} connects any site
              <span className="italic text-accent-600"> in one click.</span>
            </h1>

            <p className="mt-6 text-lg text-foreground-700 max-w-xl leading-relaxed">
              {extensionName} is the one-click companion to {brandName}. Instead of copying pairing
              codes, it links your job boards, inboxes and ATS accounts straight from the browser
              toolbar.
            </p>

            <ul className="mt-8 space-y-3.5">
              {POINTS.map((p) => (
                <li key={p} className="flex items-start gap-3 text-sm text-foreground-700">
                  <span className="w-6 h-6 flex items-center justify-center rounded-full bg-primary-100 text-primary-800 flex-shrink-0 mt-0.5">
                    <i className="ri-check-line text-sm"></i>
                  </span>
                  {p}
                </li>
              ))}
            </ul>

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-foreground-600">
              <span className="flex items-center gap-2">
                <i className="ri-chrome-line text-primary-600 text-base"></i>
                Chrome &amp; Edge
              </span>
              <span className="flex items-center gap-2">
                <i className="ri-lock-2-line text-primary-600 text-base"></i>
                Cookies only, never passwords
              </span>
              <span className="flex items-center gap-2">
                <i className="ri-time-line text-primary-600 text-base"></i>
                Installs in seconds
              </span>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative">
              <div className="absolute -top-6 -left-6 w-32 h-32 rounded-full bg-accent-200/60 blur-3xl"></div>
              <div className="absolute -bottom-8 -right-6 w-40 h-40 rounded-full bg-primary-200/60 blur-3xl"></div>

              {installed ? (
                <ExtensionConnectedCard />
              ) : (
                <div className="relative rounded-3xl border border-background-200 bg-background-100/70 p-6 md:p-8 animate-fade-in-up">
                  <div className="flex items-center gap-2 rounded-xl bg-background-50 border border-background-200 px-3 py-2.5 mb-6">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-background-300"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-background-300"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-background-300"></span>
                    </span>
                    <div className="flex-1 mx-2 h-5 rounded bg-background-100"></div>
                    <span className="w-6 h-6 flex items-center justify-center rounded-md bg-primary-100 text-primary-800 flex-shrink-0">
                      <i className="ri-puzzle-2-line text-sm"></i>
                    </span>
                  </div>

                  <h2 className="font-heading text-2xl font-medium text-foreground-950">
                    Add {extensionName} to your browser
                  </h2>
                  <p className="text-sm text-foreground-600 mt-2 leading-relaxed">
                    Free, and works alongside the job boards you already use.
                  </p>

                  <div className="mt-6">
                    <ExtensionInstallAction />
                  </div>

                  <div className="mt-6 pt-5 border-t border-background-200 space-y-2.5">
                    {[
                      { icon: "ri-links-line", t: "LinkedIn, Indeed, Greenhouse, Workday and more" },
                      { icon: "ri-shield-keyhole-line", t: "Revoke access any time from the toolbar" },
                    ].map((r) => (
                      <div key={r.t} className="flex items-center gap-2.5 text-xs text-foreground-600">
                        <i className={`${r.icon} text-sm text-accent-600`}></i>
                        {r.t}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}