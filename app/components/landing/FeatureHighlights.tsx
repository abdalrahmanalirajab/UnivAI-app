import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import RecordVoiceOver from "@mui/icons-material/RecordVoiceOver";
import QuestionAnswer from "@mui/icons-material/QuestionAnswer";
import Quiz from "@mui/icons-material/Quiz";
import Schedule from "@mui/icons-material/Schedule";
import WorkspacePremium from "@mui/icons-material/WorkspacePremium";
import content from "./content";

const FEATURE_ICONS = [
  RecordVoiceOver,
  QuestionAnswer,
  Quiz,
  Schedule,
  WorkspacePremium,
];

export default function FeatureHighlights() {
  const { heading, comingSoonLabel, learnMoreLabel, items } =
    content.featureHighlights;

  return (
    <Box component="section" aria-label="Feature highlights">
      <Container maxWidth="lg">
        <Stack spacing={4}>
          <Typography variant="h2" component="p">
            {heading}
          </Typography>
          <Stack spacing={6}>
            {items.map((feature, index) => (
              <Grid
                key={feature.title}
                container
                spacing={4}
                direction={index % 2 === 0 ? "row" : "row-reverse"}
              >
                <Grid size={{ xs: 12, md: 6 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography align="center" color="primary">
                        {(() => {
                          const FeatureIcon = FEATURE_ICONS[index];
                          return <FeatureIcon fontSize="large" />;
                        })()}
                      </Typography>
                      <Typography variant="h6" align="center">
                        {feature.title}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Stack spacing={2}>
                    <Grid container spacing={1}>
                      <Grid>
                        <Typography variant="h5" component="h3">
                          {feature.title}
                        </Typography>
                      </Grid>
                      {feature.comingSoon && (
                        <Grid>
                          <Chip label={comingSoonLabel} size="small" />
                        </Grid>
                      )}
                    </Grid>
                    <Typography variant="body1" color="text.secondary">
                      {feature.body}
                    </Typography>
                    {feature.comingSoon ? (
                      <Button variant="outlined" disabled>
                        {learnMoreLabel}
                      </Button>
                    ) : feature.linkLabel ? (
                      <Button
                        variant="text"
                        href={index === 0 ? "#live-sample" : "/exams"}
                      >
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
    </Box>
  );
}
