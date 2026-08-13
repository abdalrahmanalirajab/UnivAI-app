"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import CheckCircleOutlineRounded from "@mui/icons-material/CheckCircleOutlineRounded";
import LockOutlined from "@mui/icons-material/LockOutlined";
import RaiseHandTeaser from "./RaiseHandTeaser";
import content from "./content";

export default function LiveSample() {
  const { liveSample } = content;

  return (
    <Box
      component="section"
      id="live-preview"
      aria-labelledby="live-preview-heading"
      className="landing-section landing-section-soft"
    >
      <Container maxWidth="xl">
        <Stack spacing={5}>
          <Stack spacing={2} className="section-heading">
            <Chip
              color="secondary"
              variant="outlined"
              label={liveSample.eyebrow}
              className="eyebrow-chip"
            />
            <Typography id="live-preview-heading" variant="h2">
              {liveSample.heading}
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              className="section-copy"
            >
              {liveSample.subheading}
            </Typography>
          </Stack>

          <Card className="live-preview">
            <Grid container>
              <Grid size={{ xs: 12, md: 7 }}>
                <Stack spacing={2.5} className="lecture-stage">
                  <Box className="wrap-row">
                    <Chip
                      size="small"
                      color="success"
                      variant="outlined"
                      label="Lecture preview"
                    />
                    <Chip
                      size="small"
                      icon={<LockOutlined />}
                      label={liveSample.demoLabel}
                      className="nav-actions"
                    />
                  </Box>

                  <Paper
                    className="lecture-slide"
                    data-generated-content="true"
                    lang="en"
                    dir="ltr"
                  >
                    <Stack spacing={2}>
                      <Typography variant="overline" color="primary">
                        {liveSample.slideLabel}
                      </Typography>
                      <Typography variant="h4" component="h3">
                        {liveSample.slideTitle}
                      </Typography>
                      <Stack spacing={1.25}>
                        {liveSample.slidePoints.map((point) => (
                          <Stack key={point} direction="row" spacing={1.25}>
                            <CheckCircleOutlineRounded
                              color="secondary"
                              fontSize="small"
                              aria-hidden="true"
                            />
                            <Typography variant="body2">{point}</Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </Stack>
                  </Paper>

                  <Stack spacing={0.75}>
                    <Stack direction="row" className="align-center">
                      <Typography variant="caption" color="text.secondary">
                        {liveSample.progressLabel}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        className="nav-actions"
                      >
                        62%
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={62}
                      aria-label="Lesson progress: 62 percent"
                    />
                  </Stack>
                </Stack>
              </Grid>

              <Grid size={{ xs: 12, md: 5 }}>
                <Stack spacing={2.5} className="lecture-sidebar">
                  <RaiseHandTeaser />
                  <Button
                    variant="contained"
                    href="/register?next=/upload"
                    endIcon={<ArrowForwardRounded />}
                  >
                    {liveSample.ctaLabel}
                  </Button>
                  <Stack direction="row" spacing={1} className="align-start">
                    <LockOutlined
                      color="action"
                      fontSize="small"
                      aria-hidden="true"
                    />
                    <Typography variant="caption" color="text.secondary">
                      {liveSample.authNote}
                    </Typography>
                  </Stack>
                </Stack>
              </Grid>
            </Grid>
          </Card>
        </Stack>
      </Container>
    </Box>
  );
}
