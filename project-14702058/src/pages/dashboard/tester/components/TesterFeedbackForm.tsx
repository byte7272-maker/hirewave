import { useEffect, useState } from "react";
import {
  readSetupProgress,
  setupProgressLabel,
  stuckStepLabel,
} from "@/lib/testerChecklist";

const FORM_URL = "https://readdy.ai/api/form/dauqfiuoc082o2i1js6g";

const AREAS = [
  "Installing the extension",
  "Connecting a site",
  "Résumé tailoring",
  "Applying / auto-apply",
  "Something else",
];

const RATINGS = [
  "Great so far",
  "Okay — a bit rough",
  "Ran into a problem",
];

interface ParsedResponse {
  code?: string;
  meta?: { message?: string; detail?: string };
  message?: string;
}

interface TesterFeedbackFormProps {
  /** A rating to pre-select (e.g. "Ran into a problem" from the Report a bug shortcut). */
  presetRating?: string;
  /** Bumping this token re-applies the preset, so repeated taps still work. */
  presetToken?: number;
}

/**
 * The tester-program feedback capture. Posts to the site's built-in form and
 * reports success/failure inline — never navigates away. Follows the same
 * honeypot + response-parse contract as the other forms in the app. A parent can
 * hand it a preset rating (via `presetRating` + `presetToken`) so shortcut
 * buttons like "Report a bug" land the tester on the right option instantly.
 */
export default function TesterFeedbackForm({ presetRating, presetToken }: TesterFeedbackFormProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [formError, setFormError] = useState("");
  const [area, setArea] = useState(AREAS[0]);
  const [rating, setRating] = useState(RATINGS[0]);
  // The first checklist step left unticked, surfaced so testers know the setup
  // context is attached automatically when they send feedback.
  const [stuckStep, setStuckStep] = useState(() => stuckStepLabel(readSetupProgress()));

  // Apply a preset whenever the parent bumps the token — repeated shortcut taps
  // still re-apply it. Reset any prior success/error so the form is submittable.
  useEffect(() => {
    if (!presetToken || !presetRating) return;
    setRating(presetRating);
    setStatus("idle");
    setFormError("");
    setStuckStep(stuckStepLabel(readSetupProgress()));
  }, [presetToken, presetRating]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    // Build the payload up front so browser AutoFill values are included.
    const formData = new FormData(form);

    // Honeypot: a filled field means a bot. Mimic success so it never learns.
    const honeypot = String(formData.get("company_alt") || "").trim();
    if (honeypot) {
      setStatus("success");
      form.reset();
      return;
    }
    formData.delete("company_alt");

    // Attach the tester's setup "abandon point" — the first checklist step they
    // left unfinished — so we can see which steps testers keep getting stuck on.
    // No backend needed: it rides along on the normal form submission.
    const progress = readSetupProgress();
    const stuckOn = stuckStepLabel(progress);
    const progressSummary = setupProgressLabel(progress);
    if (stuckOn) formData.append("setup_stuck_step", stuckOn);
    if (progressSummary) formData.append("setup_progress", progressSummary);

    setStatus("loading");
    setFormError("");

    try {
      const params = new URLSearchParams();
      formData.forEach((value, key) => params.append(key, String(value)));

      const response = await fetch(FORM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      const responseText = await response.text();
      let parsed: ParsedResponse | null = null;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed = null;
      }

      const serverMessage =
        parsed?.meta?.message || parsed?.meta?.detail || parsed?.message || responseText;
      const looksSpam = /spam/i.test(serverMessage || "");

      if (!response.ok || parsed?.code !== "OK" || looksSpam) {
        setStatus("error");
        setFormError(serverMessage || "Something went wrong. Please try again.");
        return;
      }

      setStatus("success");
      form.reset();
      setArea(AREAS[0]);
      setRating(RATINGS[0]);
    } catch {
      setStatus("error");
      setFormError("Network error — please check your connection and try again.");
    }
  };

  return (
    <section
      id="feedback"
      className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden animate-fade-in-up"
    >
      <div className="px-5 py-4 border-b border-background-200 flex items-center gap-2.5">
        <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-accent-100 text-accent-900 flex-shrink-0">
          <i className="ri-feedback-line"></i>
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-medium text-foreground-950">
            Send us feedback
          </h2>
          <p className="text-xs text-foreground-500 mt-0.5">
            Tell us what worked, what broke, or what you&apos;d change
          </p>
        </div>
      </div>

      {status === "success" ? (
        <div className="p-6 flex items-start gap-3">
          <span className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full bg-primary-100 text-primary-900 text-xl">
            <i className="ri-checkbox-circle-line"></i>
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground-950">Thanks — feedback received</h3>
            <p className="text-sm text-foreground-600 mt-1 leading-relaxed">
              We read every note from testers and it genuinely shapes the next build. If you left an
              email, we may follow up with a question or two.
            </p>
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-add-line"></i>
              Send another
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          data-readdy-form
          id="tester-feedback"
          className="p-5 space-y-4"
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                Your name <span className="text-foreground-400">(optional)</span>
              </span>
              <input
                type="text"
                name="name"
                placeholder="Alex Rivera"
                className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                Email
              </span>
              <input
                required
                type="email"
                name="email"
                placeholder="you@email.com"
                className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
              />
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                What&apos;s this about?
              </span>
              <select
                name="area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 cursor-pointer"
              >
                {AREAS.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                How&apos;s it going?
              </span>
              <select
                name="rating"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 cursor-pointer"
              >
                {RATINGS.map((rating) => (
                  <option key={rating} value={rating}>
                    {rating}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="block text-xs font-medium text-foreground-600 mb-1.5">
              Your feedback
            </span>
            <textarea
              required
              name="message"
              maxLength={500}
              rows={4}
              placeholder="What happened, what you expected, and anything you'd change…"
              className="w-full px-3 py-2.5 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 resize-y"
            ></textarea>
            <span className="block text-[11px] text-foreground-400 mt-1">
              Up to 500 characters
            </span>
          </label>

          {stuckStep && (
            <p className="text-xs text-secondary-900 bg-secondary-100 rounded-md px-3 py-2 flex items-start gap-1.5">
              <i className="ri-links-line text-sm mt-0.5 flex-shrink-0"></i>
              <span>
                We&apos;ll attach where you got stuck in setup —{" "}
                <span className="font-medium">&ldquo;{stuckStep}&rdquo;</span> — so you don&apos;t have
                to explain it.
              </span>
            </p>
          )}

          {status === "error" && (
            <p className="text-xs text-accent-800 bg-accent-100 border border-accent-200 rounded-md px-3 py-2">
              {formError}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <input type="hidden" name="source" value="tester-program" />
            <p className="text-xs text-foreground-500 flex items-center gap-1.5">
              <i className="ri-lock-line"></i>
              Goes straight to the {""}
              <span className="font-medium text-foreground-700">tester inbox</span>
            </p>
            <button
              type="submit"
              disabled={status === "loading"}
              className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {status === "loading" ? (
                <i className="ri-loader-4-line animate-spin"></i>
              ) : (
                <i className="ri-send-plane-line"></i>
              )}
              Send feedback
            </button>
          </div>

          {/* Anti-spam honeypot — hidden off-screen via .form-alt-field, never inline. */}
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
      )}
    </section>
  );
}