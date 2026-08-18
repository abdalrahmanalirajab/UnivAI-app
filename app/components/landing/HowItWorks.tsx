import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AutoStoriesOutlined from "@mui/icons-material/AutoStoriesOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import GraphicEqOutlined from "@mui/icons-material/GraphicEqOutlined";
import WorkspacePremiumOutlined from "@mui/icons-material/WorkspacePremiumOutlined";
import BentoFeatureGrid, { type BentoFeature } from "@/components/ui/bento-feature-grid";

const ITEMS: BentoFeature[] = [
  {
    title: "Start from the source you trust",
    body: "Choose a book, confirm the upload, and reuse an identical course when the same content was already prepared.",
    label: "You stay in control",
    icon: <AutoStoriesOutlined />,
    wide: true,
    visual: (
      <Stack direction="row" spacing={1} className="bento-source-row">
        <Chip label="Book selected" color="primary" />
        <span aria-hidden="true">→</span>
        <Chip label="Hash checked" variant="outlined" />
        <span aria-hidden="true">→</span>
        <Chip label="Course reused" color="success" />
      </Stack>
    ),
  },
  {
    title: "A real semester",
    body: "Lectures, sections, quizzes, a midpoint midterm, and the final appear at the right time.",
    label: "Scheduled",
    icon: <CalendarMonthOutlined />,
    visual: (
      <Stack spacing={1}>
        <Typography variant="caption" color="text.secondary">
          Semester timeline
        </Typography>
        <LinearProgress variant="determinate" value={48} aria-label="Example semester progress" />
        <Typography variant="caption" data-generated-content="true" dir="auto">
          Week 3 of 5 · midterm next
        </Typography>
      </Stack>
    ),
  },
  {
    title: "Live, not prerecorded",
    body: "The lecturer speaks with the current slide, hears your question, answers, and resumes from the same point.",
    label: "Voice + slides",
    icon: <GraphicEqOutlined />,
    visual: (
      <Stack direction="row" spacing={1} className="align-center">
        <span className="voice-live-dot" aria-hidden="true" />
        <Typography variant="body2">Listening for your question…</Typography>
      </Stack>
    ),
  },
  {
    title: "Finish with proof",
    body: "Assessment scores update quickly. A final stays provisional through its retake window, then coursework and the official result produce a transcript, GPA, certificate, and public verification link.",
    label: "Verified outcome",
    icon: <WorkspacePremiumOutlined />,
    wide: true,
    visual: (
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Chip label="Coursework 60%" variant="outlined" data-generated-content="true" dir="auto" />
        <Chip label="Final 40%" variant="outlined" data-generated-content="true" dir="auto" />
        <Chip label="Grade A" color="success" data-generated-content="true" dir="auto" />
        <Chip label="Certificate valid" color="primary" />
      </Stack>
    ),
  },
];

export default function HowItWorks() {
  return (
    <Box
      component="section"
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="landing-section"
    >
      <Container maxWidth="xl">
        <Stack spacing={5}>
          <Stack spacing={2} className="section-heading">
            <Chip
              color="primary"
              variant="outlined"
              label="The full learning loop"
              className="eyebrow-chip"
            />
            <Typography id="how-it-works-heading" variant="h2">
              One book in. A guided university journey out.
            </Typography>
            <Typography variant="body1" color="text.secondary" className="section-copy">
              Every stage leads to the next one. The learner never has to guess where to go.
            </Typography>
          </Stack>
          <BentoFeatureGrid items={ITEMS} />
        </Stack>
      </Container>
    </Box>
  );
}
