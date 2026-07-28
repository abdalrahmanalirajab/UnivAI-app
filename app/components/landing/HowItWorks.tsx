"use client";

import { useState, useEffect, useRef } from "react";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Grow from "@mui/material/Grow";
import CloudUpload from "@mui/icons-material/CloudUpload";
import AutoStories from "@mui/icons-material/AutoStories";
import QuestionAnswer from "@mui/icons-material/QuestionAnswer";
import Assignment from "@mui/icons-material/Assignment";
import content from "./content";

const ICON_MAP = {
  Upload: CloudUpload,
  Build: AutoStories,
  Attend: QuestionAnswer,
  Exam: Assignment,
};

export default function HowItWorks() {
  const { heading, steps } = content.howItWorks;
  const [inView, setInView] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;

    const interval = setInterval(() => {
      setVisibleCount((prev) => {
        if (prev < steps.length) return prev + 1;
        clearInterval(interval);
        return prev;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [inView, steps.length]);

  return (
    <Box component="section" aria-label="How it works" id="how-it-works" ref={sectionRef}>
      <Container maxWidth="lg">
        <Stack spacing={4}>
          <Typography variant="h2" component="p">
            {heading}
          </Typography>
          <Grid container spacing={4}>
            {steps.map((step, index) => {
              const Icon = ICON_MAP[step.icon];
              return (
                <Grid size={{ xs: 12, sm: 6, md: 3 }} key={step.label}>
                  <Grow in={index < visibleCount} timeout={400}>
                    <Stack spacing={1}>
                      <Icon />
                      <Typography variant="body2" align="center">
                        {step.label}
                      </Typography>
                    </Stack>
                  </Grow>
                </Grid>
              );
            })}
          </Grid>
        </Stack>
      </Container>
    </Box>
  );
}
