import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import AutoStoriesOutlined from "@mui/icons-material/AutoStoriesOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import QuizOutlined from "@mui/icons-material/QuizOutlined";
import ContainerScrollShowcase from "@/components/ui/container-scroll-showcase";

export default function PromoVideo() {
  return (
    <Box
      component="section"
      aria-labelledby="today-preview-heading"
      className="landing-section container-preview-section"
    >
      <Container maxWidth="xl">
        <Stack spacing={2} className="align-center text-center">
          <Chip color="primary" variant="outlined" label="Your learning command center" className="eyebrow-chip" />
          <Typography id="today-preview-heading" variant="h2">
            Open the app. Know what to do.
          </Typography>
          <Typography variant="body1" color="text.secondary" className="section-copy">
            Today puts one timely action first. The rest is available when you ask for it.
          </Typography>
        </Stack>

        <ContainerScrollShowcase>
          <Box className="today-preview">
            <Stack spacing={3}>
              <Stack spacing={0.5}>
                <Typography variant="overline" color="primary">
                  Your learning day
                </Typography>
                <Typography variant="h4">Welcome back, Ahmed.</Typography>
                <Typography color="text.secondary">One useful next step, without the noise.</Typography>
              </Stack>
              <Paper className="today-preview-action" elevation={0}>
                <Grid container spacing={2.5} className="align-center">
                  <Grid size={{ xs: 12, md: 8 }}>
                    <Stack spacing={1}>
                      <Chip size="small" color="success" label="Live now" className="preview-status-chip" />
                      <Typography variant="h5" data-generated-content="true" dir="auto">
                        Week 3: Replication and partitioning
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Your lecturer is waiting on slide 19.
                      </Typography>
                    </Stack>
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Button fullWidth variant="contained" endIcon={<ArrowForwardRounded />}>
                      Join lecture
                    </Button>
                  </Grid>
                </Grid>
              </Paper>
              <Grid container spacing={2}>
                {[
                  { icon: <AutoStoriesOutlined />, label: "Course", value: "48%", note: "3 of 5 weeks" },
                  { icon: <QuizOutlined />, label: "Assessments", value: "All clear", note: "2 submitted" },
                  { icon: <EventAvailableOutlined />, label: "Attendance", value: "3 attended", note: "3 on time" },
                ].map((card) => (
                  <Grid key={card.label} size={{ xs: 12, md: 4 }}>
                    <Paper className="today-preview-stat" elevation={0}>
                      <Stack spacing={1.25}>
                        <Avatar variant="rounded" className="preview-stat-icon">
                          {card.icon}
                        </Avatar>
                        <Typography variant="subtitle2">{card.label}</Typography>
                        <Typography variant="h5">{card.value}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {card.note}
                        </Typography>
                        {card.label === "Course" ? (
                          <LinearProgress variant="determinate" value={48} aria-label="Example course progress" />
                        ) : null}
                      </Stack>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </Stack>
          </Box>
        </ContainerScrollShowcase>
      </Container>
    </Box>
  );
}
