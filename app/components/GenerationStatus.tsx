import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/**
 * Generation status badge. The real state vocabulary comes from the
 * `books.status` column (standalone/schema.sql) and the route literals in
 * app/api/upload/route.ts and app/api/admin/generate/route.ts:
 * pending | ingesting | generating | ready | failed.
 *
 * A degraded/fallback generation is its own clearly-labeled warning state,
 * never rendered the same as a successful result. Any value outside the
 * known vocabulary renders an explicit "Unknown status" warning as well —
 * an unrecognized status must never read as success (issue rule 8).
 */

const STATUS_PRESENTATION: Record<
  string,
  { color: "default" | "error" | "info" | "success" | "warning"; label: string }
> = {
  pending: { color: "default", label: "Pending" },
  ingesting: { color: "info", label: "Ingesting" },
  generating: { color: "info", label: "Generating" },
  ready: { color: "success", label: "Ready" },
  failed: { color: "error", label: "Failed" },
  degraded: { color: "warning", label: "Degraded" },
};

const UNKNOWN_STATUS = { color: "warning" as const, label: "Unknown status" };

export default function GenerationStatus({
  status,
  progress,
}: {
  status: string;
  progress?: string | null;
}) {
  const presentation = STATUS_PRESENTATION[status] ?? UNKNOWN_STATUS;

  return (
    <Stack spacing={0.5}>
      <Chip size="small" color={presentation.color} label={presentation.label} />
      {progress ? (
        <Typography variant="caption" color="text.secondary">
          {progress}
        </Typography>
      ) : null}
    </Stack>
  );
}
