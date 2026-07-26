"use client";

import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import IconButton from "@mui/material/IconButton";
import PlayArrow from "@mui/icons-material/PlayArrow";
import content from "./content";

const VIDEO = {
  src: null as string | null,
  poster: null as string | null,
  caption: "Promo video coming soon.",
  provider: "self-hosted" as "self-hosted" | "embed",
};

export default function PromoVideo() {
  const { promoVideo } = content;

  return (
    <section aria-label="PromoVideo" id="promo-video">
      <Container maxWidth="lg">
        <Stack spacing={2}>
          <Typography variant="h2" component="p">
            {promoVideo.heading}
          </Typography>
          <Paper variant="outlined">
            <Typography align="center">
              {VIDEO.src ? (
                null
              ) : (
                <IconButton aria-label="Play promo video">
                  <PlayArrow />
                </IconButton>
              )}
            </Typography>
          </Paper>
          <Typography variant="body2" color="text.secondary">
            {VIDEO.caption}
          </Typography>
          {/* Reserved: captions / transcript link */}
        </Stack>
      </Container>
    </section>
  );
}
