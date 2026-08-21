import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how" },
  { label: "Interview prep", href: "#interview" },
  { label: "Security", href: "#security" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background-50/90 backdrop-blur-md border-b border-background-200"
          : "bg-transparent"
      }`}
    >
      <nav className="w-full px-6 md:px-10 py-4 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-2 cursor-pointer">
          <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary-500 text-background-50">
            <i className="ri-radar-line text-xl"></i>
          </div>
          <span className="font-heading text-2xl font-semibold tracking-tight text-foreground-950">
            Hirewave
          </span>
        </a>

        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-foreground-700 hover:text-foreground-950 transition-colors cursor-pointer whitespace-nowrap"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 text-sm font-semibold text-foreground-950 bg-background-50 border border-background-300 px-4 py-2 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-user-line text-base"></i>
            Sign in
          </Link>
          <a
            href="#cta"
            className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            Start free
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
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="text-sm font-medium text-foreground-800 py-2 cursor-pointer"
            >
              {l.label}
            </a>
          ))}
          <Link
            to="/auth"
            onClick={() => setMenuOpen(false)}
            className="mt-2 inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md whitespace-nowrap"
          >
            Sign in
          </Link>
        </div>
      )}
    </header>
  );
}