import type { Metadata } from "next";
import Stack from "@mui/material/Stack";
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
import content from "@/app/components/landing/content";

export const metadata: Metadata = {
  title: "UnivAI — Upload a textbook. Get a university.",
  description: content.hero.subhead,
  openGraph: {
    title: "UnivAI — Upload a textbook. Get a university.",
    description: content.hero.subhead,
    url: "https://univai.app",
    siteName: "UnivAI",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "https://univai.app/og-image.png",
        width: 1200,
        height: 630,
        alt: "UnivAI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "UnivAI — Upload a textbook. Get a university.",
    description: content.hero.subhead,
    images: ["https://univai.app/og-image.png"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "UnivAI",
      description: content.trustStrip.line,
      url: "https://univai.app",
    },
    {
      "@type": "Product",
      name: "UnivAI",
      description: content.hero.subhead,
      url: "https://univai.app",
      offers: {
        "@type": "Offer",
        description: "Upload one book and go through the full semester at no cost.",
      },
    },
  ],
};

export default function Home() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Stack spacing={4}>
        <Hero />
        <TrustStrip />
        <HowItWorks />
        <FeatureHighlights />
        <PromoVideo />
        <LiveSample />
        <SecondAudience />
        <FinalCta />
        <Faq />
        <Footer />
      </Stack>
    </main>
  );
}
