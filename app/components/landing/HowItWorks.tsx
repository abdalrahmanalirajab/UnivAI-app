import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AutoStoriesOutlined from "@mui/icons-material/AutoStoriesOutlined";
import CloudUploadOutlined from "@mui/icons-material/CloudUploadOutlined";
import ForumOutlined from "@mui/icons-material/ForumOutlined";
import TaskAltOutlined from "@mui/icons-material/TaskAltOutlined";
import content from "./content";

const ICONS = [
  CloudUploadOutlined,
  AutoStoriesOutlined,
  ForumOutlined,
  TaskAltOutlined,
];

export default function HowItWorks() {
  const { howItWorks } = content;

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
              label={howItWorks.eyebrow}
              className="eyebrow-chip"
            />
            <Typography id="how-it-works-heading" variant="h2">
              {howItWorks.heading}
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              className="section-copy"
            >
              {howItWorks.body}
            </Typography>
          </Stack>

          <Grid container spacing={2.5}>
            {howItWorks.steps.map((step, index) => {
              const Icon = ICONS[index];
              return (
                <Grid key={step.title} size={{ xs: 12, sm: 6, lg: 3 }}>
                  <Card className="step-card">
                    <CardContent>
                      <Stack spacing={2.5}>
                        <Stack direction="row" className="align-center">
                          <Avatar className="step-number">{index + 1}</Avatar>
                          <Icon color="primary" className="nav-actions" />
                        </Stack>
                        <Stack spacing={1}>
                          <Typography variant="h5" component="h3">
                            {step.title}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {step.body}
                          </Typography>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Stack>
      </Container>
    </Box>
  );
}
