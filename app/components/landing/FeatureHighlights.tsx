"use client";

import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AutoStoriesOutlined from "@mui/icons-material/AutoStoriesOutlined";
import GraphicEqOutlined from "@mui/icons-material/GraphicEqOutlined";
import QuizOutlined from "@mui/icons-material/QuizOutlined";
import WorkspacePremiumOutlined from "@mui/icons-material/WorkspacePremiumOutlined";
import FeatureCarousel, { type CarouselFeature } from "@/components/ui/feature-carousel";

const FEATURES: CarouselFeature[] = [
  {
    title: "A course grounded in your book",
    body: "The plan, lectures, slides, questions, and assessments stay connected to the uploaded source.",
    proof: "Source-backed",
    icon: <AutoStoriesOutlined />,
    preview: (
      <Stack spacing={2.5} className="carousel-demo">
        <Stack direction="row" spacing={1.5} className="align-center">
          <Avatar variant="rounded" className="carousel-demo-icon">
            <AutoStoriesOutlined />
          </Avatar>
          <Stack>
            <Typography variant="subtitle1">Designing Data-Intensive Applications</Typography>
            <Typography variant="caption" color="text.secondary">
              Identical content found · generation reused
            </Typography>
          </Stack>
        </Stack>
        {["Course plan", "Five lectures", "Quiz bank", "Slides and audio"].map((label) => (
          <Stack key={label} direction="row" className="carousel-demo-row align-center">
            <Typography variant="body2">{label}</Typography>
            <Chip size="small" color="success" label="Ready" className="nav-actions" />
          </Stack>
        ))}
      </Stack>
    ),
  },
  {
    title: "A lecturer that can actually pause",
    body: "Raise your hand, ask naturally, hear a grounded answer, then continue without losing the slide or lecture position.",
    proof: "Live and interruptible",
    icon: <GraphicEqOutlined />,
    preview: (
      <Stack spacing={2.5} className="carousel-demo voice-demo">
        <Stack direction="row" spacing={1.5} className="align-center">
          <span className="voice-orb" aria-hidden="true" />
          <Stack>
            <Typography variant="subtitle1">I heard your question</Typography>
            <Typography variant="caption" color="text.secondary">
              “Why do distributed systems need replication?”
            </Typography>
          </Stack>
        </Stack>
        <Paper className="carousel-answer" elevation={0}>
          <Typography variant="body2">
            Replication keeps copies of the same data on several nodes, improving availability
            and bringing reads closer to users…
          </Typography>
        </Paper>
        <Chip size="small" color="success" label="Returning to slide 19" />
      </Stack>
    ),
  },
  {
    title: "Assessments only when they matter",
    body: "Quizzes open after their lecture, one midterm lands at each semester midpoint, and the final waits for the semester to finish.",
    proof: "Time-aware",
    icon: <QuizOutlined />,
    preview: (
      <Stack spacing={2.25} className="carousel-demo">
        <Stack direction="row" className="align-center">
          <Typography variant="subtitle1">Today</Typography>
          <Chip size="small" color="warning" label="1 action" className="nav-actions" />
        </Stack>
        <Paper className="carousel-next-action" elevation={0}>
          <Typography variant="overline" color="warning.main">
            Due now
          </Typography>
          <Typography variant="h6">Week 2 quiz</Typography>
          <Typography variant="body2" color="text.secondary">
            Open for 18 more hours
          </Typography>
        </Paper>
        <Typography variant="caption" color="text.secondary">
          Future assessments stay out of the way.
        </Typography>
      </Stack>
    ),
  },
  {
    title: "A result you can prove",
    body: "See the course grade and GPA immediately, download the grade-specific certificate, and validate it from the public site.",
    proof: "Publicly verifiable",
    icon: <WorkspacePremiumOutlined />,
    preview: (
      <Stack spacing={2.5} className="carousel-demo">
        <Stack direction="row" className="align-center">
          <Stack>
            <Typography variant="overline" color="text.secondary">
              Final course grade
            </Typography>
            <Typography variant="h3">A</Typography>
          </Stack>
          <Chip color="success" label="Passed" className="nav-actions" />
        </Stack>
        <LinearProgress variant="determinate" value={88} color="success" />
        <Stack direction="row" spacing={1}>
          <Chip label="Coursework 52.8 / 60" variant="outlined" />
          <Chip label="Final 35.2 / 40" variant="outlined" />
        </Stack>
        <Typography variant="body2">Certificate ID · UVA-2026-8F3A</Typography>
      </Stack>
    ),
  },
];

export default function FeatureHighlights() {
  return (
    <Box
      component="section"
      id="features"
      aria-labelledby="features-heading"
      className="landing-section landing-section-soft"
    >
      <Container maxWidth="xl">
        <Stack spacing={5}>
          <Stack spacing={2} className="section-heading">
            <Chip color="secondary" variant="outlined" label="See it in action" className="eyebrow-chip" />
            <Typography id="features-heading" variant="h2">
              The useful parts stay connected.
            </Typography>
            <Typography variant="body1" color="text.secondary" className="section-copy">
              Explore the full journey one feature at a time.
            </Typography>
          </Stack>
          <FeatureCarousel items={FEATURES} />
        </Stack>
      </Container>
    </Box>
  );
}
