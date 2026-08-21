import { useState } from "react";

const ITEMS = [
  {
    q: "Do you actually submit applications for me?",
    a: "Yes — but only after you approve the tailored résumé and cover letter. The approval gate is enforced server-side, so nothing gets sent behind your back. We currently support Gmail, LinkedIn Easy Apply, and Indeed; Greenhouse and Workday fall back to a pre-filled manual link.",
  },
  {
    q: "Is my LinkedIn password stored anywhere?",
    a: "Never. We use OAuth 2.0 with PKCE for every integration — you sign in on the provider's own page and we only receive short-lived tokens, which are AES-256-GCM encrypted at rest. For LinkedIn Easy Apply, we drive a browser session you've already authenticated in — no credentials touch our servers.",
  },
  {
    q: "What happens with CAPTCHAs or weird required questions?",
    a: "The automation is designed to fail safely. If a CAPTCHA appears, we escalate it to you. If a required question has no matching profile data, we never fabricate an answer — we drop to a manual fallback with a pre-filled link and instructions.",
  },
  {
    q: "Can I bring my own résumé instead of AI-generated?",
    a: "Absolutely. Upload a PDF or DOCX and Hirewave will extract the content to power matching, interview prep and ATS previews. When you apply, the real file you uploaded gets attached — not a generated markdown copy.",
  },
  {
    q: "Which AI models power the tailoring?",
    a: "Claude Opus 4.8 by default for résumé and cover-letter generation; OpenAI text-embedding-3-small for semantic matching. You can swap providers in settings, or run everything fully offline with our deterministic mock model — great for privacy-sensitive users.",
  },
  {
    q: "Do you offer refunds?",
    a: "14-day money back on every paid plan, no questions asked. If Hirewave hasn't gotten you an interview in 30 days on the Focused plan, we'll refund your first month and comp the second.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="py-24 md:py-32 bg-background-100/60">
      <div className="w-full px-6 md:px-10 max-w-4xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-xs uppercase tracking-[0.2em] text-foreground-600 font-semibold mb-4">
            Questions & answers
          </p>
          <h2 className="font-heading text-4xl md:text-6xl leading-[1.05] tracking-tight text-foreground-950 font-medium">
            The things people <span className="italic">actually ask</span>
          </h2>
        </div>

        <div className="space-y-3">
          {ITEMS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div
                key={item.q}
                className="bg-background-50 border border-background-200 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer"
                >
                  <span className="font-heading text-lg text-foreground-950 font-medium">
                    {item.q}
                  </span>
                  <span
                    className={`w-8 h-8 flex items-center justify-center rounded-full bg-background-100 text-foreground-800 transition-transform ${
                      isOpen ? "rotate-45 bg-primary-500 text-background-50" : ""
                    }`}
                  >
                    <i className="ri-add-line"></i>
                  </span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-foreground-700 text-base leading-relaxed border-t border-background-200 pt-4">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}