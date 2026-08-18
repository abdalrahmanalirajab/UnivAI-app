import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";
import { getLectureMaterialAccess } from "@/lib/lecture-materials";
import { readScript, readSlides } from "@/lib/lectures";
import { requireLearningAction } from "@/lib/session";
import OutputFeedback from "@/app/components/OutputFeedback";
import { lectureFeedbackTarget } from "@/lib/ai-output-feedback-types";
import ArchiveBackButton from "./ArchiveBackButton";
import LectureArchive from "./LectureArchive";
import PracticeQuizButtons from "../PracticeQuizButtons";

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
    const makeupClosed = access.blockedReason === "makeup_completed"
      || access.blockedReason === "makeup_closed";
    return (
      <Stack spacing={3}>
        <Typography variant="h4">Week {access.week} presentation</Typography>
        <Alert severity={makeupClosed ? "warning" : "info"}>
          <AlertTitle>
            {makeupClosed ? "No replay for this make-up" : "Presentation unavailable"}
          </AlertTitle>
          {makeupClosed
            ? "This administrator-approved make-up was a one-time interactive lecture. It cannot be replayed after closing or completion."
            : "Join the lecture through your schedule when access is available."}
        </Alert>
        <ArchiveBackButton />
      </Stack>
    );
  }

  const [deck, script] = await Promise.all([
    readSlides(user.registrationNumber, id),
    readScript(user.registrationNumber, access.week),
  ]);

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="overline" color="text.secondary">
          Week {access.week} · completed lecture
        </Typography>
        <Typography variant="h4" data-generated-content="true" dir="auto">
          {access.title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Review the published presentation without changing your attendance record.
        </Typography>
      </Stack>

      {deck ? (
        <>
          <Stack data-generated-content="true" dir="auto">
            <LectureArchive deck={deck} narration={script?.segments ?? []} />
          </Stack>
          {access.artifactId && access.artifactVersion ? (
            <OutputFeedback
              target={lectureFeedbackTarget(access.artifactId, access.artifactVersion)}
            />
          ) : null}
        </>
      ) : (
        <Alert severity="warning">
          <AlertTitle>Presentation not ready</AlertTitle>
          The lecture has ended, but its presentation artifact has not been published yet.
        </Alert>
      )}

      <PracticeQuizButtons lectureId={id} />
      <ArchiveBackButton />
    </Stack>
  );
}
