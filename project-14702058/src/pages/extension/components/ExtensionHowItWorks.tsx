import { useExtensionName } from "@/hooks/useBranding";

const STEPS = [
  {
    icon: "ri-download-2-line",
    title: "Add it to your browser",
    body: "One click from the Chrome Web Store. It pins to your toolbar and updates itself.",
  },
  {
    icon: "ri-user-received-2-line",
    title: "Sign in to the app once",
    body: "Open your dashboard and log in. The extension recognises you automatically — nothing to pair.",
  },
  {
    icon: "ri-global-line",
    title: "Visit a job site you use",
    body: "Open LinkedIn, Indeed or an ATS in the same browser. The extension spots it and offers to connect.",
  },
  {
    icon: "ri-links-line",
    title: "Click Connect — done",
    body: "You get a green Connected chip. Any site you've added can now be tailored and applied to.",
  },
];

/** Step-by-step "how it works" timeline for the extension. */
export default function ExtensionHowItWorks() {
  const extensionName = useExtensionName();

  return (
    <section className="py-20 md:py-28 bg-background-100/60">
      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto">
        <div className="max-w-2xl mb-14">
          <p className="text-xs uppercase tracking-[0.2em] text-foreground-600 font-semibold mb-4">
            How it works
          </p>
          <h2 className="font-heading text-4xl md:text-5xl leading-[1.08] tracking-tight text-foreground-950 font-medium">
            From install to connected in
            <span className="italic"> under a minute.</span>
          </h2>
        </div>

        <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="group relative rounded-2xl border border-background-200 bg-background-50 p-6 hw-lift hover:border-accent-300"
            >
              <div className="flex items-center justify-between mb-5">
                <span className="w-11 h-11 flex items-center justify-center rounded-xl bg-accent-500 text-background-50 dark:text-foreground-950 text-xl">
                  <i className={s.icon}></i>
                </span>
                <span className="font-heading text-3xl font-medium text-background-300">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="font-heading text-lg font-medium text-foreground-950">{s.title}</h3>
              <p className="text-sm text-foreground-600 mt-2 leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>

        <p className="mt-8 text-sm text-foreground-600 flex items-start gap-2">
          <i className="ri-information-line text-base text-accent-600 mt-0.5 flex-shrink-0"></i>
          <span>
            Stuck on a site that won&apos;t auto-connect? Click the {extensionName} icon in your
            toolbar, pick the site, and paste the one-time code shown in the app. Same result, one
            extra step.
          </span>
        </p>
      </div>
    </section>
  );
}