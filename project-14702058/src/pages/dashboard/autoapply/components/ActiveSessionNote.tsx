import { useEffect, useState } from "react";
import { listConnectedApps, type ConnectedApp } from "@/lib/integrations";

interface ActiveSessionNoteProps {
  context: "rules" | "queue";
}

/** A small inline note showing which connected session rules/queue items will run under. */
export default function ActiveSessionNote({ context }: ActiveSessionNoteProps) {
  const [session, setSession] = useState<ConnectedApp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    listConnectedApps()
      .then((apps) => {
        if (!active) return;
        const found = (apps ?? []).find(
          (a) => !!(a.connected ?? a.authenticated) && !!(a.supports_auto_apply ?? a.ai_access) && !!a.label
        );
        setSession(found ?? null);
      })
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) return null;

  if (session) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-secondary-100 text-secondary-900 px-4 py-2.5 text-sm">
        <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          <i className="ri-user-3-line"></i>
        </span>
        <span>
          {context === "rules" ? "Rules run under" : "Apply queue uses"} session{" "}
          <span className="font-semibold">{session.label}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg bg-background-100 border border-background-200 text-foreground-600 px-4 py-2.5 text-sm">
      <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
        <i className="ri-plug-line"></i>
      </span>
      <span>No connected session — connect an app so it can act on your behalf.</span>
    </div>
  );
}