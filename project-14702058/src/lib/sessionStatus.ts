import type { AutoApplySession } from "./autoApply";

/**
 * Shared helpers for the job-site sessions the Connect extension links.
 * Used by the ConnectedSitesPanel and the dashboard's Connected sites summary
 * so both surfaces agree on state, expiry and freshness.
 */

/**
 * The states we surface from a session's `status`.
 *
 * A connected site is a BrowserSession whose status is one of
 * `active | expired | revoked` — there is NO "connected" status on a session
 * (that string exists only on the transient pairing handshake). So we key off
 * `active`: it is exactly what "connected" means to the user. `revoked` is
 * surfaced as its own state so callers can ignore it.
 */
export type SessionState = "active" | "expired" | "revoked" | "unknown";

export function sessionState(session: AutoApplySession): SessionState {
  const raw = String(session.status ?? "").toLowerCase();
  if (raw === "active") return "active";
  if (raw === "expired") return "expired";
  if (raw === "revoked") return "revoked";
  return "unknown";
}

/** True when the session is live and the extension can act on the site. */
export function isSessionActive(session: AutoApplySession): boolean {
  return sessionState(session) === "active";
}

export function formatSessionDate(v?: string): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function sessionTimeAgo(v?: string): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  return formatSessionDate(v);
}

export interface ExpiryInfo {
  label: string;
  tone: "expired" | "soon";
}

/** "Expired" when past, "Expires {date}" when within a few days, else nothing. */
export function sessionExpiry(expiresAt?: string): ExpiryInfo | null {
  if (!expiresAt) return null;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return null;
  const now = Date.now();
  if (t <= now) return { label: "Expired", tone: "expired" };
  const days = Math.ceil((t - now) / 86_400_000);
  if (days <= 3) return { label: `Expires ${formatSessionDate(expiresAt)}`, tone: "soon" };
  return null;
}

/** How recently a session was last used, bucketed for a glanceable badge. */
export type FreshnessState = "fresh" | "today" | "week" | "stale";

export interface FreshnessInfo {
  state: FreshnessState;
}

export function sessionFreshness(lastUsedAt?: string): FreshnessInfo | null {
  if (!lastUsedAt) return null;
  const t = new Date(lastUsedAt).getTime();
  if (Number.isNaN(t)) return null;
  const hours = (Date.now() - t) / 3_600_000;
  if (hours < 2) return { state: "fresh" };
  if (hours < 24) return { state: "today" };
  if (hours < 24 * 7) return { state: "week" };
  return { state: "stale" };
}

/** A session needs reconnect when its status is expired or its expiry has passed. */
export function isSessionExpired(session: AutoApplySession): boolean {
  return sessionState(session) === "expired" || sessionExpiry(session.expires_at)?.tone === "expired";
}

export interface SessionsSummary {
  total: number;
  connected: number;
  expired: number;
  expiring: number;
}

/**
 * Roll a session list into the counts the summary surfaces need.
 *
 * A "connected" site is a session whose status is `active` — never the literal
 * `"connected"` (that string only exists on the pairing handshake). `expired`
 * sessions are counted separately (they render as "Needs reconnect"), and
 * `revoked` sessions are ignored entirely — they are neither connected nor
 * listed. Both the dashboard counter and the Connected sites panel derive from
 * these same numbers, so the two surfaces always agree.
 */
export function summarizeSessions(sessions: AutoApplySession[]): SessionsSummary {
  let connected = 0;
  let expired = 0;
  let expiring = 0;
  let total = 0;
  for (const session of sessions) {
    const state = sessionState(session);
    // A revoked session is no longer a connected site — ignore it completely.
    if (state === "revoked") continue;
    total += 1;
    const expiry = sessionExpiry(session.expires_at);
    if (state === "expired" || expiry?.tone === "expired") {
      expired += 1;
    } else {
      if (state === "active") connected += 1;
      if (expiry?.tone === "soon") expiring += 1;
    }
  }
  return { total, connected, expired, expiring };
}

/** Whole days since a timestamp, floored; null when it's missing or invalid. */
export function daysSince(v?: string): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** Why a session is worth surfacing for a quick reconnect. */
export type SessionAttention = "expired" | "expiring";

/** "expired" when it has lapsed, "expiring" when it's within a few days, else null. */
export function sessionAttention(session: AutoApplySession): SessionAttention | null {
  if (isSessionExpired(session)) return "expired";
  if (sessionExpiry(session.expires_at)?.tone === "soon") return "expiring";
  return null;
}

/** The subset of sessions worth a one-tap reconnect. */
export function attentionSessions(sessions: AutoApplySession[]): AutoApplySession[] {
  return sessions.filter((s) => sessionAttention(s) !== null);
}

/** A session unused for this many days (or never used this long after connecting) gets flagged. */
export const HYGIENE_STALE_DAYS = 30;

export interface HygieneInfo {
  label: string;
  icon: string;
}

/**
 * A gentle housekeeping nudge for cold sessions: one whose last use is 30+ days
 * old, or one connected 30+ days ago that was never used. Sessions used recently
 * (or freshly connected) return null so nothing nags prematurely.
 */
export function sessionHygiene(session: AutoApplySession): HygieneInfo | null {
  const used = daysSince(session.last_used_at);
  if (used !== null) {
    if (used < HYGIENE_STALE_DAYS) return null;
    return {
      label: `Last connected ${used} days ago — disconnect if you no longer need this site.`,
      icon: "ri-eraser-line",
    };
  }
  const connected = daysSince(session.created_at);
  if (connected !== null && connected >= HYGIENE_STALE_DAYS) {
    return {
      label: `Never used since connecting ${connected} days ago — safe to disconnect.`,
      icon: "ri-question-line",
    };
  }
  return null;
}