import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import content from "./content";

const PRODUCT_HREF: Record<string, string> = {
  Upload: "/upload",
  Schedule: "/schedule",
  Exams: "/exams",
  Dashboard: "/dashboard",
};

const ACCOUNT_HREF: Record<string, string> = {
  Login: "/login",
  Register: "/register",
  Profile: "/profile",
};

export default function Footer() {
  const { footer } = content;
  const year = new Date().getFullYear();

  return (
    <section aria-label="Footer">
      <Container maxWidth="lg">
        <Stack spacing={4}>
          <Grid container spacing={4}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2" component="h4">
                  {footer.productHeading}
                </Typography>
                {footer.productLinks.map((label) => (
                  <Link
                    key={label}
                    href={PRODUCT_HREF[label]}
                    color="text.secondary"
                    underline="hover"
                  >
                    {label}
                  </Link>
                ))}
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2" component="h4">
                  {footer.accountHeading}
                </Typography>
                {footer.accountLinks.map((label) => (
                  <Link
                    key={label}
                    href={ACCOUNT_HREF[label]}
                    color="text.secondary"
                    underline="hover"
                  >
                    {label}
                  </Link>
                ))}
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2" component="h4">
                  {footer.aboutHeading}
                </Typography>
                {footer.aboutLinks.map((label) => (
                  <Typography key={label} variant="body2" color="text.secondary">
                    {label}
                  </Typography>
                ))}
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2" component="h4">
                  {footer.legalHeading}
                </Typography>
                {footer.legalLinks.map((label) => (
                  <Typography key={label} variant="body2" color="text.secondary">
                    {label}
                  </Typography>
                ))}
              </Stack>
            </Grid>
          </Grid>
          <Divider />
          <Stack spacing={1}>
            <Typography variant="h6" align="center">
              {footer.brand}
            </Typography>
            <Typography variant="body2" color="text.secondary" align="center">
              {footer.tagline}
            </Typography>
            <Typography variant="body2" color="text.secondary" align="center">
              {footer.madeBy}
            </Typography>
            <Typography variant="caption" color="text.secondary" align="center">
              {footer.copyrightFormat.replace("{year}", String(year))}
            </Typography>
          </Stack>
        </Stack>
      </Container>
    </section>
  );
}
