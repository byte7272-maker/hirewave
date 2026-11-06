import { useEffect } from "react";
import Navbar from "@/pages/home/components/Navbar";
import Footer from "@/pages/home/components/Footer";
import { useBrandName, useExtensionName } from "@/hooks/useBranding";
import ExtensionHero from "@/pages/extension/components/ExtensionHero";
import ExtensionWorksWith from "@/pages/extension/components/ExtensionWorksWith";
import ExtensionDemo from "@/pages/extension/components/ExtensionDemo";
import ExtensionBenefits from "@/pages/extension/components/ExtensionBenefits";
import ExtensionHowItWorks from "@/pages/extension/components/ExtensionHowItWorks";
import ExtensionTrust from "@/pages/extension/components/ExtensionTrust";
import ExtensionFaq from "@/pages/extension/components/ExtensionFaq";
import ExtensionCta from "@/pages/extension/components/ExtensionCta";

/** Dedicated landing page for the Connect browser extension. */
export default function ExtensionLanding() {
  const brandName = useBrandName();
  const extensionName = useExtensionName();

  useEffect(() => {
    document.title = `${extensionName} — Connect any site in one click | ${brandName}`;
  }, [brandName, extensionName]);

  return (
    <main className="bg-background-50 text-foreground-950 font-sans">
      <Navbar />
      <ExtensionHero />
      <ExtensionWorksWith />
      <ExtensionDemo />
      <ExtensionBenefits />
      <ExtensionHowItWorks />
      <ExtensionTrust />
      <ExtensionFaq />
      <ExtensionCta />
      <Footer />
    </main>
  );
}