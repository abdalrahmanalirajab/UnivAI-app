"use client";

import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
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
            <Box position="relative" width="100%" pt="56.25%">
              <Box
                position="absolute"
                top={0}
                left={0}
                width="100%"
                height="100%"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                {VIDEO.src ? null : (
                  <IconButton aria-label={promoVideo.playAriaLabel}>
                    <PlayArrow />
                  </IconButton>
                )}
                {/* Reserved: captions / transcript link */}
              </Box>
            </Box>
          </Paper>
          <Typography variant="body2" color="text.secondary">
            {promoVideo.caption}
          </Typography>
        </Stack>
      </Container>
    </section>
  );
}
