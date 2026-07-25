import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid2";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import content from "./content";

export default function FeatureHighlights() {
  const { featureHighlights } = content;

  return (
    <section aria-label="FeatureHighlights">
      <Container maxWidth="lg">
        <Stack spacing={4}>
          <Typography variant="h2" component="p">
            Feature highlights
          </Typography>
          <Stack spacing={6}>
            {featureHighlights.map((feature, index) => (
              <Grid
                key={feature.title}
                container
                spacing={4}
                direction={index % 2 === 0 ? "row" : "row-reverse"}
                alignItems="center"
              >
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper variant="outlined">
                    <Typography variant="body2" color="text.secondary" align="center">
                      Media placeholder
                    </Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Stack spacing={2}>
                    <Grid container spacing={1} alignItems="center">
                      <Grid>
                        <Typography variant="h5" component="h3">
                          {feature.title}
                        </Typography>
                      </Grid>
                      {feature.comingSoon && (
                        <Grid>
                          <Chip label="Coming soon" size="small" />
                        </Grid>
                      )}
                    </Grid>
                    <Typography variant="body1" color="text.secondary">
                      {feature.body}
                    </Typography>
                    {feature.comingSoon ? (
                      <Button variant="outlined" disabled>
                        Learn more
                      </Button>
                    ) : feature.linkLabel ? (
                      <Button variant="outlined">
                        {feature.linkLabel}
                      </Button>
                    ) : null}
                  </Stack>
                </Grid>
              </Grid>
            ))}
          </Stack>
        </Stack>
      </Container>
    </section>
  );
}
