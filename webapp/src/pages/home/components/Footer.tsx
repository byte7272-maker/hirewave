const LINKS = [
  {
    title: "Product",
    items: [
      { label: "Matching", href: "#features" },
      { label: "Verification", href: "#features" },
      { label: "Tailoring", href: "#how" },
      { label: "Auto-apply", href: "#how" },
      { label: "Interview prep", href: "#interview" },
      { label: "Security", href: "#security" },
    ],
  },
  {
    title: "Company",
    items: ["About", "Careers", "Press", "Contact", "Blog"],
  },
  {
    title: "Resources",
    items: ["Help center", "Roadmap", "Changelog", "API docs", "Community"],
  },
  {
    title: "Legal",
    items: ["Privacy", "Terms", "Security", "DPA", "Cookies"],
  },
];

export default function Footer() {
  return (
    <footer className="bg-secondary-950 text-background-100">
      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto py-16">
        <div className="grid lg:grid-cols-12 gap-10 mb-14">
          <div className="lg:col-span-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-accent-500 text-background-50">
                <i className="ri-radar-line text-xl"></i>
              </div>
              <span className="font-heading text-2xl font-semibold tracking-tight text-background-50">
                Hirewave
              </span>
            </div>
            <p className="text-sm text-background-300 leading-relaxed max-w-sm mb-6">
              AI job-search automation, built for real humans. We do the tedious
              part — you do the interviewing.
            </p>
            <div className="flex items-center gap-3">
              {["ri-twitter-x-line", "ri-linkedin-line", "ri-github-line", "ri-youtube-line"].map(
                (i) => (
                  <a
                    key={i}
                    href="#"
                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-secondary-900 hover:bg-accent-500 text-background-100 transition-colors cursor-pointer"
                  >
                    <i className={i}></i>
                  </a>
                )
              )}
            </div>
          </div>

          <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-8">
            {LINKS.map((g) => (
              <div key={g.title}>
                <h4 className="text-xs uppercase tracking-widest font-semibold text-background-200 mb-4">
                  <a href="#" className="cursor-pointer">
                    {g.title}
                  </a>
                </h4>
                <ul className="space-y-2.5">
                  {g.items.map((l) => {
                    const label = typeof l === "string" ? l : l.label;
                    const href = typeof l === "string" ? "#" : l.href;
                    return (
                      <li key={label}>
                        <a
                          href={href}
                          className="text-sm text-background-300 hover:text-background-50 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {label}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-8 border-t border-secondary-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-xs text-background-400">
            © 2026 Hirewave Labs, Inc. Made with too much coffee in Brooklyn & Lisbon.
          </p>
          <div className="flex items-center gap-4 text-xs text-background-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 flex items-center justify-center rounded-full bg-accent-500"></span>
              All systems normal
            </span>
            <span>v2.4.1</span>
          </div>
        </div>
      </div>
    </footer>
  );
}