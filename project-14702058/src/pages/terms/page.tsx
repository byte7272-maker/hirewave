import type { ReactNode } from "react";
import Navbar from "@/pages/home/components/Navbar";
import Footer from "@/pages/home/components/Footer";
import { useBrandName, useExtensionName } from "@/hooks/useBranding";

function buildSections(brandName: string, extName: string): { title: string; body: ReactNode }[] {
  return [
    {
      title: "Acceptance of terms",
      body: (
        <p>
          By accessing or using {brandName} — including the {brandName} website, the {extName}{" "}
          browser extension, and any related services (together, the "Service") — you agree to be
          bound by these Terms of Service. If you do not agree, do not use the Service.
        </p>
      ),
    },
    {
      title: "The service",
      body: (
        <p>
          {brandName} is an AI-powered job-search assistant. It helps you find roles, tailor application
          materials, prepare for interviews, and — through the {extName} extension — act on
          supported job sites on your behalf. Features may change, be added, or be removed at any
          time at our discretion.
        </p>
      ),
    },
    {
      title: "Your account",
      body: (
        <ul className="space-y-3">
          <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
          <li>You must provide accurate information and keep it up to date.</li>
          <li>You must be at least 18 years old (or the age of majority in your jurisdiction) to use the Service.</li>
        </ul>
      ),
    },
    {
      title: `${extName} extension`,
      body: (
        <ul className="space-y-3">
          <li>The extension connects a job site you choose to your {brandName} account so the assistant can act on that site for you.</li>
          <li>It acts only when you explicitly click <strong>Connect</strong>, and only for the site you select.</li>
          <li>You are responsible for ensuring your use of the extension complies with the terms of the job sites you connect.</li>
          <li>You may disconnect a site at any time; doing so invalidates the associated session.</li>
        </ul>
      ),
    },
    {
      title: "Acceptable use",
      body: (
        <ul className="space-y-3">
          <li>Do not use the Service for any unlawful, fraudulent, or harmful purpose.</li>
          <li>Do not attempt to access accounts, data, or systems you are not authorized to use.</li>
          <li>Do not attempt to reverse-engineer, disrupt, or interfere with the Service.</li>
          <li>Do not misrepresent your identity, qualifications, or application materials.</li>
        </ul>
      ),
    },
    {
      title: "Your content & data",
      body: (
        <p>
          You retain ownership of the content you provide. You grant {brandName} a limited license to use
          that content solely to operate and improve the Service. You are responsible for ensuring you
          have the right to submit any content you provide.
        </p>
      ),
    },
    {
      title: "Third-party services",
      body: (
        <p>
          The Service may integrate with or act on third-party platforms such as LinkedIn and Indeed.
          Those platforms are governed by their own terms and policies, and {brandName} is not
          responsible for their availability, content, or practices.
        </p>
      ),
    },
    {
      title: "Fees & subscriptions",
      body: (
        <p>
          Certain features may require a paid subscription. Fees are billed as described at the time of
          purchase and are non-refundable except as required by law or stated in a specific offer. We
          may change pricing with reasonable notice.
        </p>
      ),
    },
    {
      title: "Intellectual property",
      body: (
        <p>
          The Service and all related software, design, and branding are owned by {brandName} and its
          licensors. These Terms do not grant you any rights to our intellectual property except the
          limited right to use the Service as described here.
        </p>
      ),
    },
    {
      title: "Disclaimer of warranties",
      body: (
        <p>
          The Service is provided "as is" and "as available," without warranties of any kind, whether
          express or implied, including merchantability, fitness for a particular purpose, and
          non-infringement. We do not guarantee that the Service will be uninterrupted, error-free, or
          that results will meet your expectations.
        </p>
      ),
    },
    {
      title: "Limitation of liability",
      body: (
        <p>
          To the maximum extent permitted by law, {brandName} shall not be liable for any indirect,
          incidental, special, consequential, or punitive damages, or any loss of profits, data, or
          opportunities, arising out of or related to your use of the Service.
        </p>
      ),
    },
    {
      title: "Termination",
      body: (
        <p>
          You may stop using the Service at any time. We may suspend or terminate your access if you
          violate these Terms or if we discontinue the Service, with or without notice and without
          liability.
        </p>
      ),
    },
    {
      title: "Changes to these terms",
      body: (
        <p>
          We may update these Terms from time to time. Material changes will be posted on this page
          with an updated effective date. Your continued use of the Service after changes take effect
          constitutes acceptance of the revised Terms.
        </p>
      ),
    },
    {
      title: "Governing law",
      body: (
        <p>
          These Terms are governed by the laws of the State of New York, without regard to its conflict
          of law principles. Any disputes shall be resolved in the courts located in New York, New
          York.
        </p>
      ),
    },
    {
      title: "Contact",
      body: (
        <p>For questions about these Terms, contact the {brandName} team at the address on our website.</p>
      ),
    },
  ];
}

export default function Terms() {
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
              Terms of Service — {brandName}
            </h1>
            <p className="mt-3 text-sm font-medium text-foreground-600">
              Last updated: September 16, 2026
            </p>
          </header>

          <p className="text-base md:text-lg leading-relaxed text-foreground-800 mb-8">
            These Terms of Service govern your use of {brandName} — our AI job-search assistant, the{" "}
            {extName} browser extension, and related services. By using the Service, you agree
            to these Terms. Please read them carefully.
          </p>

          <div className="mb-10 bg-accent-100 border border-accent-300 rounded-lg px-5 py-4">
            <p className="text-sm md:text-base leading-relaxed text-accent-900">
              By using {brandName} or the {extName} extension, you agree to these Terms. The
              extension only connects job sites you explicitly choose, acts only when you click
              Connect, and never touches your passwords.
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