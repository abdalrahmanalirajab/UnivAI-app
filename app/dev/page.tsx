import AdminPanelSettingsRounded from "@mui/icons-material/AdminPanelSettingsRounded";
import HubRounded from "@mui/icons-material/HubRounded";
import StorageRounded from "@mui/icons-material/StorageRounded";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export default function DeveloperDashboardPage() {
  return (
    <Container maxWidth="lg">
      <Stack spacing={3}>
        <Stack spacing={1}>
          <Chip icon={<HubRounded />} label="DEVELOPER ONLY" color="secondary" variant="outlined" />
          <Typography component="h1" variant="h3">DEV // COMMAND DECK</Typography>
          <Typography color="text.secondary">
            Final-demo operations, user inspection, and controlled database changes.
          </Typography>
        </Stack>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={1}>
                  <AdminPanelSettingsRounded color="primary" fontSize="large" />
                  <Typography component="h2" variant="h5">Admin Operations</Typography>
                  <Typography color="text.secondary">
                    Open the complete administration workspace for academic, reports, schedule, and platform operations.
                  </Typography>
                </Stack>
              </CardContent>
              <CardActions>
                <Button href="/admin" variant="contained">Enter admin</Button>
              </CardActions>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={1}>
                  <StorageRounded color="secondary" fontSize="large" />
                  <Typography component="h2" variant="h5">Player Nexus</Typography>
                  <Typography color="text.secondary">
                    Inspect a user as a human-readable profile, view their database footprint, and apply audited direct changes.
                  </Typography>
                </Stack>
              </CardContent>
              <CardActions>
                <Button href="/dev/player-nexus" color="secondary" variant="contained">Launch nexus</Button>
              </CardActions>
            </Card>
          </Grid>
        </Grid>
      </Stack>
    </Container>
  );
}
