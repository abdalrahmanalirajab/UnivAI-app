import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArticleOutlined from "@mui/icons-material/ArticleOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import GppGoodOutlined from "@mui/icons-material/GppGoodOutlined";
import LockClockOutlined from "@mui/icons-material/LockClockOutlined";
import content from "./content";

const ICONS = [
  ArticleOutlined,
  CalendarMonthOutlined,
  GppGoodOutlined,
  LockClockOutlined,
];

export default function TrustStrip() {
  return (
    <Box
      component="section"
      aria-label="Product principles"
      className="landing-section-compact landing-section-soft"
    >
      <Container maxWidth="xl">
        <Grid container spacing={2} className="trust-grid">
          {content.trustStrip.items.map((item, index) => {
            const Icon = ICONS[index];
            return (
              <Grid key={item.title} size={{ xs: 12, sm: 6, lg: 3 }}>
                <Stack direction="row" spacing={1.5} className="trust-item">
                  <Icon color="secondary" aria-hidden="true" />
                  <Stack spacing={0.5}>
                    <Typography variant="subtitle2">{item.title}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.body}
                    </Typography>
                  </Stack>
                </Stack>
              </Grid>
            );
          })}
        </Grid>
      </Container>
    </Box>
  );
}
