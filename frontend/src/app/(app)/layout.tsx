"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="auth-wrap">
        <span className="spinner" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="shell">
      <Sidebar />
      <main className="main" id="main">
        {children}
      </main>
    </div>
  );
}
