"use client";

import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import { useSession } from "@/lib/auth-client";
import content from "./content";

export default function FinalCta() {
  const { data: session } = useSession();
  const user = session?.user;
  const { finalCta } = content;

  return (
    <Box
      component="section"
      aria-labelledby="final-cta-heading"
      className="landing-section"
    >
      <Container maxWidth="lg">
        <Box className="final-cta">
          <Stack spacing={3} className="align-center text-center">
            <Typography variant="overline" color="inherit">
              {finalCta.eyebrow}
            </Typography>
            <Typography
              id="final-cta-heading"
              variant="h2"
              color="inherit"
              className="section-heading"
            >
              {finalCta.heading}
            </Typography>
            <Typography
              variant="body1"
              color="inherit"
              className="section-copy"
            >
              {finalCta.body}
            </Typography>
            <Button
              variant="contained"
              color="secondary"
              size="large"
              component={Link}
              href={user ? "/upload" : "/register?next=/upload"}
              endIcon={<ArrowForwardRounded />}
            >
              {user ? "Upload a book" : finalCta.ctaLabel}
            </Button>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}
