import { Link } from "react-router-dom";
import { useBrandName } from "@/hooks/useBranding";

interface FooterLink {
  label: string;
  /** Internal router path; placeholder links omit this. */
  to?: string;
}

const LINKS: { title: string; items: FooterLink[] }[] = [
  {
    title: "Product",
    items: [
      { label: "Matching" },
      { label: "Verification" },
      { label: "Tailoring" },
      { label: "Auto-apply" },
      { label: "Interview prep" },
      { label: "Browser extension", to: "/extension" },
      { label: "Security" },
    ],
  },
  {
    title: "Company",
    items: [
      { label: "About" },
      { label: "Careers" },
      { label: "Press" },
      { label: "Contact" },
      { label: "Blog" },
    ],
  },
  {
    title: "Resources",
    items: [
      { label: "Help center" },
      { label: "Roadmap" },
      { label: "Changelog" },
      { label: "API docs" },
      { label: "Community" },
    ],
  },
  {
    title: "Legal",
    items: [
      { label: "Privacy", to: "/privacy" },
      { label: "Terms", to: "/terms" },
      { label: "Security" },
      { label: "DPA" },
      { label: "Cookies" },
    ],
  },
];

export default function Footer() {
  const brandName = useBrandName();
  return (
    <footer className="relative bg-secondary-950 text-background-100 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-500/70 to-transparent"></div>
      <span className="pointer-events-none absolute -top-24 -right-16 w-80 h-80 rounded-full bg-accent-500/10 blur-3xl"></span>
      <span className="pointer-events-none absolute -bottom-24 -left-16 w-80 h-80 rounded-full bg-primary-500/10 blur-3xl"></span>
      <div className="relative w-full px-6 md:px-10 max-w-7xl mx-auto py-16">
        <div className="grid lg:grid-cols-12 gap-10 mb-14">
          <div className="lg:col-span-4">
            <div className="flex items-center gap-2 mb-4">
              <img
                src="https://storage.helloreaddy.io/project_files/d6523991-0f51-4e05-ac11-6a28b4f177fa/1f022524-733b-4112-925c-668e802bb9e2_compressed_icon128.webp"
                alt={`${brandName} logo`}
                width={36}
                height={36}
                className="w-9 h-9 rounded-lg object-cover"
              />
              <span className="font-heading text-2xl font-semibold tracking-tight text-background-50">
                {brandName}
              </span>
            </div>
            <p className="text-sm text-background-300 leading-relaxed max-w-sm mb-6">
              Keep the job boards you love. We prep the résumé and handle the
              applications — you do the interviewing.
            </p>
            <Link
              to="/extension"
              className="inline-flex items-center gap-2 text-sm font-semibold bg-accent-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-accent-600 transition-colors cursor-pointer whitespace-nowrap mb-6"
            >
              <i className="ri-puzzle-2-line"></i>
              Get the browser extension
            </Link>
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
                  {g.items.map((l) => (
                    <li key={l.label}>
                      {l.to ? (
                        <Link
                          to={l.to}
                          className="text-sm text-background-300 hover:text-background-50 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {l.label}
                        </Link>
                      ) : (
                        <a
                          href="#"
                          className="text-sm text-background-300 hover:text-background-50 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {l.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-8 border-t border-secondary-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-xs text-background-400">
            © 2026 {brandName} Labs, Inc. Made with too much coffee in Brooklyn &amp; Lisbon.
          </p>
          <div className="flex items-center gap-4 text-xs text-background-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 hw-pulse flex items-center justify-center rounded-full bg-accent-500"></span>
              All systems normal
            </span>
            <span className="font-mono">v2.4.1</span>
          </div>
        </div>
      </div>
    </footer>
  );
}