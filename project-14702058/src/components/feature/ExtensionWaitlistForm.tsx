import { useEffect, useState } from "react";
import { readWaitlistEmail, rememberWaitlistEmail } from "@/lib/extensionWaitlist";

const FORM_URL = "https://readdy.ai/api/form/dau10cb2asjjtt1skicg";

interface ExtensionWaitlistFormProps {
  /** Visual tone of the submit button. */
  tone?: "primary" | "secondary";
  /** Extra classes for the form row. */
  className?: string;
}

/**
 * "Email me when it's live" capture for the Connect extension (still in review).
 * Shared by the dashboard coming-soon panel and the public landing page. On a
 * successful signup it remembers the email locally, so a returning visitor sees
 * the confirmation state instead of the empty form.
 */
export default function ExtensionWaitlistForm({
  tone = "primary",
  className = "",
}: ExtensionWaitlistFormProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [formError, setFormError] = useState("");
  const [remembered, setRemembered] = useState(false);

  // A prior signup (from either surface) short-circuits straight to "on the list".
  useEffect(() => {
    setRemembered(readWaitlistEmail() !== null);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const honeypot = String(formData.get("company_alt") || "").trim();
    if (honeypot) {
      setStatus("success");
      form.reset();
      return;
    }
    formData.delete("company_alt");

    const email = String(formData.get("email") || "").trim();

    setStatus("loading");
    setFormError("");

    try {
      const params = new URLSearchParams();
      formData.forEach((v, k) => params.append(k, String(v)));
      const response = await fetch(FORM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const responseText = await response.text();
      let parsed: { code?: string; meta?: { message?: string; detail?: string } } | null = null;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed = null;
      }
      const serverMessage = parsed?.meta?.message || parsed?.meta?.detail || responseText;
      const looksSpam = /spam/i.test(serverMessage || "");

      if (!response.ok || parsed?.code !== "OK" || looksSpam) {
        setStatus("error");
        setFormError(serverMessage || "Something went wrong. Please try again.");
        return;
      }
      rememberWaitlistEmail(email);
      setStatus("success");
      form.reset();
    } catch {
      setStatus("error");
      setFormError("Network error — please check your connection and try again.");
    }
  };

  if (status === "success" || remembered) {
    return (
      <p className="flex items-center gap-2 text-xs font-medium text-primary-700">
        <i className="ri-check-line text-sm"></i>
        You&apos;re on the list — we&apos;ll email you the moment it&apos;s live.
      </p>
    );
  }

  const buttonTone =
    tone === "secondary"
      ? "bg-secondary-500 text-background-50 dark:text-foreground-950 hover:bg-secondary-600"
      : "bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600";

  return (
    <div className="space-y-2">
      <form
        onSubmit={handleSubmit}
        data-readdy-form
        id="extension-launch-waitlist"
        className={`flex flex-col sm:flex-row gap-2 ${className}`}
      >
        <input
          required
          type="email"
          name="email"
          placeholder="you@email.com"
          className="flex-1 min-w-0 text-sm px-3 py-2 rounded-md border border-background-300 bg-background-50 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className={`inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-md transition-colors cursor-pointer whitespace-nowrap disabled:opacity-70 ${buttonTone}`}
        >
          {status === "loading" ? (
            <i className="ri-loader-4-line animate-spin"></i>
          ) : (
            <i className="ri-mail-send-line"></i>
          )}
          Notify me
        </button>
        <input type="hidden" name="source" value="extension-coming-soon" />
        <div className="form-alt-field" aria-hidden="true">
          <label>
            Company
            <input
              type="text"
              name="company_alt"
              tabIndex={-1}
              autoComplete="off"
              readOnly
            />
          </label>
        </div>
      </form>
      {status === "error" && (
        <p className="text-[11px] text-accent-800 bg-accent-100 border border-accent-200 rounded-md px-2.5 py-1.5">
          {formError}
        </p>
      )}
    </div>
  );
}