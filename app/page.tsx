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
  title: "Turn your textbook into a live university course",
  description:
    "Build a scheduled source-backed course with live voice lectures, synced slides, assessments, transcripts, and verifiable certificates.",
  openGraph: {
    title: "UnivAI — Your book becomes a complete course",
    description:
      "Live lectures, synced slides, assessments, transcripts, and certificates from the source you choose.",
    siteName: "UnivAI",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/images/family-learning-hero.webp",
        width: 1600,
        height: 800,
        alt: "A parent and student learning together with a book and laptop",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "UnivAI — Your book becomes a complete course",
    description:
      "Live lectures, synced slides, assessments, transcripts, and certificates from the source you choose.",
    images: ["/images/family-learning-hero.webp"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "UnivAI",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  description:
    "Build a scheduled source-backed course with live voice lectures, synced slides, assessments, transcripts, and verifiable certificates.",
  audience: {
    "@type": "EducationalAudience",
    educationalRole: ["student", "teacher", "parent"],
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
