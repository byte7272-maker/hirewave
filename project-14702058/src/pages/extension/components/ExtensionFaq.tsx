import { useState } from "react";
import { useBrandName, useExtensionName } from "@/hooks/useBranding";

/** Extension-specific FAQ. Mirrors the homepage accordion styling. */
export default function ExtensionFaq() {
  const brandName = useBrandName();
  const extensionName = useExtensionName();
  const [open, setOpen] = useState<number | null>(0);

  const ITEMS = [
    {
      q: `Is ${extensionName} free?`,
      a: `Yes. The extension itself is free on Chrome and Edge. It's the companion to your ${brandName} account — you only ever pay for the plan you choose, never for the extension.`,
    },
    {
      q: "Do I have to install it to use the product?",
      a: `No. The extension is a convenience. Every job site can also be connected with a one-time pairing code, so you can use ${brandName} without adding anything to your browser.`,
    },
    {
      q: "Which browsers are supported?",
      a: "Chrome and Edge today. If you're on Safari or Firefox, leave your email in the install box above and we'll tell you the moment a build lands for your browser.",
    },
    {
      q: "Does it see my passwords?",
      a: "Never. The extension borrows the session you're already signed into on the job site — it uses cookies, not credentials. No password is typed into or stored by us, and captured sessions are encrypted with AES-256-GCM.",
    },
    {
      q: "How do I remove it or revoke access?",
      a: "Unplug any connected site from the toolbar or your dashboard in one tap — access stops immediately. To remove the extension entirely, right-click its icon and choose Remove from Chrome; nothing else is affected.",
    },
    {
      q: "What data does it collect?",
      a: "Only what's needed to connect a site you've explicitly added: the session for that one site, and which site it is. Your data powers your own applications only — we never sell it or share it with advertisers.",
    },
  ];

  return (
    <section className="py-20 md:py-28 bg-background-100/60">
      <div className="w-full px-6 md:px-10 max-w-4xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-xs uppercase tracking-[0.2em] text-foreground-600 font-semibold mb-4">
            Questions & answers
          </p>
          <h2 className="font-heading text-4xl md:text-6xl leading-[1.05] tracking-tight text-foreground-950 font-medium">
            Everything about <span className="italic">the extension</span>
          </h2>
        </div>

        <div className="space-y-3">
          {ITEMS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div
                key={item.q}
                className="bg-background-50 border border-background-200 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer"
                >
                  <span className="font-heading text-lg text-foreground-950 font-medium">
                    {item.q}
                  </span>
                  <span
                    className={`w-8 h-8 flex items-center justify-center rounded-full bg-background-100 text-foreground-800 transition-transform flex-shrink-0 ${
                      isOpen ? "rotate-45 bg-primary-500 text-background-50" : ""
                    }`}
                  >
                    <i className="ri-add-line"></i>
                  </span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-foreground-700 text-base leading-relaxed border-t border-background-200 pt-4">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}