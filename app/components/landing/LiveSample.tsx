import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import Button from "@mui/material/Button";
import content from "./content";

export default function LiveSample() {
  const { liveSample } = content;

  return (
    <Box component="section" aria-label="Live product sample" id="live-sample">
      <Container maxWidth="lg">
        <Stack spacing={4}>
          <Stack spacing={1}>
            <Typography variant="h2" component="p">
              {liveSample.heading}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {liveSample.subheading}
            </Typography>
          </Stack>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={2}>
                    <Typography variant="overline" color="text.secondary">
                      {liveSample.lectureSlideLabel}
                    </Typography>
                    <Typography variant="h6" align="center">
                      {liveSample.slidePlaceholder}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" align="center">
                      A lecture slide generated from the uploaded sources.
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={2}>
                    <Typography variant="overline" color="text.secondary">
                      {liveSample.quizQuestionLabel}
                    </Typography>
                    <Typography variant="body2">
                      {liveSample.quizQuestion}
                    </Typography>
                    <Divider />
                    <Typography variant="body2" color="text.secondary">
                      {liveSample.quizOptionA}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {liveSample.quizOptionB}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {liveSample.quizOptionC}
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={2}>
                    <Typography variant="overline" color="text.secondary">
                      {liveSample.citedAnswerLabel}
                    </Typography>
                    <Typography variant="body2">
                      {liveSample.citedAnswer}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {liveSample.sourceText}
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
          <Button variant="contained" href="/register?next=/upload">
            {liveSample.ctaLabel}
          </Button>
        </Stack>
      </Container>
    </Box>
  );
}
