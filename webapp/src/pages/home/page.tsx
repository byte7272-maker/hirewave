import Navbar from "@/pages/home/components/Navbar";
import Hero from "@/pages/home/components/Hero";
import TrustBar from "@/pages/home/components/TrustBar";
import Features from "@/pages/home/components/Features";
import HowItWorks from "@/pages/home/components/HowItWorks";
import ProductPreview from "@/pages/home/components/ProductPreview";
import InterviewPrep from "@/pages/home/components/InterviewPrep";
import Security from "@/pages/home/components/Security";
import Testimonials from "@/pages/home/components/Testimonials";
import Pricing from "@/pages/home/components/Pricing";
import FAQ from "@/pages/home/components/FAQ";
import CTA from "@/pages/home/components/CTA";
import Footer from "@/pages/home/components/Footer";

export default function Home() {
  return (
    <main className="bg-background-50 text-foreground-950 font-sans">
      <Navbar />
      <Hero />
      <TrustBar />
      <Features />
      <HowItWorks />
      <ProductPreview />
      <InterviewPrep />
      <Security />
      <Testimonials />
      <Pricing />
      <FAQ />
      <CTA />
      <Footer />
    </main>
  );
}