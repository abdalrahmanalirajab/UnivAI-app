"use client";

import Image from "next/image";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Fade from "@mui/material/Fade";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import LockOutlined from "@mui/icons-material/LockOutlined";
import { useSession } from "@/lib/auth-client";
import content from "./content";

export default function Hero() {
  const { data: session } = useSession();
  const user = session?.user;
  const { hero } = content;

  const primaryHref = user ? "/upload" : "/register?next=/upload";
  const primaryLabel = user ? "Upload a book" : hero.ctaPrimary;

  return (
    <Box component="section" aria-labelledby="hero-heading" className="hero-section">
      <Container maxWidth="xl">
        <Grid container spacing={{ xs: 6, md: 8 }} className="align-center">
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack spacing={3} className="hero-copy">
              <Chip
                color="secondary"
                variant="outlined"
                label={hero.eyebrow}
                className="eyebrow-chip"
              />
              <Typography id="hero-heading" variant="h1" component="h1">
                {hero.headlineLead}{" "}
                <Box component="span" className="hero-headline-accent">
                  {hero.headlineAccent}
                </Box>
              </Typography>
              <Typography
                variant="body1"
                color="text.secondary"
                className="hero-subhead"
              >
                {hero.subhead}
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} className="hero-actions">
                <Button
                  variant="contained"
                  size="large"
                  component={Link}
                  href={primaryHref}
                  endIcon={<ArrowForwardRounded />}
                >
                  {primaryLabel}
                </Button>
                {user ? (
                  <Button
                    variant="outlined"
                    size="large"
                    component={Link}
                    href="/dashboard"
                  >
                    Open dashboard
                  </Button>
                ) : (
                  <Button
                    variant="outlined"
                    size="large"
                    component="a"
                    href="#how-it-works"
                  >
                    {hero.ctaSecondary}
                  </Button>
                )}
              </Stack>
              <Box className="wrap-row" aria-label="Product notes">
                {hero.proofPoints.map((point, index) => (
                  <Chip
                    key={point}
                    size="small"
                    variant="outlined"
                    icon={index === 2 ? <LockOutlined /> : <CheckCircleRounded />}
                    label={point}
                  />
                ))}
              </Box>
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Fade in timeout={700}>
              <Box className="hero-visual-shell">
                <Image
                  src="/images/family-learning-hero.webp"
                  alt="A parent and older teenage student learning together with a textbook and a structured course on a laptop"
                  fill
                  priority
                  sizes="(max-width: 900px) 100vw, 50vw"
                  className="hero-image"
                />
                <Box className="hero-image-scrim" aria-hidden="true" />
                <Chip
                  label={hero.groundedLabel}
                  icon={<CheckCircleRounded />}
                  className="hero-float-chip"
                />
                <Paper className="hero-progress-card">
                  <Stack spacing={1}>
                    <Stack direction="row" className="align-center">
                      <Typography variant="overline" color="inherit">
                        {hero.progressLabel}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="inherit"
                        className="nav-actions"
                      >
                        48%
                      </Typography>
                    </Stack>
                    <Typography variant="h6" color="inherit">
                      {hero.progressTitle}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={48}
                      color="secondary"
                      aria-label="Course plan progress: 48 percent"
                    />
                    <Typography variant="caption" color="inherit">
                      {hero.progressCaption}
                    </Typography>
                  </Stack>
                </Paper>
              </Box>
            </Fade>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
