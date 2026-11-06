import { connectedAppKey, type ConnectedApp } from "@/lib/integrations";

/** Display metadata for a connectable app / job site. */
export interface AppMeta {
  name: string;
  icon: string;
  tone: string;
  loginUrl: string;
  desc: string;
}

export const APP_META: Record<string, AppMeta> = {
  linkedin: {
    name: "LinkedIn",
    icon: "ri-linkedin-fill",
    tone: "bg-primary-500",
    loginUrl: "https://www.linkedin.com/login",
    desc: "Apply to LinkedIn Easy Apply postings with one click.",
  },
  indeed: {
    name: "Indeed",
    icon: "ri-search-line",
    tone: "bg-accent-500",
    loginUrl: "https://www.indeed.com/account/login",
    desc: "Apply to Indeed postings through assisted apply.",
  },
  greenhouse: {
    name: "Greenhouse",
    icon: "ri-building-2-line",
    tone: "bg-secondary-500",
    loginUrl: "https://boards.greenhouse.io",
    desc: "Assisted apply across Greenhouse-hosted roles.",
  },
  lever: {
    name: "Lever",
    icon: "ri-briefcase-line",
    tone: "bg-foreground-800",
    loginUrl: "https://jobs.lever.co",
    desc: "Assisted apply across Lever-hosted roles.",
  },
  gmail: {
    name: "Gmail",
    icon: "ri-mail-line",
    tone: "bg-accent-500",
    loginUrl: "https://accounts.google.com/signin",
    desc: "Sync forwarded job alerts into your inbox.",
  },
};

/** Metadata for a connected-app row, falling back to a generic entry. */
export function appMetaFor(app: ConnectedApp): AppMeta {
  const key = connectedAppKey(app);
  return (
    APP_META[key] ?? {
      name: app.name ?? (key || "App"),
      icon: "ri-plug-line",
      tone: "bg-foreground-800",
      loginUrl: "",
      desc: "",
    }
  );
}