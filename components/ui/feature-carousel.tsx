"use client";

import { useState, type ReactNode } from "react";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

export type CarouselFeature = {
  title: string;
  body: string;
  proof: string;
  icon: ReactNode;
  preview: ReactNode;
};

export default function FeatureCarousel({ items }: { items: CarouselFeature[] }) {
  const [active, setActive] = useState(0);
  const reduceMotion = useReducedMotion();
  const item = items[active];

  function move(offset: number) {
    setActive((current) => (current + offset + items.length) % items.length);
  }

  return (
    <Paper className="feature-carousel" elevation={0}>
      <Grid container>
        <Grid size={{ xs: 12, md: 5 }}>
          <Stack className="feature-carousel-copy" spacing={3}>
            <Avatar variant="rounded" className="carousel-icon">
              {item.icon}
            </Avatar>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={item.title}
                initial={reduceMotion ? false : { opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: 14 }}
                transition={{ duration: reduceMotion ? 0 : 0.22 }}
              >
                <Stack spacing={1.25}>
                  <Chip size="small" color="secondary" label={item.proof} className="carousel-proof" />
                  <Typography variant="h4" component="h3">
                    {item.title}
                  </Typography>
                  <Typography color="text.secondary">{item.body}</Typography>
                </Stack>
              </motion.div>
            </AnimatePresence>
            <Stack direction="row" spacing={1} className="carousel-controls">
              <Button
                variant="outlined"
                aria-label="Previous feature"
                onClick={() => move(-1)}
                startIcon={<ArrowBackRounded />}
              >
                Previous
              </Button>
              <Button
                variant="outlined"
                aria-label="Next feature"
                onClick={() => move(1)}
                endIcon={<ArrowForwardRounded />}
              >
                Next
              </Button>
            </Stack>
            <Stack direction="row" spacing={0.75} aria-label={`Feature ${active + 1} of ${items.length}`}>
              {items.map((feature, index) => (
                <button
                  key={feature.title}
                  type="button"
                  aria-label={`Show ${feature.title}`}
                  aria-pressed={index === active}
                  className={index === active ? "carousel-dot carousel-dot-active" : "carousel-dot"}
                  onClick={() => setActive(index)}
                />
              ))}
            </Stack>
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, md: 7 }} className="feature-carousel-preview-grid">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`preview-${item.title}`}
              className="feature-carousel-preview"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.975 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, scale: 0.985 }}
              transition={{ duration: reduceMotion ? 0 : 0.28 }}
            >
              {item.preview}
            </motion.div>
          </AnimatePresence>
        </Grid>
      </Grid>
    </Paper>
  );
}
