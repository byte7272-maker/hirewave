// Download job recommendations as CSV/JSON. Needs the bearer token, so it
// fetches with auth and streams the response to a browser download.
import { getAccess } from "./tokens";

export interface ExportRow {
  rank: number;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  fit_score: number;
  authenticity_score: number | null;
  matching_skills: string[];
  gap_skills: string[];
  url: string;
  job_id: string;
}

/** Fetch the ranked recommendations as structured rows (for the PDF shortlist). */
export async function fetchExportRows(ids?: string[]): Promise<ExportRow[]> {
  const params = new URLSearchParams({ format: "json" });
  if (ids && ids.length) params.set("ids", ids.join(","));
  const res = await fetch(`/api/v1/jobs/matches/export?${params.toString()}`, {
    headers: { Authorization: `Bearer ${getAccess() ?? ""}` },
  });
  if (!res.ok) throw new Error(`export failed (${res.status})`);
  const data = await res.json();
  return (data.matches ?? []) as ExportRow[];
}

export async function downloadMatches(format: "csv" | "json", ids?: string[]): Promise<void> {
  const params = new URLSearchParams({ format });
  if (ids && ids.length) params.set("ids", ids.join(","));
  const res = await fetch(`/api/v1/jobs/matches/export?${params.toString()}`, {
    headers: { Authorization: `Bearer ${getAccess() ?? ""}` },
  });
  if (!res.ok) throw new Error(`export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `job-recommendations.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
