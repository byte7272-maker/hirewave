import { api } from "./api";

// ---- Types ----

export interface Identifier {
  id: string | number;
  type?: string;
  value?: string;
  verified?: boolean;
  status?: string;
  breach_count?: number;
  created_at?: string;
  [key: string]: unknown;
}

export interface Finding {
  id: string | number;
  identifier?: string;
  breach?: string;
  source?: string;
  severity?: string;
  exposed_fields?: string[] | string;
  detected_at?: string;
  acknowledged?: boolean;
  [key: string]: unknown;
}

// ---- Monitoring ----

export function enrollIdentifier(body: { type?: string; value?: string; [k: string]: unknown }) {
  return api<Identifier>("/api/v1/monitoring/identifiers", { method: "POST", body });
}

export function verifyIdentifier(id: string | number) {
  return api<Identifier>(`/api/v1/monitoring/identifiers/${id}/verify`, { method: "POST" });
}

export function listIdentifiers() {
  return api<Identifier[]>("/api/v1/monitoring/identifiers");
}

export function runScan() {
  return api<unknown>("/api/v1/monitoring/scan", { method: "POST" });
}

export function listFindings() {
  return api<Finding[]>("/api/v1/monitoring/findings");
}

export function acknowledgeFinding(id: string | number) {
  return api<unknown>(`/api/v1/monitoring/findings/${id}/acknowledge`, { method: "PUT" });
}