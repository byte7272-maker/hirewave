import { EXTENSION_LATEST_VERSION } from "@/lib/connectExtension";
import { useExtensionName } from "@/hooks/useBranding";
import { useExtensionInstall } from "@/hooks/useExtensionInstall";
import ExtensionWaitlistForm from "@/components/feature/ExtensionWaitlistForm";

interface ExtensionInstallActionProps {
  /** Allow an inline email capture when the store link isn't live yet. */
  withWaitlist?: boolean;
  /** Horizontal alignment of the action block. */
  align?: "left" | "center";
  /** Surface tone — "onDark" is for use over a saturated fill (the closing CTA band). */
  tone?: "onLight" | "onDark";
  className?: string;
}

/**
 * The single install control for the Connect extension. Renders one of three
 * states so every CTA across the site agrees: already installed (with an update
 * nudge), installable now (store link), or still in review (waitlist capture).
 */
export default function ExtensionInstallAction({
  withWaitlist = true,
  align = "left",
  tone = "onLight",
  className = "",
}: ExtensionInstallActionProps) {
  const { installed, version, outdated, canInstall, storeUrl } = useExtensionInstall();
  const extensionName = useExtensionName();
  const alignCls = align === "center" ? "items-center text-center" : "items-start";

  if (installed) {
    return (
      <div className={`flex flex-col gap-2 ${alignCls} ${className}`}>
        <span
          className={`inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-md whitespace-nowrap ${
            tone === "onDark"
              ? "bg-background-50/15 text-background-50"
              : "bg-secondary-100 text-secondary-900"
          }`}
        >
          <i className="ri-check-line"></i>
          {extensionName} installed{version ? ` · v${version}` : ""}
        </span>
        {outdated && storeUrl && (
          <a
            href={storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap ${
              tone === "onDark"
                ? "text-background-50 hover:text-background-100"
                : "text-accent-700 hover:text-accent-800"
            }`}
          >
            <i className="ri-refresh-line"></i>
            Update available — get v{EXTENSION_LATEST_VERSION}
          </a>
        )}
      </div>
    );
  }

  if (canInstall && storeUrl) {
    return (
      <div className={`flex flex-col gap-2 ${alignCls} ${className}`}>
        <a
          href={storeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-2 text-sm font-semibold px-5 py-3 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
            tone === "onDark"
              ? "bg-background-50 text-foreground-950 hover:bg-background-100"
              : "bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600"
          }`}
        >
          <i className="ri-chrome-line"></i>
          Add to Chrome — it&apos;s free
        </a>
        <span
          className={`text-xs ${
            tone === "onDark" ? "text-background-200" : "text-foreground-500"
          }`}
        >
          Works on Chrome and Edge
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${alignCls} ${className}`}>
      <span
        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
          tone === "onDark"
            ? "bg-background-50/15 text-background-50"
            : "bg-secondary-100 text-secondary-900"
        }`}
      >
        <i className="ri-computer-line"></i>
        Available for Chrome and Edge
      </span>
      {withWaitlist ? (
        <>
          <p
            className={`text-sm leading-relaxed ${
              tone === "onDark" ? "text-background-200" : "text-foreground-600"
            }`}
          >
            {extensionName} is in final review. Leave your email and we&apos;ll send the install
            link the moment it&apos;s live.
          </p>
          <div className="w-full">
            <ExtensionWaitlistForm />
          </div>
        </>
      ) : (
        <a
          href="#install"
          className={`inline-flex items-center gap-2 text-sm font-semibold px-5 py-3 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
            tone === "onDark"
              ? "bg-background-50 text-foreground-950 hover:bg-background-100"
              : "bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600"
          }`}
        >
          <i className="ri-mail-send-line"></i>
          Join the waitlist
        </a>
      )}
    </div>
  );
}