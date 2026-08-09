import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDocument } from "@/lib/collections";
import { requirePreparedSource } from "@/lib/session";

export default async function PdfReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  const documentId = Number(id);
  if (!Number.isSafeInteger(documentId)) notFound();

  const user = await requirePreparedSource(`/library/read/${id}`);
  const document = await getDocument(documentId, user.registrationNumber);
  if (!document) notFound();

  const contentUrl = `/api/documents/${document.id}/content`;

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Stack spacing={0.5}>
          <Typography variant="overline" color="text.secondary">
            Your source library
          </Typography>
          <Typography variant="h4">{document.filename}</Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button component={Link} href="/library">
            Back to library
          </Button>
          {document.status === "ready" ? (
            <Button
              component="a"
              href={contentUrl}
              target="_blank"
              rel="noopener"
              endIcon={<OpenInNewRounded />}
            >
              Open full screen
            </Button>
          ) : null}
        </Stack>
      </Stack>

      {document.status === "ready" ? (
        <Card variant="outlined">
          <CardContent>
            <iframe
              src={contentUrl}
              title={`Read ${document.filename}`}
              width="100%"
              height="760"
              frameBorder="0"
              referrerPolicy="same-origin"
            />
          </CardContent>
        </Card>
      ) : (
        <Alert severity="info">
          <AlertTitle>Your PDF is still being prepared</AlertTitle>
          Return when the source status is ready. Reading it here does not start or change course generation.
        </Alert>
      )}
    </Stack>
  );
}
