"use client";

import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
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
      <Toolbar>
        <Container maxWidth="lg">
          <Stack spacing={2}>
            <Typography variant="h2" component="p" align="center">
              {finalCta.heading}
            </Typography>
            <Grid container>
              <Grid size="grow" />
              <Grid>
                <Button
                  variant="contained"
                  color="inherit"
                  href={user ? "/upload" : "/register?next=/upload"}
                >
                  {user ? "Upload a book" : "Start free"}
                </Button>
              </Grid>
              <Grid size="grow" />
            </Grid>
          </Stack>
        </Container>
      </Toolbar>
    </AppBar>
  );
}
