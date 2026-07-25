import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid2";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Paper from "@mui/material/Paper";
import Divider from "@mui/material/Divider";
import Button from "@mui/material/Button";
import content from "./content";

export default function LiveSample() {
  const { liveSample } = content;

  return (
    <section aria-label="LiveSample">
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
                      Lecture slide
                    </Typography>
                    <Paper variant="outlined">
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        align="center"
                      >
                        Slide preview placeholder
                      </Typography>
                    </Paper>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={2}>
                    <Typography variant="overline" color="text.secondary">
                      Quiz question
                    </Typography>
                    <Typography variant="body2">
                      Which of the following best describes X?
                    </Typography>
                    <Divider />
                    <Typography variant="body2" color="text.secondary">
                      A. First option
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      B. Second option
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      C. Third option
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
                      Cited answer
                    </Typography>
                    <Typography variant="body2">
                      The concept was introduced in Chapter 3, where the author
                      explains that…
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Source: page 42
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
          <Button variant="contained" href="/register?next=/upload">
            Try your own
          </Button>
        </Stack>
      </Container>
    </section>
  );
}
