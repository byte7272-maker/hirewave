"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

const LINKS = [
  { href: "/dashboard", label: "Overview", icon: "◧" },
  { href: "/matches", label: "Job Matches", icon: "◎" },
  { href: "/documents", label: "Documents", icon: "▤" },
  { href: "/interview", label: "Interview Prep", icon: "◆" },
  { href: "/applications", label: "Applications", icon: "➤" },
  { href: "/integrations", label: "Integrations", icon: "⚯" },
  { href: "/security", label: "Security", icon: "🛡" },
  { href: "/profile", label: "Profile", icon: "◔" },
  { href: "/notifications", label: "Notifications", icon: "◈" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <nav className="sidebar" aria-label="Primary">
      <div className="brand">
        <span className="brand-dot" aria-hidden>
          B
        </span>
        Bayete
      </div>
      {LINKS.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`nav-link ${active ? "active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span aria-hidden>{l.icon}</span>
            {l.label}
          </Link>
        );
      })}
      <div className="sidebar-foot">
        <div className="muted" style={{ marginBottom: 8, wordBreak: "break-all" }}>
          {user?.email}
        </div>
        <button
          className="btn ghost sm"
          onClick={async () => {
            await logout();
            router.push("/login");
          }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
