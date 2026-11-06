import { useExtensionName } from "@/hooks/useBranding";
import ExtensionInstallAction from "@/pages/extension/components/ExtensionInstallAction";

/** Closing call-to-action band for the extension landing page. */
export default function ExtensionCta() {
  const extensionName = useExtensionName();

  return (
    <section className="py-20 md:py-28 bg-background-50">
      <div className="w-full px-6 md:px-10 max-w-6xl mx-auto">
        <div className="relative overflow-hidden rounded-3xl bg-primary-500 px-6 py-14 md:px-14 md:py-16">
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-primary-400/40 blur-3xl"></div>
          <div className="absolute -bottom-12 -left-12 w-56 h-56 rounded-full bg-accent-500/25 blur-3xl"></div>

          <div className="relative flex flex-col lg:flex-row lg:items-center gap-10 lg:gap-14">
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-[0.2em] text-background-200 font-semibold mb-4">
                Get one-click connect
              </p>
              <h2 className="font-heading text-4xl md:text-5xl leading-[1.08] tracking-tight text-background-50 font-medium">
                Put {extensionName} in your toolbar.
              </h2>
              <p className="mt-5 text-base md:text-lg text-primary-100 leading-relaxed max-w-xl">
                Install once and every site you use links in a single click — freeing you to spend
                your time on the roles that actually matter.
              </p>
            </div>

            <div className="flex-shrink-0 lg:w-80">
              <ExtensionInstallAction withWaitlist={false} tone="onDark" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}