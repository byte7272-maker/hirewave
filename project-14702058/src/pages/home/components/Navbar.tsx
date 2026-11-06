import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useBrandName } from "@/hooks/useBranding";
import ThemeToggle from "@/components/base/ThemeToggle";

interface NavItem {
  label: string;
  /** In-page anchor on the home page (e.g. "#features"). */
  hash?: string;
  /** Router path for a dedicated page. */
  to?: string;
}

const NAV_LINKS: NavItem[] = [
  { label: "Features", hash: "#features" },
  { label: "How it works", hash: "#how" },
  { label: "Interview prep", hash: "#interview" },
  { label: "Extension", to: "/extension" },
  { label: "Pricing", hash: "#pricing" },
  { label: "FAQ", hash: "#faq" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const brandName = useBrandName();
  const location = useLocation();
  const onHome = location.pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /** On the home page a bare hash works; elsewhere it needs to route back home first. */
  const anchor = (hash: string) => (onHome ? hash : `/${hash}`);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background-50/90 backdrop-blur-md border-b border-background-200"
          : "bg-transparent"
      }`}
    >
      <nav className="w-full px-6 md:px-10 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 cursor-pointer">
          <img
            src="https://storage.helloreaddy.io/project_files/d6523991-0f51-4e05-ac11-6a28b4f177fa/1f022524-733b-4112-925c-668e802bb9e2_compressed_icon128.webp"
            alt={`${brandName} logo`}
            width={36}
            height={36}
            className="w-9 h-9 rounded-lg object-cover"
          />
          <span className="font-heading text-2xl font-semibold tracking-tight text-foreground-950">
            {brandName}
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((l) =>
            l.to ? (
              <Link
                key={l.label}
                to={l.to}
                className="text-sm font-medium text-foreground-700 hover:text-foreground-950 transition-colors cursor-pointer whitespace-nowrap"
              >
                {l.label}
              </Link>
            ) : (
              <a
                key={l.label}
                href={anchor(l.hash ?? "#top")}
                className="text-sm font-medium text-foreground-700 hover:text-foreground-950 transition-colors cursor-pointer whitespace-nowrap"
              >
                {l.label}
              </a>
            )
          )}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle className="border border-background-200" />
          <Link
            to="/auth/login"
            className="inline-flex items-center gap-2 text-sm font-semibold text-foreground-950 bg-background-50 border border-background-300 px-4 py-2 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-user-line text-base"></i>
            Sign in
          </Link>
          <a
            href={anchor("#cta")}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            Request access
            <i className="ri-arrow-right-line"></i>
          </a>
        </div>

        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="md:hidden w-10 h-10 flex items-center justify-center rounded-md text-foreground-900 hover:bg-background-100 cursor-pointer"
          aria-label="Toggle menu"
        >
          <i className={`ri-${menuOpen ? "close" : "menu"}-line text-2xl`}></i>
        </button>
      </nav>

      {menuOpen && (
        <div className="md:hidden bg-background-50 border-t border-background-200 px-6 py-4 flex flex-col gap-3">
          {NAV_LINKS.map((l) =>
            l.to ? (
              <Link
                key={l.label}
                to={l.to}
                onClick={() => setMenuOpen(false)}
                className="text-sm font-medium text-foreground-800 py-2 cursor-pointer"
              >
                {l.label}
              </Link>
            ) : (
              <a
                key={l.label}
                href={anchor(l.hash ?? "#top")}
                onClick={() => setMenuOpen(false)}
                className="text-sm font-medium text-foreground-800 py-2 cursor-pointer"
              >
                {l.label}
              </a>
            )
          )}
          <Link
            to="/auth/login"
            onClick={() => setMenuOpen(false)}
            className="mt-2 inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md whitespace-nowrap"
          >
            Sign in
          </Link>
          <div className="flex items-center justify-between pt-2 border-t border-background-200">
            <span className="text-sm font-medium text-foreground-800">Appearance</span>
            <ThemeToggle className="border border-background-200" />
          </div>
        </div>
      )}
    </header>
  );
}