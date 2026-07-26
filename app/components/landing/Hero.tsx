"use client";

import { useCallback } from "react";
import Grid from "@mui/material/Grid2";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import content from "./content";

export default function Hero() {
  const handleScroll = useCallback(() => {
    document.getElementById("promo-video")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const { data: session } = useSession();
  const user = session?.user;
  const { hero } = content;

  const isGuest = !user;
  const isStudent = user?.role === "student";

  return (
    <section aria-label="Hero">
      <Grid container spacing={4} alignItems="stretch">
        <Grid size={{ xs: 12, md: 6 }}>
          <Stack spacing={3}>
            <Typography variant="h1" component="h1">
              {hero.headline}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {hero.subhead}
            </Typography>
            <Stack direction="row" spacing={2}>
              <Button
                variant="contained"
                href={user ? "/upload" : "/register?next=/upload"}
              >
                {user ? "Upload a book" : "Start free"}
              </Button>
              {isGuest && (
                <Button variant="outlined" component={Link} href="/login">
                  Log in
                </Button>
              )}
              {isStudent && (
                <Button variant="outlined" component={Link} href="/dashboard">
                  Go to dashboard
                </Button>
              )}
              <Button variant="outlined" onClick={handleScroll}>
                {hero.ctaSecondary}
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {hero.microTrust}
            </Typography>
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined">
            <Typography variant="body2" color="text.secondary" align="center">
              Book preview placeholder
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </section>
  );
}
