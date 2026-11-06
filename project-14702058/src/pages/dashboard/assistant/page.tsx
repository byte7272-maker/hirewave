import { useState } from "react";
import ConsentSettings from "@/pages/dashboard/assistant/components/ConsentSettings";
import ActivityLog from "@/pages/dashboard/assistant/components/ActivityLog";
import AutofillPreview from "@/pages/dashboard/assistant/components/AutofillPreview";

type Tab = "settings" | "autofill";

const TABS: { id: Tab; label: string }[] = [
  { id: "settings", label: "Permissions & activity" },
  { id: "autofill", label: "Auto-fill preview" },
];

export default function Assistant() {
  const [tab, setTab] = useState<Tab>("settings");

  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">
            Automation assistant
          </h1>
          <p className="text-sm text-foreground-600 mt-1">
            Let the assistant draft documents and fill applications — always with your approval.
          </p>
        </div>
        <div className="inline-flex items-center gap-1 bg-background-100 border border-background-200 rounded-full px-1 py-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                tab === t.id
                  ? "bg-background-50 text-foreground-950 border border-background-200"
                  : "text-foreground-600 hover:text-foreground-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <div className="animate-fade-in-up" style={{ animationDelay: "0.06s" }}>
        {tab === "settings" ? (
          <div className="space-y-6">
            <ConsentSettings />
            <ActivityLog />
          </div>
        ) : (
          <AutofillPreview />
        )}
      </div>
    </div>
  );
}