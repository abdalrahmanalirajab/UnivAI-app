import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid2";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import content from "./content";

export default function SecondAudience() {
  const { secondAudience } = content;

  return (
    <Paper square component="section" aria-label="SecondAudience">
      <Container maxWidth="lg">
        <Stack spacing={2}>
          <Typography variant="h2" component="p">
            {secondAudience.heading}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {secondAudience.body}
          </Typography>
          <Grid container spacing={1} alignItems="center">
            <Grid>
              <Button variant="contained" disabled>
                {secondAudience.ctaLabel}
              </Button>
            </Grid>
            <Grid>
              <Chip label={secondAudience.comingSoonLabel} size="small" />
            </Grid>
          </Grid>
        </Stack>
      </Container>
    </Paper>
  );
}
