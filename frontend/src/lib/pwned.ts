// k-anonymity password-exposure check (HIBP Pwned Passwords).
//
// The password NEVER leaves the browser: we compute its SHA-1 here, send only
// the first 5 hex chars of the hash to our backend (which proxies the range
// query), and match the remaining 35 chars against the response locally.

import { getAccess } from "./tokens";

export function subtleAvailable(): boolean {
  return typeof window !== "undefined" && !!window.crypto?.subtle;
}

async function sha1Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await window.crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** Returns how many times the password appears in known breaches (0 = not found). */
export async function checkPasswordPwned(password: string): Promise<number> {
  const hash = await sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const res = await fetch(`/api/v1/monitoring/password-range/${prefix}`, {
    headers: { Authorization: `Bearer ${getAccess() ?? ""}` },
  });
  if (!res.ok) throw new Error("password check failed");

  const text = await res.text();
  for (const line of text.split("\n")) {
    const [s, c] = line.trim().split(":");
    if (s === suffix) return parseInt(c, 10) || 0;
  }
  return 0;
}
