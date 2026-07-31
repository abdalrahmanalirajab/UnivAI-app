"use client";

import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import content from "./content";

export default function Faq() {
  const { faq } = content;

  return (
    <Box
      component="section"
      id="faq"
      aria-labelledby="faq-heading"
      className="landing-section landing-section-soft"
    >
      <Container maxWidth="xl">
        <Grid container spacing={{ xs: 4, md: 8 }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Stack spacing={2} className="section-heading">
              <Chip
                color="secondary"
                variant="outlined"
                label={faq.eyebrow}
                className="eyebrow-chip"
              />
              <Typography id="faq-heading" variant="h2">
                {faq.heading}
              </Typography>
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            {faq.items.map((item) => (
              <Accordion key={item.question}>
                <AccordionSummary expandIcon={<ExpandMoreRounded />}>
                  <Typography variant="subtitle1" component="h3">
                    {item.question}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="body2" color="text.secondary">
                    {item.answer}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
