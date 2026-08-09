"use client";

import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import AutoStoriesOutlined from "@mui/icons-material/AutoStoriesOutlined";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import GraphicEqRounded from "@mui/icons-material/GraphicEqRounded";
import QuizOutlined from "@mui/icons-material/QuizOutlined";
import BackgroundPaths from "@/components/ui/background-paths";
import DisplayCards from "@/components/ui/display-cards";
import { useHydratedSession } from "@/lib/use-hydrated-session";

const COURSE_PREVIEW = [
  {
    title: "Your book is understood",
    detail: "A 5-week course is ready",
    status: "Ready",
    icon: <AutoStoriesOutlined />,
  },
  {
    title: "Live lecture in progress",
    detail: "Voice and slide 19 stay together",
    status: "Live",
    icon: <GraphicEqRounded />,
  },
  {
    title: "One next action",
    detail: "Week 2 quiz opens after class",
    status: "Next",
    icon: <QuizOutlined />,
  },
];

export default function Hero() {
  const { data: session } = useHydratedSession();
  const user = session?.user;

  return (
    <Box
      component="section"
      aria-labelledby="hero-heading"
      className="hero-section shape-hero-section"
    >
      <BackgroundPaths />
      <div className="hero-shape hero-shape-one" aria-hidden="true" />
      <div className="hero-shape hero-shape-two" aria-hidden="true" />
      <Container maxWidth="xl" className="shape-hero-container">
        <Grid container spacing={{ xs: 7, md: 8 }} className="align-center">
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack spacing={3} className="hero-copy">
              <Chip
                color="secondary"
                variant="outlined"
                label="From one book to a complete semester"
                className="eyebrow-chip hero-eyebrow"
              />
              <Typography id="hero-heading" variant="h1" component="h1">
                Your textbook becomes a course that{" "}
                <Box component="span" className="hero-headline-accent">
                  knows what comes next.
                </Box>
              </Typography>
              <Typography variant="body1" color="text.secondary" className="hero-subhead">
                UnivAI turns your source into scheduled live lectures, synced slides,
                questions, assessments, and a verified final transcript—then shows you
                only the next useful step.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} className="hero-actions">
                <Button
                  variant="contained"
                  size="large"
                  component={Link}
                  href={user ? "/start" : "/register"}
                  endIcon={<ArrowForwardRounded />}
                >
                  {user ? "Continue learning" : "Build my course"}
                </Button>
                <Button variant="outlined" size="large" component="a" href="#how-it-works">
                  See the journey
                </Button>
              </Stack>
              <Box className="wrap-row" aria-label="Product guarantees">
                {["Confirm before upload", "Ask during lectures", "Results without waiting"].map(
                  (point) => (
                    <Chip
                      key={point}
                      size="small"
                      variant="outlined"
                      icon={<CheckCircleRounded />}
                      label={point}
                    />
                  ),
                )}
              </Box>
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Box className="hero-card-stage">
              <DisplayCards items={COURSE_PREVIEW} />
            </Box>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
