import { APP_META, type AppMeta } from "@/pages/dashboard/autoapply/appMeta";

function titleCase(v: string): string {
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : v;
}

/**
 * Display metadata for a session's provider, reusing the app cards' icon + tone.
 * Shared by the Connected sites panel and the dashboard summary card so both
 * surfaces render a provider the same way.
 */
export function sessionMeta(provider: string): AppMeta {
  const key = String(provider ?? "").toLowerCase();
  return (
    APP_META[key] ?? {
      name: titleCase(provider) || "Site",
      icon: "ri-global-line",
      tone: "bg-foreground-800",
      loginUrl: "",
      desc: "",
    }
  );
}