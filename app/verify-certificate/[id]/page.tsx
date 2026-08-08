import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import VerifiedOutlined from "@mui/icons-material/VerifiedOutlined";

import { verifyCertificate } from "@/lib/certificate-verification";

export const dynamic = "force-dynamic";

export default async function VerifiedCertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const certificate = await verifyCertificate(id);

  if (!certificate) {
    return (
      <Stack spacing={3}>
        <Typography variant="h4">Certificate verification</Typography>
        <Alert severity="error">
          Invalid certificate. No matching certificate exists in UnivAI records.
        </Alert>
        <Button href="/verify-certificate" variant="outlined">
          Try another ID
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={1} className="align-center">
        <VerifiedOutlined color="success" fontSize="large" />
        <Typography variant="h4">Valid certificate</Typography>
      </Stack>
      <Alert severity="success">
        This certificate is authentic and matches the official UnivAI record.
      </Alert>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Grid container spacing={2} className="align-center">
              <Grid size="grow">
                <Typography variant="overline">Recipient</Typography>
                <Typography variant="h5">{certificate.recipientName}</Typography>
              </Grid>
              <Grid>
                <Chip color="success" label={`Grade ${certificate.letterGrade}`} />
              </Grid>
            </Grid>
            <Divider />
            <Typography variant="overline">Course</Typography>
            <Typography variant="h6">{certificate.courseTitle}</Typography>
            <Grid container spacing={3}>
              <Grid>
                <Typography variant="overline">Final result</Typography>
                <Typography>{certificate.totalPercentage.toFixed(2)}%</Typography>
              </Grid>
              <Grid>
                <Typography variant="overline">GPA</Typography>
                <Typography>{certificate.gpa.toFixed(2)} / 4.00</Typography>
              </Grid>
              <Grid>
                <Typography variant="overline">Completed</Typography>
                <Typography>{new Date(certificate.completedAt).toLocaleDateString("en-GB")}</Typography>
              </Grid>
            </Grid>
            <Divider />
            <Typography variant="body2" color="text.secondary">
              Certificate ID: {certificate.certificateId}
            </Typography>
          </Stack>
        </CardContent>
      </Card>
      <Button href="/verify-certificate" variant="outlined">
        Verify another certificate
      </Button>
    </Stack>
  );
}
