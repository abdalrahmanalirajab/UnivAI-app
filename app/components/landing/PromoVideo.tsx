"use client";

import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import PlayArrow from "@mui/icons-material/PlayArrow";
import content from "./content";

export default function PromoVideo() {
  const { promoVideo } = content;

  return (
    <Box component="section" aria-label="Product video" id="promo-video">
      <Container maxWidth="lg">
        <Stack spacing={2}>
          <Typography variant="h2" component="p">
            {promoVideo.heading}
          </Typography>
          <Card variant="outlined">
            <CardContent>
              <Stack spacing={2}>
                <Typography align="center" color="primary">
                  <PlayArrow fontSize="large" />
                </Typography>
                <Typography variant="body1" align="center">
                  {promoVideo.caption}
                </Typography>
                <Typography variant="body2" color="text.secondary" align="center">
                  Upload → Plan → Learn → Validate
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </Container>
    </Box>
  );
}
