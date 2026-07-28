import type { Metadata } from "next";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
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

// TODO: replace with real production domain once decided
export const metadata: Metadata = {
  title: "UnivAI — Upload a textbook. Get a university.",
  description: content.hero.subhead,
  openGraph: {
    title: "UnivAI — Upload a textbook. Get a university.",
    description: content.hero.subhead,
    url: "/",
    siteName: "UnivAI",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "UnivAI — Upload a textbook. Get a university.",
    description: content.hero.subhead,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "UnivAI",
      description: content.trustStrip.line,
      url: "/",
    },
    {
      "@type": "Product",
      name: "UnivAI",
      description: content.hero.subhead,
      url: "/",
      offers: {
        "@type": "Offer",
        description: "Upload one book and go through the full semester at no cost.",
      },
    },
  ],
};

export default function Home() {
  return (
    <Box component="main">
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
    </Box>
  );
}
