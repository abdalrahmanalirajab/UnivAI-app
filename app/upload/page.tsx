"use client";

import { useRouter } from "next/navigation";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useOnboarding } from "@/app/OnboardingProvider";
import MultiBookUploader from "@/app/library/MultiBookUploader";

export default function BooksPage() {
  const router = useRouter();
  const { refresh: refreshOnboarding } = useOnboarding();

  async function continueAfterUpload() {
    await refreshOnboarding();
    router.replace("/library?continue=curriculum");
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Upload your books</Typography>
      <Typography variant="body1" color="text.secondary">
        Choose one or more textbooks to begin. Every book is added to your
        library — your existing books, schedule and progress are kept.
      </Typography>
      <MultiBookUploader
        onDocumentsChange={() => void refreshOnboarding()}
        onAllUploadsComplete={continueAfterUpload}
      />
    </Stack>
  );
}
