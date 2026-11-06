import { useState } from "react";

const INITIAL: { id: string; name: string; desc: string; icon: string; connected: boolean }[] = [
  { id: "linkedin", name: "LinkedIn", desc: "Apply + messages", icon: "ri-linkedin-fill", connected: true },
  { id: "gmail", name: "Gmail", desc: "Reply inbox", icon: "ri-mail-fill", connected: true },
  { id: "drive", name: "Google Drive", desc: "Resume storage", icon: "ri-cloud-fill", connected: true },
  { id: "indeed", name: "Indeed", desc: "Auto-apply", icon: "ri-search-line", connected: true },
  { id: "greenhouse", name: "Greenhouse", desc: "Status sync", icon: "ri-building-2-line", connected: false },
  { id: "workday", name: "Workday", desc: "Status sync", icon: "ri-briefcase-line", connected: false },
];

export default function IntegrationsMock() {
  const [items, setItems] = useState(INITIAL);

  const toggle = (id: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, connected: !it.connected } : it
      )
    );
  };

  return (
    <div className="bg-background-50 border border-background-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-background-200 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 flex items-center justify-center rounded-full bg-background-300"></span>
          <span className="w-2.5 h-2.5 flex items-center justify-center rounded-full bg-background-300"></span>
          <span className="w-2.5 h-2.5 flex items-center justify-center rounded-full bg-background-300"></span>
        </div>
        <span className="text-xs font-mono text-foreground-500">
          connections · OAuth 2.0
        </span>
      </div>

      <div className="p-4 space-y-2">
        {items.map((it) => (
          <div
            key={it.id}
            className="flex items-center gap-3 p-3 rounded-xl bg-background-100/60 border border-background-200"
          >
            <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-background-50 border border-background-200 text-foreground-700 flex-shrink-0">
              <i className={`${it.icon} text-xl`}></i>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground-950">
                {it.name}
              </div>
              <div className="text-xs text-foreground-600">{it.desc}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={it.connected}
              onClick={() => toggle(it.id)}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                it.connected ? "bg-primary-500" : "bg-background-300"
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-background-50 shadow-sm transition-all ${
                  it.connected ? "left-[22px]" : "left-0.5"
                }`}
              ></span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}