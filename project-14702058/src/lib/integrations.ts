import { api } from "./api";

// ---- Types ----

export interface Integration {
  provider?: string;
  id?: string;
  name?: string;
  connected?: boolean;
  email?: string;
  connected_at?: string;
  [key: string]: unknown;
}

export interface ConnectResponse {
  url?: string;
  redirect_url?: string;
  authorization_url?: string;
  auth_url?: string;
  [key: string]: unknown;
}

// ---- Integrations ----

export function listIntegrations() {
  return api<Integration[]>("/api/v1/integrations");
}

export function connectIntegration(provider: string) {
  return api<ConnectResponse>(`/api/v1/integrations/connect/${provider}`, {
    method: "POST",
  });
}

export function disconnectIntegration(provider: string) {
  return api<void>(`/api/v1/integrations/${provider}`, { method: "DELETE" });
}

export function importLinkedIn() {
  return api<unknown>("/api/v1/integrations/linkedin/import", { method: "POST" });
}

export function importLinkedInFile() {
  return api<unknown>("/api/v1/integrations/linkedin/import-file", { method: "POST" });
}

export interface ConnectedApp {
  provider?: string;
  key?: string;
  id?: string;
  name?: string;
  supports_auto_apply?: boolean;
  connected?: boolean;
  authenticated?: boolean;
  status?: string;
  method?: string;
  has_ai_access?: boolean;
  ai_access?: boolean;
  email?: string;
  connected_at?: string;
  last_connected_at?: string;
  label?: string;
  account_label?: string;
  [key: string]: unknown;
}

export function listConnectedApps() {
  return api<ConnectedApp[]>("/api/v1/integrations/connected-apps");
}

// ---- Connected-app helpers (shared by the app cards and the status row) ----

/** The connection state we surface, derived from `status` + the connected flags. */
export type ConnectedAppStatus = "connected" | "expired" | "revoked" | "disconnected";

/** Stable per-provider key used for lookups and memory. */
export function connectedAppKey(app: ConnectedApp): string {
  return String(app.provider ?? app.key ?? app.id ?? app.name ?? "").toLowerCase();
}

export function connectedAppStatus(app: ConnectedApp): ConnectedAppStatus {
  const raw = String(app.status ?? "").toLowerCase();
  if (raw === "expired") return "expired";
  if (raw === "revoked") return "revoked";
  if (raw === "connected") return "connected";
  const connected = !!(app.connected ?? app.authenticated);
  return connected ? "connected" : "disconnected";
}

/** True when a site has to be re-authenticated before auto-apply can resume. */
export function needsReconnect(app: ConnectedApp): boolean {
  const status = connectedAppStatus(app);
  return status === "expired" || status === "revoked";
}

/** Fired whenever the connected-apps set changes, so the status row can re-count. */
export const CONNECTIONS_CHANGED_EVENT = "hirewave:connections-changed";

export function notifyConnectionsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CONNECTIONS_CHANGED_EVENT));
  }
}