import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import ExploreOutlined from "@mui/icons-material/ExploreOutlined";
import FamilyRestroomOutlined from "@mui/icons-material/FamilyRestroomOutlined";
import QuizOutlined from "@mui/icons-material/QuizOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import TuneOutlined from "@mui/icons-material/TuneOutlined";
import content from "./content";

const ICONS = [
  ExploreOutlined,
  TuneOutlined,
  TrendingUpOutlined,
  QuizOutlined,
  FamilyRestroomOutlined,
  AutoAwesomeOutlined,
];

export default function FeatureHighlights() {
  const { featureHighlights } = content;

  return (
    <Box
      component="section"
      id="features"
      aria-labelledby="features-heading"
      className="landing-section"
    >
      <Container maxWidth="xl">
        <Stack spacing={5}>
          <Stack spacing={2} className="section-heading">
            <Chip
              color="primary"
              variant="outlined"
              label={featureHighlights.eyebrow}
              className="eyebrow-chip"
            />
            <Typography id="features-heading" variant="h2">
              {featureHighlights.heading}
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              className="section-copy"
            >
              {featureHighlights.body}
            </Typography>
          </Stack>

          <Grid container spacing={2.5}>
            {featureHighlights.items.map((feature, index) => {
              const Icon = ICONS[index];
              return (
                <Grid key={feature.title} size={{ xs: 12, md: 6, lg: 4 }}>
                  <Card className="feature-card">
                    <CardContent>
                      <Stack spacing={2.5}>
                        <Stack direction="row" className="align-center">
                          <Avatar variant="rounded" className="feature-icon">
                            <Icon />
                          </Avatar>
                          <Chip
                            size="small"
                            className="nav-actions"
                            color="success"
                            variant="outlined"
                            label={feature.status}
                          />
                        </Stack>
                        <Stack spacing={1}>
                          <Typography variant="h5" component="h3">
                            {feature.title}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {feature.body}
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
