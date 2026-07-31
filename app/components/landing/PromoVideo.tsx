import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import GraphicEqOutlined from "@mui/icons-material/GraphicEqOutlined";
import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import QuestionAnswerOutlined from "@mui/icons-material/QuestionAnswerOutlined";
import content from "./content";

const ICONS = [
  MenuBookOutlined,
  GraphicEqOutlined,
  QuestionAnswerOutlined,
  FactCheckOutlined,
];

export default function PromoVideo() {
  const { learningModes } = content;

  return (
    <Box
      component="section"
      aria-labelledby="learning-modes-heading"
      className="landing-section landing-section-soft"
    >
      <Container maxWidth="lg">
        <Stack spacing={5}>
          <Stack spacing={2} className="align-center text-center">
            <Chip
              color="secondary"
              variant="outlined"
              label={learningModes.eyebrow}
              className="eyebrow-chip"
            />
            <Typography id="learning-modes-heading" variant="h2">
              {learningModes.heading}
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              className="section-copy"
            >
              {learningModes.body}
            </Typography>
          </Stack>

          <Grid container spacing={3} className="journey-line">
            {learningModes.items.map((item, index) => {
              const Icon = ICONS[index];
              return (
                <Grid key={item.title} size={{ xs: 6, md: 3 }}>
                  <Stack spacing={1.5} className="journey-node">
                    <Avatar className="journey-icon">
                      <Icon />
                    </Avatar>
                    <Typography variant="h6" component="h3">
                      {item.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.body}
                    </Typography>
                  </Stack>
                </Grid>
              );
            })}
          </Grid>
        </Stack>
      </Container>
    </Box>
  );
}
