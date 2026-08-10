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
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import SubscriptionTeaser from "@/app/components/SubscriptionTeaser";

type Transcript = {
  id: string;
  courseTitle: string;
  quizPercentage: number;
  attendancePercentage: number;
  midtermPercentage: number;
  finalPercentage: number;
  courseworkPoints: number;
  totalPercentage: number;
  letterGrade: string;
  gpa: number;
  passed: boolean;
  completedAt: string;
  certificateId: string | null;
};

type PendingTranscript = {
  id: string;
  courseTitle: string;
  completedAt: string;
  releaseAt: string;
  reviewStatus: "pending" | "held";
};

export default function TranscriptPage() {
  const [transcripts, setTranscripts] = useState<Transcript[] | null>(null);
  const [pending, setPending] = useState<PendingTranscript[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/transcript", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load your transcript.");
      setTranscripts(body.transcripts ?? []);
      setPending(body.pending ?? []);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your transcript.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function downloadCertificate(transcript: Transcript) {
    if (transcript.certificateId) {
      window.location.assign(`/api/certificates/${transcript.certificateId}`);
      return;
    }
    setIssuing(transcript.id);
    setError(null);
    try {
      const response = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptId: transcript.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not create the certificate.");
      await load();
      window.location.assign(body.downloadUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the certificate.");
    } finally {
      setIssuing(null);
    }
  }

  if (!transcripts) return <CircularProgress />;
  const cumulativeGpa = transcripts.length
    ? transcripts.reduce((sum, transcript) => sum + transcript.gpa, 0) / transcripts.length
    : 0;

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h4">Academic transcript</Typography>
        <Typography color="text.secondary">
          Course work is 60%: quizzes 30%, lecture attendance 10%, and midterms 20%.
          The final exam is 40%.
        </Typography>
      </Stack>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {pending.map((transcript) => (
        <Card key={transcript.id} variant="outlined">
          <CardContent>
            <Stack spacing={1}>
              <Grid container spacing={1} className="align-center">
                <Grid size="grow">
                  <Typography variant="h6">{transcript.courseTitle}</Typography>
                </Grid>
                <Grid>
                  <Chip
                    color={transcript.reviewStatus === "held" ? "warning" : "info"}
                    label={transcript.reviewStatus === "held" ? "Under review" : "Review window"}
                  />
                </Grid>
              </Grid>
              <Typography color="text.secondary">
                {transcript.reviewStatus === "held"
                  ? "An administrator is checking this result. Your exam score remains visible in Assessments."
                  : `Your official transcript and certificate unlock automatically on ${new Date(transcript.releaseAt).toLocaleString()}.`}
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      ))}
      {transcripts.length ? (
        <Card variant="outlined">
          <CardContent>
            <Grid container spacing={3} className="align-center">
              <Grid size="grow">
                <Typography variant="overline">Cumulative GPA</Typography>
                <Typography variant="h4">{cumulativeGpa.toFixed(2)} / 4.00</Typography>
              </Grid>
              <Grid>
                <Typography variant="overline">Completed courses</Typography>
                <Typography variant="h4">{transcripts.length}</Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      ) : null}
      {transcripts.length === 0 && pending.length === 0 ? (
        <Alert severity="info">Your transcript review starts after your final exam is graded.</Alert>
      ) : (
        transcripts.map((transcript) => (
          <Card key={transcript.id} variant="outlined">
            <CardContent>
              <Stack spacing={2}>
                <Grid container spacing={2} className="align-center">
                  <Grid size="grow">
                    <Typography variant="h5">{transcript.courseTitle}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Completed {new Date(transcript.completedAt).toLocaleDateString()}
                    </Typography>
                  </Grid>
                  <Grid>
                    <Chip
                      color={transcript.passed ? "success" : "error"}
                      label={`Grade ${transcript.letterGrade}`}
                    />
                  </Grid>
                  <Grid>
                    <Typography variant="h5">{transcript.totalPercentage.toFixed(2)}%</Typography>
                    <Typography variant="body2">GPA {transcript.gpa.toFixed(2)} / 4.00</Typography>
                  </Grid>
                </Grid>
                <Divider />
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Component</TableCell>
                      <TableCell align="right">Your score</TableCell>
                      <TableCell align="right">Course weight</TableCell>
                      <TableCell align="right">Points earned</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[
                      ["Quizzes", transcript.quizPercentage, 30],
                      ["Lecture attendance", transcript.attendancePercentage, 10],
                      ["Midterms", transcript.midtermPercentage, 20],
                      ["Final exam", transcript.finalPercentage, 40],
                    ].map(([label, score, weight]) => (
                      <TableRow key={String(label)}>
                        <TableCell>{label}</TableCell>
                        <TableCell align="right">{Number(score).toFixed(2)}%</TableCell>
                        <TableCell align="right">{weight}%</TableCell>
                        <TableCell align="right">
                          {((Number(score) * Number(weight)) / 100).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {transcript.passed ? (
                  <Button
                    variant="contained"
                    disabled={issuing === transcript.id}
                    onClick={() => void downloadCertificate(transcript)}
                  >
                    {issuing === transcript.id ? "Creating certificate…" : "Download certificate!"}
                  </Button>
                ) : (
                  <Alert severity="error">An F grade does not receive a completion certificate.</Alert>
                )}
              </Stack>
            </CardContent>
          </Card>
        ))
      )}
      {transcripts.length > 0 ? <SubscriptionTeaser milestone="course-finished" /> : null}
    </Stack>
  );
}
