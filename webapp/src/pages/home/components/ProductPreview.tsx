export default function ProductPreview() {
  return (
    <section className="py-24 md:py-32 bg-background-50">
      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5">
            <p className="text-xs uppercase tracking-[0.2em] text-primary-700 font-semibold mb-4">
              The dashboard
            </p>
            <h2 className="font-heading text-4xl md:text-5xl leading-[1.05] tracking-tight text-foreground-950 font-medium mb-5">
              Your entire job hunt in <span className="italic">one calm view</span>
            </h2>
            <p className="text-lg text-foreground-700 leading-relaxed mb-6">
              Skip the 14-tab chaos. See every match, every application, every
              reply and every next step in a single ATS-lite workspace that
              feels like Linear, not Workday.
            </p>
            <ul className="space-y-3">
              {[
                "Kanban board for saved · applied · interviewing · offer",
                "Per-application audit trail — every submit is logged",
                "Reply inbox from Gmail unified with LinkedIn messages",
                "Weekly digest with hire probability + follow-up nudges",
              ].map((line) => (
                <li key={line} className="flex items-start gap-3 text-sm text-foreground-800">
                  <span className="mt-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-primary-500 text-background-50 flex-shrink-0">
                    <i className="ri-check-line text-xs"></i>
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-7">
            <div className="relative">
              <div className="absolute inset-0 -m-6 rounded-3xl bg-gradient-to-tr from-primary-100/50 via-background-100 to-accent-100/40 -z-10"></div>
              <div className="bg-background-50 border border-background-200 rounded-2xl overflow-hidden">
                <div className="border-b border-background-200 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 flex items-center justify-center rounded-full bg-background-300"></span>
                    <span className="w-2.5 h-2.5 flex items-center justify-center rounded-full bg-background-300"></span>
                    <span className="w-2.5 h-2.5 flex items-center justify-center rounded-full bg-background-300"></span>
                  </div>
                  <span className="text-xs font-mono text-foreground-500">
                    app.hirewave.io/dashboard
                  </span>
                  <div className="w-12"></div>
                </div>
                <div className="p-5 grid grid-cols-4 gap-3">
                  {[
                    { title: "Saved", n: 34, color: "background" },
                    { title: "Applied", n: 12, color: "primary" },
                    { title: "Interview", n: 4, color: "accent" },
                    { title: "Offer", n: 1, color: "secondary" },
                  ].map((c) => (
                    <div
                      key={c.title}
                      className="rounded-lg bg-background-100 border border-background-200 p-3"
                    >
                      <div className="text-[10px] font-mono uppercase tracking-wider text-foreground-600">
                        {c.title}
                      </div>
                      <div
                        className={`font-heading text-3xl mt-1 ${
                          c.color === "primary"
                            ? "text-primary-700"
                            : c.color === "accent"
                            ? "text-accent-700"
                            : c.color === "secondary"
                            ? "text-secondary-700"
                            : "text-foreground-950"
                        }`}
                      >
                        {c.n}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="px-5 pb-5 space-y-2">
                  {[
                    {
                      role: "Product Designer II",
                      co: "Notion",
                      stage: "Interview 2/3",
                      day: "Tomorrow · 10:00 AM",
                      color: "accent",
                    },
                    {
                      role: "Senior UX Engineer",
                      co: "Airbnb",
                      stage: "Applied · Awaiting",
                      day: "Submitted 2 days ago",
                      color: "primary",
                    },
                    {
                      role: "Design Lead",
                      co: "Ramp",
                      stage: "Offer received",
                      day: "$220k + equity",
                      color: "secondary",
                    },
                  ].map((r) => (
                    <div
                      key={r.role}
                      className="flex items-center gap-3 p-3 rounded-lg bg-background-100 border border-background-200"
                    >
                      <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-background-50 border border-background-200 font-heading font-semibold text-foreground-900">
                        {r.co[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground-950 truncate">
                          {r.role} <span className="text-foreground-500 font-normal">· {r.co}</span>
                        </div>
                        <div className="text-xs text-foreground-600 truncate">
                          {r.day}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-medium px-2 py-1 rounded whitespace-nowrap ${
                          r.color === "primary"
                            ? "bg-primary-100 text-primary-900"
                            : r.color === "accent"
                            ? "bg-accent-100 text-accent-900"
                            : "bg-secondary-100 text-secondary-900"
                        }`}
                      >
                        {r.stage}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}