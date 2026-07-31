import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AutoStoriesOutlined from "@mui/icons-material/AutoStoriesOutlined";
import content from "./content";

type FooterLink = {
  label: string;
  href: string;
};

function LinkGroup({
  heading,
  links,
}: {
  heading: string;
  links: readonly FooterLink[];
}) {
  return (
    <Stack spacing={1.25}>
      <Typography variant="overline" color="text.secondary">
        {heading}
      </Typography>
      {links.map((link) => (
        <MuiLink
          key={`${heading}-${link.label}`}
          href={link.href}
          color="text.primary"
          underline="hover"
        >
          {link.label}
        </MuiLink>
      ))}
    </Stack>
  );
}

export default function Footer() {
  const { footer } = content;

  return (
    <Box component="footer" aria-label="UnivAI footer" className="footer-shell">
      <Container maxWidth="xl">
        <Stack spacing={5}>
          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 5 }}>
              <Stack spacing={2} className="section-copy">
                <Stack direction="row" spacing={1.25} className="align-center">
                  <Avatar variant="rounded" className="brand-mark">
                    <AutoStoriesOutlined />
                  </Avatar>
                  <Typography variant="h5">UnivAI</Typography>
                </Stack>
                <Typography variant="body1" color="text.secondary">
                  {footer.tagline}
                </Typography>
              </Stack>
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <LinkGroup heading="Product" links={footer.productLinks} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <LinkGroup heading="Families" links={footer.familyLinks} />
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <LinkGroup heading="Account" links={footer.accountLinks} />
            </Grid>
          </Grid>
          <Divider />
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            className="footer-bottom"
          >
            <Typography variant="caption" color="text.secondary">
              © {new Date().getFullYear()} UnivAI
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              className="nav-actions"
            >
              {footer.madeBy}
            </Typography>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
