"use client";

import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import TablePagination from "@mui/material/TablePagination";
import Typography from "@mui/material/Typography";

type RetakeRequest = {
  studentId: string;
  studentName: string;
  studentEmail: string;
  curriculumId: string;
  requestedAt: string;
  reason: string;
  availableAt: string;
  closesAt: string;
  provisionalResult: { mark: number; maxScore: number; passed: boolean } | null;
};

export default function FinalRetakeReviewManager({ registrationNumber }: { registrationNumber: string }) {
  const [requests, setRequests] = useState<RetakeRequest[] | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/admin/final-retakes?sid=${encodeURIComponent(registrationNumber)}&page=${page + 1}&pageSize=${pageSize}`,
        { cache: "no-store" },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Could not load retake requests.");
      setRequests(body.requests ?? []);
      setTotal(Number(body.pagination?.total ?? 0));
      setError(null);
    } catch (cause) {
      setRequests([]);
      setError(cause instanceof Error ? cause.message : "Could not load retake requests.");
    }
  }, [page, pageSize, registrationNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decline(request: RetakeRequest) {
    setBusy(request.curriculumId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/final-retakes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: request.studentId,
          curriculumId: request.curriculumId,
          reason,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Could not decline the retake.");
      setReason("");
      setNotice(
        body.gradeFinalized
          ? "Retake declined, learner emailed, and the official grade was set."
          : "Retake declined and learner emailed. The primary submission is still awaiting its grade.",
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not decline the retake.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack spacing={0.5}>
            <Typography variant="h5">Final-exam retake requests</Typography>
            <Typography variant="body2" color="text.secondary">
              Requests become available automatically after seven days. Decline only before the
              reserve attempt starts; a reason is recorded and emailed to the learner.
            </Typography>
          </Stack>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {notice ? <Alert severity="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}
          {requests === null ? <CircularProgress size={28} /> : null}
          {requests?.length === 0 ? <Alert severity="info">No pending retake request for this learner.</Alert> : null}
          {requests?.map((request) => (
            <Stack key={`${request.studentId}:${request.curriculumId}`} spacing={1.5}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Stack spacing={0.25}>
                  <Typography variant="subtitle1">{request.studentName}</Typography>
                  <Typography variant="body2">{request.reason}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Requested {new Date(request.requestedAt).toLocaleString()} · opens {new Date(request.availableAt).toLocaleString()}
                  </Typography>
                </Stack>
                <Chip
                  label={request.provisionalResult
                    ? `${request.provisionalResult.mark}/${request.provisionalResult.maxScore} provisional`
                    : "No confirmed primary score"}
                  variant="outlined"
                />
              </Stack>
              <TextField
                label="Reason for declining"
                value={reason}
                onChange={(event) => setReason(event.target.value.slice(0, 500))}
                helperText={`${reason.length}/500 · required for the learner and audit record`}
                multiline
                minRows={2}
              />
              <Button
                color="error"
                variant="outlined"
                disabled={busy === request.curriculumId || reason.trim().length < 10}
                onClick={() => void decline(request)}
              >
                Decline request and set grade
              </Button>
            </Stack>
          ))}
          {requests !== null && total > 0 ? (
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
