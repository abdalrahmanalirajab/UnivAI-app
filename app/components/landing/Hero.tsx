"use client";

import { useCallback, useEffect, useState } from "react";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Fade from "@mui/material/Fade";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import RaiseHandTeaser from "./RaiseHandTeaser";
import content from "./content";

export default function Hero() {
  const handleScroll = useCallback(() => {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const { data: session } = useSession();
  const user = session?.user;
  const { hero } = content;

  const isGuest = !user;
  const isStudent = user?.role === "student";

  const [showAfter, setShowAfter] = useState(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return true;
    }
    return false;
  });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;

    const interval = setInterval(() => {
      setShowAfter((prev) => !prev);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Box component="section" aria-label="Introduction">
      <Grid container spacing={4}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Stack spacing={3}>
            <Typography variant="h1" component="h1">
              {hero.headline}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {hero.subhead}
            </Typography>
            <Grid container spacing={2}>
              <Grid>
                <Button
                  variant="contained"
                  href={user ? "/upload" : "/register?next=/upload"}
                >
                  {user ? "Upload a book" : "Start free"}
                </Button>
              </Grid>
              {isGuest && (
                <Grid>
                  <Button variant="outlined" component={Link} href="/login">
                    Log in
                  </Button>
                </Grid>
              )}
              {isStudent && (
                <Grid>
                  <Button variant="outlined" component={Link} href="/dashboard">
                    Go to dashboard
                  </Button>
                </Grid>
              )}
              <Grid>
                <Button variant="outlined" onClick={handleScroll}>
                  {hero.ctaSecondary}
                </Button>
              </Grid>
            </Grid>
            <Typography variant="caption" color="text.secondary">
              {hero.microTrust}
            </Typography>
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Stack spacing={2}>
            <Card variant="outlined">
              <CardContent>
                <Fade in={!showAfter} unmountOnExit>
                  <Stack spacing={1}>
                    <Typography variant="overline" color="text.secondary">
                      Your textbook
                    </Typography>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="h5" align="center">
                          One source of truth
                        </Typography>
                        <Typography variant="body2" color="text.secondary" align="center">
                          Upload your material and keep every lesson grounded in it.
                        </Typography>
                      </CardContent>
                    </Card>
                  </Stack>
                </Fade>
                <Fade in={showAfter} unmountOnExit>
                  <Stack spacing={1}>
                    <Typography variant="overline" color="text.secondary">
                      Your semester
                    </Typography>
                    {[
                      "Lecture 1 – Introduction",
                      "Lecture 2 – Core concepts",
                      "Lecture 3 – Advanced topics",
                      "Quiz – Week 1 review",
                    ].map((label) => (
                      <Card key={label} variant="outlined">
                        <CardContent>
                          <Typography variant="caption" color="text.secondary">
                            {label}
                          </Typography>
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>
                </Fade>
              </CardContent>
            </Card>
            <RaiseHandTeaser />
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
