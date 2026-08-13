import Link from "next/link";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export default function LegalCenterPage() {
  return (
    <Stack spacing={3}>
      <Stack spacing={1} component="header">
        <Typography variant="overline" color="primary">Trust and control</Typography>
        <Typography variant="h2" component="h1">Privacy and Legal center</Typography>
        <Typography color="text.secondary">
          Read the current documents and use account settings to exercise available data controls.
        </Typography>
      </Stack>
      <Card variant="outlined" component={Link} href="/legal/eula">
        <CardContent>
          <Typography variant="h5">EULA and Content Use Agreement</Typography>
          <Typography color="text.secondary">
            Your responsibility for books, uploads, and acceptable use.
          </Typography>
        </CardContent>
      </Card>
      <Card variant="outlined" component={Link} href="/legal/privacy">
        <CardContent>
          <Typography variant="h5">Privacy Notice</Typography>
          <Typography color="text.secondary">
            What data is processed, why, and which controls are available.
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  );
}
