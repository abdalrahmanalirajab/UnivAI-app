import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import content from "./content";

export default function TrustStrip() {
  return (
    <Paper square elevation={0} component="section" aria-label="TrustStrip">
      <Container maxWidth="lg">
        <Typography variant="body2" align="center" color="text.secondary">
          {content.trustStrip.line}
        </Typography>
      </Container>
    </Paper>
  );
}
