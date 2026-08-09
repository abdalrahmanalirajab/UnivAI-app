import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLectureMaterialAccess } from "@/lib/lecture-materials";
import { readSlides } from "@/lib/lectures";
import { requireLearningAction } from "@/lib/session";
import LectureArchive from "./LectureArchive";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function LectureArchivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const user = await requireLearningAction(`/lecture/${id}/archive`);
  const access = await getLectureMaterialAccess(user.registrationNumber, id);
  if (!access) notFound();

  if (access.mode !== "archive") {
    return (
      <Stack spacing={3}>
        <Typography variant="h4">Week {access.week} presentation</Typography>
        <Alert severity="info">
          <AlertTitle>Available after the lecture</AlertTitle>
          The read-only presentation unlocks when this lecture&apos;s scheduled time ends.
        </Alert>
        <Button component={Link} href="/schedule">
          Back to schedule
        </Button>
      </Stack>
    );
  }

  const deck = await readSlides(user.registrationNumber, id);

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="overline" color="text.secondary">
          Week {access.week} · completed lecture
        </Typography>
        <Typography variant="h4">{access.title}</Typography>
        <Typography variant="body2" color="text.secondary">
          Review the published presentation without changing your attendance record.
        </Typography>
      </Stack>

      {deck ? (
        <LectureArchive deck={deck} />
      ) : (
        <Alert severity="warning">
          <AlertTitle>Presentation not ready</AlertTitle>
          The lecture has ended, but its presentation artifact has not been published yet.
        </Alert>
      )}

      <Button component={Link} href="/schedule">
        Back to schedule
      </Button>
    </Stack>
  );
}
