"use client";

import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import EmojiEventsOutlined from "@mui/icons-material/EmojiEventsOutlined";
import FlagOutlined from "@mui/icons-material/FlagOutlined";
import PolicyOutlined from "@mui/icons-material/PolicyOutlined";
import RocketLaunchOutlined from "@mui/icons-material/RocketLaunchOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import content from "./content";

const ICONS = [
  FlagOutlined,
  TrendingUpOutlined,
  EmojiEventsOutlined,
];

export default function SecondAudience() {
  const { graduates } = content;

  return (
    <Box
      component="section"
      id="for-graduates"
      aria-labelledby="graduates-heading"
      className="landing-section"
    >
      <Container maxWidth="xl">
        <Stack spacing={5}>
          <Grid container spacing={4} className="align-end">
            <Grid size={{ xs: 12, md: 8 }}>
              <Stack spacing={2}>
                <Chip
                  color="primary"
                  variant="outlined"
                  icon={<RocketLaunchOutlined />}
                  label={graduates.eyebrow}
                  className="eyebrow-chip"
                />
                <Typography id="graduates-heading" variant="h2">
                  {graduates.heading}
                </Typography>
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="body1" color="text.secondary">
                {graduates.body}
              </Typography>
            </Grid>
          </Grid>

          <Typography variant="overline" color="text.secondary">
            {graduates.visibleHeading}
          </Typography>

          <Grid container spacing={2.5}>
            {graduates.visibleItems.map((item, index) => {
              const Icon = ICONS[index];
              return (
                <Grid key={item.title} size={{ xs: 12, md: 4 }}>
                  <Card className="feature-card">
                    <CardContent>
                      <Stack spacing={2}>
                        <Avatar variant="rounded" className="feature-icon">
                          <Icon />
                        </Avatar>
                        <Stack spacing={1}>
                          <Typography variant="h5" component="h3">
                            {item.title}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {item.body}
                          </Typography>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>

          <Alert
            severity="info"
            icon={<PolicyOutlined />}
            className="audience-guardrail"
          >
            <Stack spacing={0.75}>
              <Stack direction="row" spacing={1} className="align-center">
                <Typography variant="subtitle1">
                  {graduates.guardrailTitle}
                </Typography>
                <Chip
                  size="small"
                  color="info"
                  variant="outlined"
                  label={graduates.guardrailStatus}
                />
              </Stack>
              <Typography variant="body2">{graduates.guardrailBody}</Typography>
            </Stack>
          </Alert>
        </Stack>
      </Container>
    </Box>
  );
}
