import type { Metadata } from "next";
import Hero from "@/app/components/landing/Hero";
import TrustStrip from "@/app/components/landing/TrustStrip";
import HowItWorks from "@/app/components/landing/HowItWorks";
import FeatureHighlights from "@/app/components/landing/FeatureHighlights";
import PromoVideo from "@/app/components/landing/PromoVideo";
import LiveSample from "@/app/components/landing/LiveSample";
import SecondAudience from "@/app/components/landing/SecondAudience";
import FinalCta from "@/app/components/landing/FinalCta";
import Faq from "@/app/components/landing/Faq";
import Footer from "@/app/components/landing/Footer";

export const metadata: Metadata = {
  title: "Build job-ready skills—fast and in order",
  description:
    "A structured AI learning platform for ambitious fresh graduates and early-career professionals who want to close skill gaps and stay competitive.",
  openGraph: {
    title: "UnivAI — Build job-ready skills, fast and in order",
    description:
      "Turn trusted material into an ordered learning path with live lectures, practice, assessments, and visible progress.",
    siteName: "UnivAI",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "UnivAI — Build job-ready skills, fast and in order",
    description:
      "An ordered, source-backed learning path for ambitious fresh graduates and early-career professionals.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "UnivAI",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  description:
    "Build job-ready skills through an ordered, source-backed course with live voice lectures, practice, assessments, and verifiable progress.",
  audience: {
    "@type": "EducationalAudience",
    educationalRole: ["student", "professional"],
    audienceType: "Fresh graduates and early-career professionals",
  },
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Hero />
      <TrustStrip />
      <HowItWorks />
      <LiveSample />
      <FeatureHighlights />
      <PromoVideo />
      <SecondAudience />
      <FinalCta />
      <Faq />
      <Footer />
    </>
  );
}
