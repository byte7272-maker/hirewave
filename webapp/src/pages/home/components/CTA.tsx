import { useState } from "react";

const FORM_URL = "https://readdy.ai/api/form/d9ukcaorss1jkop7c0c0";

export default function CTA() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [formError, setFormError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const honeypot = String(formData.get("website_alt") || "").trim();
    if (honeypot) {
      setStatus("success");
      form.reset();
      return;
    }
    formData.delete("website_alt");

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
      setStatus("success");
      form.reset();
    } catch {
      setStatus("error");
      setFormError("Network error — please check your connection and try again.");
    }
  };

  return (
    <section id="cta" className="py-24 md:py-32 bg-background-50">
      <div className="w-full px-6 md:px-10 max-w-6xl mx-auto">
        <div className="relative rounded-3xl overflow-hidden bg-primary-950 text-background-50 p-10 md:p-16">
          <div className="absolute inset-0 -z-0">
            <img
              src="https://readdy.ai/api/search-image?query=Abstract%20elegant%20gradient%20background%20in%20deep%20forest%20emerald%20green%20with%20soft%20warm%20coral%20highlights%2C%20organic%20flowing%20shapes%2C%20editorial%20minimalist%20composition%2C%20subtle%20paper%20grain%20texture%2C%20golden%20hour%20lighting%2C%20magazine%20quality%20photography%2C%20warm%20sophisticated%20tones%2C%20blurred%20geometric%20forms&width=1800&height=900&seq=cta-hirewave-bg-01&orientation=landscape"
              alt=""
              className="w-full h-full object-cover object-top opacity-40"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-primary-950 via-primary-950/85 to-primary-900/70"></div>
          </div>
          <div className="relative grid lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7">
              <h2 className="font-heading text-4xl md:text-6xl leading-[1.05] tracking-tight text-background-50 font-medium">
                Your next job is
                <br />
                <span className="italic text-accent-400">already looking for you.</span>
              </h2>
              <p className="mt-5 text-lg text-background-200 max-w-xl leading-relaxed">
                Join the waitlist. We'll email you when a spot opens in your
                region — usually inside a week. First 5 applies are on us.
              </p>
              <div className="mt-8 flex flex-wrap gap-6 text-sm text-background-200">
                <span className="flex items-center gap-2">
                  <i className="ri-check-line text-accent-400"></i>
                  No credit card
                </span>
                <span className="flex items-center gap-2">
                  <i className="ri-check-line text-accent-400"></i>
                  Cancel anytime
                </span>
                <span className="flex items-center gap-2">
                  <i className="ri-check-line text-accent-400"></i>
                  Your data stays yours
                </span>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="bg-background-50 text-foreground-950 rounded-2xl p-6 md:p-7">
                {status === "success" ? (
                  <div className="text-center py-6">
                    <div className="w-14 h-14 flex items-center justify-center rounded-full bg-primary-100 text-primary-700 mx-auto mb-4">
                      <i className="ri-check-line text-3xl"></i>
                    </div>
                    <h3 className="font-heading text-2xl font-medium mb-2">
                      You're on the list
                    </h3>
                    <p className="text-sm text-foreground-700">
                      We'll be in touch within a few days. Watch your inbox.
                    </p>
                  </div>
                ) : (
                  <form
                    onSubmit={handleSubmit}
                    data-readdy-form
                    id="hirewave-waitlist"
                  >
                    <div className="mb-4">
                      <h3 className="font-heading text-2xl font-medium mb-1">
                        Get early access
                      </h3>
                      <p className="text-sm text-foreground-600">
                        Takes 20 seconds.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-foreground-700 mb-1.5">
                          Full name
                        </label>
                        <input
                          required
                          type="text"
                          name="full_name"
                          placeholder="Alex Kim"
                          className="w-full text-sm px-4 py-3 rounded-md border border-background-300 bg-background-50 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground-700 mb-1.5">
                          Work email
                        </label>
                        <input
                          required
                          type="email"
                          name="email"
                          placeholder="you@company.com"
                          className="w-full text-sm px-4 py-3 rounded-md border border-background-300 bg-background-50 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground-700 mb-1.5">
                          What role are you targeting?
                        </label>
                        <select
                          required
                          name="target_role"
                          defaultValue=""
                          className="w-full text-sm px-4 py-3 rounded-md border border-background-300 bg-background-50 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 pr-8"
                        >
                          <option value="" disabled>
                            Select one
                          </option>
                          <option>Engineering</option>
                          <option>Product</option>
                          <option>Design</option>
                          <option>Data / ML</option>
                          <option>Marketing</option>
                          <option>Sales</option>
                          <option>Operations</option>
                          <option>Other</option>
                        </select>
                      </div>

                      <div className="form-alt-field" aria-hidden="true">
                        <label>
                          Website
                          <input
                            type="text"
                            name="website_alt"
                            tabIndex={-1}
                            autoComplete="off"
                            readOnly
                          />
                        </label>
                      </div>

                      <button
                        type="submit"
                        disabled={status === "loading"}
                        className="w-full inline-flex items-center justify-center gap-2 bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-3.5 rounded-md text-sm font-semibold hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-70"
                      >
                        {status === "loading" ? (
                          <>
                            <i className="ri-loader-4-line animate-spin"></i>
                            Joining…
                          </>
                        ) : (
                          <>
                            Join the waitlist
                            <i className="ri-arrow-right-line"></i>
                          </>
                        )}
                      </button>

                      {status === "error" && (
                        <div className="text-xs text-accent-800 bg-accent-100 border border-accent-200 rounded-md px-3 py-2">
                          {formError}
                        </div>
                      )}

                      <p className="text-[11px] text-foreground-600 leading-relaxed text-center">
                        By joining you agree to our terms and privacy policy.
                      </p>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}