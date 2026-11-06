import type { ReactNode } from "react";
import Navbar from "@/pages/home/components/Navbar";
import Footer from "@/pages/home/components/Footer";
import { useBrandName, useExtensionName } from "@/hooks/useBranding";

function buildSections(brandName: string, extName: string): { title: string; body: ReactNode }[] {
  return [
    {
      title: "What the extension does",
      body: (
        <p>
          When you click <strong>Connect this site</strong>: it reads the session cookies the job
          site set after you logged in on that site's own page; packages them; and sends them over
          HTTPS to the {brandName} API, matched to a short-lived, single-use pairing code you copied
          from the app. It takes no action on its own.
        </p>
      ),
    },
    {
      title: "What it accesses and why",
      body: (
        <ul className="space-y-3">
          <li>
            <strong>Cookies</strong> (limited to the job-site domains) — to capture the session.
          </li>
          <li>
            <strong>Active tab URL</strong> — only to auto-detect which supported job site you're on.
          </li>
          <li>
            <strong>Local storage</strong> — to remember the {brandName} API address.
          </li>
          <li>No browsing history is read or stored.</li>
        </ul>
      ),
    },
    {
      title: "What it never accesses",
      body: (
        <ul className="space-y-3">
          <li>
            <strong>Your passwords</strong> (never read, stored, or sent).
          </li>
          <li>
            <strong>Your {brandName} login token</strong> (the pairing code authorizes the attach
            instead).
          </li>
          <li>
            <strong>Any site other than</strong> the job sites you explicitly connect.
          </li>
        </ul>
      ),
    },
    {
      title: "What is sent, where, and how it's stored",
      body: (
        <ul className="space-y-3">
          <li>
            <strong>Sent:</strong> the selected site's session cookies + the pairing code + an
            optional label, to the {brandName} API over HTTPS.
          </li>
          <li>
            <strong>Stored by {brandName}:</strong> encrypted at rest, scoped to your account, used only
            for actions you request.
          </li>
          <li>
            <strong>Stored locally by the extension:</strong> only the API address — no cookies are
            retained after they're sent.
          </li>
        </ul>
      ),
    },
    {
      title: "Data sharing",
      body: (
        <p>{brandName} does not sell your data and does not share captured sessions with third parties.</p>
      ),
    },
    {
      title: "Your control",
      body: (
        <ul className="space-y-3">
          <li>The extension acts only when you click Connect.</li>
          <li>Pairing codes are single-use and expire (~10 minutes).</li>
          <li>You can disconnect a site anytime from {brandName}, which invalidates the session.</li>
          <li>Removing the extension stops all access immediately.</li>
        </ul>
      ),
    },
    {
      title: "Contact",
      body: (
        <p>For questions, contact the {brandName} team at the address on our website.</p>
      ),
    },
  ];
}

export default function Privacy() {
  const brandName = useBrandName();
  const extName = useExtensionName();
  const sections = buildSections(brandName, extName);

  return (
    <main className="bg-background-50 text-foreground-950 font-sans min-h-screen">
      <Navbar />

      <article className="pt-28 md:pt-32 pb-16 px-4 md:px-6">
        <div className="max-w-[760px] mx-auto">
          <header className="mb-10">
            <h1 className="font-heading text-3xl md:text-4xl font-semibold tracking-tight text-foreground-950">
              Privacy Policy — {extName}
            </h1>
            <p className="mt-3 text-sm font-medium text-foreground-600">
              Last updated: September 16, 2026
            </p>
          </header>

          <p className="text-base md:text-lg leading-relaxed text-foreground-800 mb-8">
            {extName} is a browser extension that lets you connect a job site (like LinkedIn
            or Indeed) to your {brandName} account so {brandName}'s assistant can act on that site on your
            behalf. This policy explains exactly what the extension accesses, what it sends, and
            what it never touches.
          </p>

          <div className="mb-10 bg-accent-100 border border-accent-300 rounded-lg px-5 py-4">
            <p className="text-sm md:text-base leading-relaxed text-accent-900">
              The extension captures your job-site session cookies — only when you click Connect,
              only for the site you choose — and sends them to {brandName} against a one-time pairing
              code. It never reads, stores, or transmits your password.
            </p>
          </div>

          <div className="space-y-10">
            {sections.map((s) => (
              <section key={s.title}>
                <h2 className="font-heading text-xl md:text-2xl font-semibold text-foreground-950 mb-3">
                  {s.title}
                </h2>
                <div className="text-base leading-relaxed text-foreground-700">{s.body}</div>
              </section>
            ))}
          </div>
        </div>
      </article>

      <Footer />
    </main>
  );
}