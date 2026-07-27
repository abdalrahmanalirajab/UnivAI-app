import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";
import { SCENARIOS, isStandalone } from "@/lib/runtime";

export default function ScenarioPage() {
  if (!isStandalone()) notFound();
  return (
    <Stack spacing={3}>
      <Alert severity="warning">Standalone development data</Alert>
      <Typography variant="h4">Fixture scenarios</Typography>
      <Typography color="text.secondary">
        Set UNIVAI_SCENARIO to one of these values and restart the standalone server.
        The happy scenario is fully seeded; the remaining values exercise bounded
        empty, generation, grading, and upstream-error adapter states.
      </Typography>
      {SCENARIOS.map((scenario) => (
        <Card variant="outlined" key={scenario}>
          <CardContent>
            <Stack spacing={1}>
              <Typography variant="h6">{scenario}</Typography>
              <Button href={`/dashboard?scenario=${scenario}`} variant="outlined">
                Open dashboard
              </Button>
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
