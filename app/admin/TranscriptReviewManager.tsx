"use client";

import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import TablePagination from "@mui/material/TablePagination";
import Typography from "@mui/material/Typography";

type ReviewStatus = "pending" | "held" | "released";
type Transcript = {
  id: string;
  courseTitle: string;
  totalPercentage: number;
  letterGrade: string;
  completedAt: string;
  releaseAt: string;
  reviewStatus: ReviewStatus;
  reviewNote: string | null;
};

export default function TranscriptReviewManager({ registrationNumber }: { registrationNumber: string }) {
  const [transcripts, setTranscripts] = useState<Transcript[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setTranscripts(null);
    try {
      const response = await fetch(
        `/api/admin/transcripts?sid=${encodeURIComponent(registrationNumber)}&page=${page + 1}&pageSize=${pageSize}`,
        { cache: "no-store" },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Could not load transcript reviews.");
      setTranscripts(body.transcripts ?? []);
      setTotal(Number(body.pagination?.total ?? 0));
      setError(null);
    } catch (reason) {
      setTranscripts([]);
      setError(reason instanceof Error ? reason.message : "Could not load transcript reviews.");
    }
  }, [page, pageSize, registrationNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(transcriptId: string, action: "hold" | "release") {
    setBusy(transcriptId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/transcripts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationNumber, transcriptId, action, note }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Could not save the review.");
      setNote("");
      setNotice(action === "release" ? "Transcript released to the learner." : "Transcript held for review.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the review.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack spacing={0.5}>
            <Typography variant="h5">Transcript review</Typography>
            <Typography variant="body2" color="text.secondary">
              Results release automatically seven days after the official final grade is selected. Release early when checked,
              or hold only when a real issue needs investigation.
            </Typography>
          </Stack>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {notice ? <Alert severity="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}
          {transcripts === null ? <CircularProgress size={28} /> : null}
          {transcripts?.length === 0 ? <Alert severity="info">No final transcript exists yet.</Alert> : null}
          {transcripts?.map((transcript, index) => (
            <Stack key={transcript.id} spacing={1.5}>
              {index ? <Divider /> : null}
              <Grid container spacing={1.5} className="align-center">
                <Grid size="grow">
                  <Stack spacing={0.25}>
                    <Typography variant="subtitle1">{transcript.courseTitle}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Grade {transcript.letterGrade} · {Number(transcript.totalPercentage).toFixed(2)}%
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Automatic release: {new Date(transcript.releaseAt).toLocaleString()}
                    </Typography>
                  </Stack>
                </Grid>
                <Grid>
                  <Chip
                    label={transcript.reviewStatus}
                    color={transcript.reviewStatus === "released" ? "success" : transcript.reviewStatus === "held" ? "warning" : "default"}
                    variant={transcript.reviewStatus === "pending" ? "outlined" : "filled"}
                  />
                </Grid>
              </Grid>
              {transcript.reviewStatus !== "released" ? (
                <>
                  <TextField
                    label="Review note (optional)"
                    value={note}
                    onChange={(event) => setNote(event.target.value.slice(0, 500))}
                    multiline
                    minRows={2}
                    helperText={`${note.length}/500`}
                  />
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Button
                      variant="contained"
                      disabled={busy === transcript.id}
                      onClick={() => void review(transcript.id, "release")}
                    >
                      Release now
                    </Button>
                    {transcript.reviewStatus === "pending" ? (
                      <Button
                        color="warning"
                        variant="outlined"
                        disabled={busy === transcript.id}
                        onClick={() => void review(transcript.id, "hold")}
                      >
                        Hold for investigation
                      </Button>
                    ) : null}
                  </Stack>
                </>
              ) : null}
            </Stack>
          ))}
          {transcripts !== null && total > 0 ? (
            <TablePagination
              component="div"
              count={total}
              page={page}
              rowsPerPage={pageSize}
              rowsPerPageOptions={[5, 10, 25]}
              onPageChange={(_event, nextPage) => setPage(nextPage)}
              onRowsPerPageChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(0);
              }}
            />
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
