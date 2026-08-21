// k-anonymity password check — password never leaves the browser.
import { getAccess } from "./tokens";

export function subtleAvailable(): boolean {
  return typeof window !== "undefined" && !!window.crypto?.subtle;
}

async function sha1Hex(text: string): Promise<string> {
  const digest = await window.crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

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
