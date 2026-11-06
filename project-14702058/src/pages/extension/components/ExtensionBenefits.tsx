import { useExtensionName } from "@/hooks/useBranding";

const BENEFITS = [
  {
    icon: "ri-flashlight-line",
    title: "One-click connect",
    body: "Link LinkedIn, Indeed, Greenhouse or Workday with a single click. No pairing codes to copy, no codes to paste.",
  },
  {
    icon: "ri-shield-check-line",
    title: "Cookies only, never passwords",
    body: "The extension borrows the session you're already signed into. Your passwords stay with the provider, not with us.",
  },
  {
    icon: "ri-refresh-line",
    title: "Stays signed in",
    body: "Sessions are quietly refreshed in the background, so your connected sites stay live between visits.",
  },
  {
    icon: "ri-mail-open-line",
    title: "Reads your inbox",
    body: "Connect Gmail once and application updates — interviews, rejections, offers — get captured automatically.",
  },
  {
    icon: "ri-magic-line",
    title: "Autofills applications",
    body: "Pull your saved profile straight into application forms, so you're not retyping the same details for the tenth time.",
  },
  {
    icon: "ri-line-chart-line",
    title: "Tracks every application",
    body: "Statuses sync back to your dashboard as you apply, so your pipeline is always up to date without manual logging.",
  },
];

/** Grid of what the extension actually does for you, in plain language. */
export default function ExtensionBenefits() {
  const extensionName = useExtensionName();

  return (
    <section className="py-20 md:py-28 bg-background-50">
      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto">
        <div className="max-w-2xl mb-14">
          <p className="text-xs uppercase tracking-[0.2em] text-accent-700 font-semibold mb-4">
            What it does
          </p>
          <h2 className="font-heading text-4xl md:text-5xl leading-[1.08] tracking-tight text-foreground-950 font-medium">
            One small extension.
            <span className="italic"> A lot less admin.</span>
          </h2>
          <p className="mt-5 text-lg text-foreground-700 leading-relaxed">
            {extensionName} handles the fiddly parts of applying in the background, so you can focus
            on picking the right roles.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {BENEFITS.map((b) => (
            <article
              key={b.title}
              className="group rounded-2xl border border-background-200 bg-background-100/60 p-6 hw-lift hover:border-primary-300"
            >
              <span className="w-11 h-11 flex items-center justify-center rounded-xl bg-primary-100 text-primary-800 text-xl mb-5 transition-colors group-hover:bg-primary-500 group-hover:text-background-50 dark:group-hover:text-foreground-950">
                <i className={b.icon}></i>
              </span>
              <h3 className="font-heading text-xl font-medium text-foreground-950">{b.title}</h3>
              <p className="text-sm text-foreground-600 mt-2 leading-relaxed">{b.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}