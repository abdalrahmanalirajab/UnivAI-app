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

export default function Home() {
  return (
    <main>
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
