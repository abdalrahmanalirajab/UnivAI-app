import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid2";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <section aria-label="Footer">
      <Container maxWidth="lg">
        <Stack spacing={4}>
          <Grid container spacing={4}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2" component="h4">
                  Product
                </Typography>
                <Link href="/upload" color="text.secondary" underline="hover">
                  Upload
                </Link>
                <Link href="/schedule" color="text.secondary" underline="hover">
                  Schedule
                </Link>
                <Link href="/exams" color="text.secondary" underline="hover">
                  Exams
                </Link>
                <Link href="/dashboard" color="text.secondary" underline="hover">
                  Dashboard
                </Link>
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2" component="h4">
                  Account
                </Typography>
                <Link href="/login" color="text.secondary" underline="hover">
                  Login
                </Link>
                <Link href="/register" color="text.secondary" underline="hover">
                  Register
                </Link>
                <Link href="/profile" color="text.secondary" underline="hover">
                  Profile
                </Link>
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2" component="h4">
                  About
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  The idea
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Team
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  GitHub
                </Typography>
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2" component="h4">
                  Legal
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Privacy
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Terms
                </Typography>
              </Stack>
            </Grid>
          </Grid>
          <Divider />
          <Stack spacing={1}>
            <Typography variant="h6" align="center">
              UnivAI
            </Typography>
            <Typography variant="body2" color="text.secondary" align="center">
              One Book, One Month
            </Typography>
            <Typography variant="body2" color="text.secondary" align="center">
              Made by the Jamieh team
            </Typography>
            <Typography variant="caption" color="text.secondary" align="center">
              &copy; {year} UnivAI
            </Typography>
          </Stack>
        </Stack>
      </Container>
    </section>
  );
}
