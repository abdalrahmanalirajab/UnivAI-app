import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid2";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloudUpload from "@mui/icons-material/CloudUpload";
import AutoStories from "@mui/icons-material/AutoStories";
import QuestionAnswer from "@mui/icons-material/QuestionAnswer";
import Assignment from "@mui/icons-material/Assignment";
import content from "./content";

const ICON_MAP = {
  Upload: CloudUpload,
  Build: AutoStories,
  Attend: QuestionAnswer,
  Exam: Assignment,
};

export default function HowItWorks() {
  const { steps } = content.howItWorks;

  return (
    <section aria-label="HowItWorks">
      <Container maxWidth="lg">
        <Stack spacing={4}>
          <Typography variant="h2" component="p">
            How it works
          </Typography>
          <Grid container spacing={4}>
            {steps.map((step) => {
              const Icon = ICON_MAP[step.icon];
              return (
                <Grid size={{ xs: 12, sm: 6, md: 3 }} key={step.label}>
                  <Stack spacing={1}>
                    <Icon />
                    <Typography variant="body2" align="center">
                      {step.label}
                    </Typography>
                  </Stack>
                </Grid>
              );
            })}
          </Grid>
        </Stack>
      </Container>
    </section>
  );
}
