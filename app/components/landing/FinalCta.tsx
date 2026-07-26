"use client";

import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import AppBar from "@mui/material/AppBar";
import { useSession } from "@/lib/auth-client";
import content from "./content";

export default function FinalCta() {
  const { data: session } = useSession();
  const user = session?.user;
  const { finalCta } = content;

  return (
    <AppBar
      position="static"
      color="primary"
      elevation={0}
      component="section"
      aria-label="FinalCta"
    >
      <Container maxWidth="lg">
        <Stack spacing={2}>
          <Typography variant="h2" component="p" align="center">
            {finalCta.heading}
          </Typography>
          <Grid container justifyContent="center">
            <Grid>
              <Button
                variant="contained"
                href={user ? "/upload" : "/register?next=/upload"}
              >
                {user ? "Upload a book" : "Start free"}
              </Button>
            </Grid>
          </Grid>
        </Stack>
      </Container>
    </AppBar>
  );
}
