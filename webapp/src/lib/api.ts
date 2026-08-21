// Typed fetch wrapper for the Job-Search Platform API (proxied at /api).
import { clearTokens, getAccess } from "./tokens";
import { refreshAccess } from "./session";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function extractError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail))
      return data.detail
        .map((d: { loc?: string[]; msg?: string }) => `${d.loc?.slice(1).join(".") ?? ""}: ${d.msg ?? ""}`.trim())
        .join("; ");
    return JSON.stringify(data);
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

interface Options {
  method?: string;
  body?: unknown;
  auth?: boolean;
  retry?: boolean;
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const { method = "GET", body, auth = true, retry = true } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getAccess();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && auth && retry) {
    if (await refreshAccess()) return api<T>(path, { ...opts, retry: false });
    clearTokens();
    throw new ApiError(401, "Session expired — please sign in again.");
  }
  if (!res.ok) throw new ApiError(res.status, await extractError(res));
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Multipart upload with bearer + one refresh retry. */
export async function apiUpload<T>(path: string, form: FormData, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getAccess();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { method: "POST", headers, body: form });
  if (res.status === 401 && retry) {
    if (await refreshAccess()) return apiUpload<T>(path, form, false);
    clearTokens();
    throw new ApiError(401, "Session expired — please sign in again.");
  }
  if (!res.ok) throw new ApiError(res.status, await extractError(res));
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
