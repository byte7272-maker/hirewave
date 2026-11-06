/**
 * The reassurance panel that anchors the Approvals screen — the calm, in-control
 * promise that the assistant prepares and the user decides. Purely presentational.
 */
export default function ApprovalsPromise() {
  const points = [
    {
      icon: "ri-hand-heart-line",
      text: "The assistant prepares everything — you make the final call.",
    },
    {
      icon: "ri-shield-keyhole-line",
      text: "Approving is the only action that ever submits an application.",
    },
    {
      icon: "ri-arrow-go-back-line",
      text: "Declining is safe and reversible — nothing gets sent.",
    },
  ];

  return (
    <section
      className="animate-fade-in-up relative overflow-hidden rounded-2xl bg-background-100/60 border border-background-200 p-5 md:p-6"
      style={{ animationDelay: "0.04s" }}
    >
      <span className="pointer-events-none absolute -right-12 -top-16 w-52 h-52 rounded-full bg-primary-200/40 blur-3xl"></span>
      <div className="relative z-10 flex items-start gap-4">
        <span className="w-12 h-12 flex items-center justify-center rounded-xl bg-primary-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
          <i className="ri-shield-check-line text-2xl"></i>
        </span>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest font-semibold text-primary-700 mb-1.5">
            Human approval on every apply · Built on trust, not autopilot
          </p>
          <h2 className="font-heading text-lg md:text-xl font-medium text-foreground-950">
            Nothing is submitted until you approve it.
          </h2>
          <p className="text-sm text-foreground-600 mt-1">
            Review what the assistant prepared, then approve or decline each one on
            your terms.
          </p>

          <ul className="mt-4 grid gap-2.5 sm:grid-cols-3">
            {points.map((p) => (
              <li
                key={p.text}
                className="flex items-start gap-2.5 rounded-xl bg-background-50 border border-background-200 px-3.5 py-3"
              >
                <span className="w-6 h-6 flex items-center justify-center rounded-lg bg-accent-100 text-accent-700 flex-shrink-0 mt-0.5">
                  <i className={`${p.icon} text-sm`}></i>
                </span>
                <span className="text-xs md:text-sm text-foreground-700 leading-relaxed">
                  {p.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}