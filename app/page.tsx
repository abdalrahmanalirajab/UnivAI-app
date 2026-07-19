import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActions from "@mui/material/CardActions";
import Button from "@mui/material/Button";

const STEPS = [
  {
    href: "/upload",
    title: "1 — Upload your book",
    body: "Upload one textbook PDF. It is handed to the RAG service for indexing.",
    action: "Upload",
  },
  {
    href: "/schedule",
    title: "2 — Follow the schedule",
    body: "Four weekly lectures, each under three minutes, generated from your book.",
    action: "View schedule",
  },
  {
    href: "/dashboard",
    title: "3 — Track your record",
    body: "Attendance, lateness, and grades for the quizzes and the midterm.",
    action: "Open dashboard",
  },
];

export default function Home() {
  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h4">UnivAI — One Book, One Month</Typography>
        <Typography variant="body1" color="text.secondary">
          Upload a textbook. Get a four-week semester of live lectures you can
          interrupt to ask questions.
        </Typography>
      </Stack>
      <Stack spacing={2}>
        {STEPS.map((step) => (
          <Card key={step.href} variant="outlined">
            <CardContent>
              <Typography variant="h6">{step.title}</Typography>
              <Typography variant="body2" color="text.secondary">
                {step.body}
              </Typography>
            </CardContent>
            <CardActions>
              <Button href={step.href} size="small">
                {step.action}
              </Button>
            </CardActions>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
