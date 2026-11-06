import { useExtensionName } from "@/hooks/useBranding";

const PROMISES = [
  {
    icon: "ri-shield-keyhole-line",
    title: "Cookies only — never your password",
    body: "We attach the session you're already signed into. No password is ever typed into or stored by us.",
  },
  {
    icon: "ri-delete-bin-6-line",
    title: "Revoke whenever you like",
    body: "Unplug a site from the toolbar or the dashboard in one tap. Access is gone the moment you say so.",
  },
  {
    icon: "ri-lock-2-line",
    title: "Encrypted at rest",
    body: "Captured sessions are encrypted with AES-256-GCM and scoped to the single site they belong to.",
  },
  {
    icon: "ri-eye-off-line",
    title: "Never sold, never shared",
    body: "Your data powers your own applications only. We don't sell it, and we don't hand it to advertisers.",
  },
];

const PERMISSIONS = [
  { icon: "ri-window-line", name: "tabs", why: "To know which job site you're on so it can offer to connect." },
  { icon: "ri-key-2-line", name: "cookies", why: "To attach the signed-in session you already have on that site." },
  { icon: "ri-database-2-line", name: "storage", why: "To remember your connected sites between visits." },
  { icon: "ri-refresh-line", name: "alarms", why: "To quietly keep your connected sessions fresh." },
];

/** Security and transparency section — the honest "what it accesses and why". */
export default function ExtensionTrust() {
  const extensionName = useExtensionName();

  return (
    <section className="py-20 md:py-28 bg-background-50">
      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-accent-700 font-semibold mb-4">
              Trust & safety
            </p>
            <h2 className="font-heading text-4xl md:text-5xl leading-[1.08] tracking-tight text-foreground-950 font-medium">
              Built to be boring
              <span className="italic"> about your security.</span>
            </h2>
            <p className="mt-5 text-lg text-foreground-700 leading-relaxed">
              {extensionName} only ever sees what it needs to connect a site you've asked it to. Here
              are the promises we hold ourselves to.
            </p>

            <div className="mt-9 space-y-6">
              {PROMISES.map((p) => (
                <div key={p.title} className="flex items-start gap-4">
                  <span className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl bg-primary-100 text-primary-800 text-lg">
                    <i className={p.icon}></i>
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-heading text-lg font-medium text-foreground-950">
                      {p.title}
                    </h3>
                    <p className="text-sm text-foreground-600 mt-1 leading-relaxed">{p.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-background-200 bg-background-100/60 p-7 md:p-8">
            <div className="flex items-center gap-3 mb-2">
              <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-accent-100 text-accent-900">
                <i className="ri-list-check-2"></i>
              </span>
              <h3 className="font-heading text-xl font-medium text-foreground-950">
                Permissions, in plain English
              </h3>
            </div>
            <p className="text-sm text-foreground-600 mb-6 leading-relaxed">
              Browser permissions sound scary. Here's exactly what each one is for.
            </p>

            <ul className="divide-y divide-background-200">
              {PERMISSIONS.map((p) => (
                <li key={p.name} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
                  <span className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg bg-background-50 border border-background-200 text-foreground-700">
                    <i className={`${p.icon} text-sm`}></i>
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold font-mono text-foreground-950">{p.name}</p>
                    <p className="text-sm text-foreground-600 mt-0.5 leading-relaxed">{p.why}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-secondary-100 text-secondary-900 px-4 py-3 text-xs leading-relaxed">
              <i className="ri-information-line text-sm mt-0.5 flex-shrink-0"></i>
              <span>
                Prefer not to install anything? Every connection also works with a pairing code — the
                extension is a convenience, never a requirement.
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}