import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid2";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import AppBar from "@mui/material/AppBar";
import content from "./content";

export default function FinalCta() {
  const { finalCta } = content;

  return (
    <AppBar
      position="static"
      color="primary"
      elevation={0}
      component="section"
      aria-label="FinalCta"
    >
      <Container maxWidth="lg">
        <Stack spacing={2}>
          <Typography variant="h2" component="p" align="center">
            {finalCta.heading}
          </Typography>
          <Grid container justifyContent="center">
            <Grid>
              <Button variant="contained" href="/register?next=/upload">
                {finalCta.ctaLabel}
              </Button>
            </Grid>
          </Grid>
        </Stack>
      </Container>
    </AppBar>
  );
}
