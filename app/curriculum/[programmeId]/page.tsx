"use client";

import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Programme } from "@/lib/programmes";
import CurriculumWorkspace from "./CurriculumWorkspace";

type Props = {
  params: Promise<{ programmeId: string }>;
};

export default function CurriculumPage({ params }: Props) {
  const [programme, setProgramme] = useState<Programme | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [programmeId, setProgrammeId] = useState<number | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  const fetchProgramme = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/programmes/${id}`, { cache: "no-store" });
      if (res.status === 404) {
        setProgramme(null);
        setError("Programme not found.");
        return;
      }
      if (!res.ok) throw new Error("Failed to load programme.");
      const data = await res.json();
      setProgramme(data.programme);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load programme.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const { programmeId: raw } = await params;
      const id = Number(raw);
      if (!Number.isFinite(id)) {
        setError("Invalid programme ID.");
        setLoading(false);
        return;
      }
      setProgrammeId(id);
      fetchProgramme(id);
    };
    init();
  }, [params, fetchProgramme]);

  function handleProgrammeUpdated(p: Programme) {
    setProgramme(p);
  }

  async function handleApprove() {
    if (!programme || !programmeId) return;
    setApproving(true);
    setApproveError(null);
    try {
      const res = await fetch(`/api/programmes/${programmeId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planVersion: programme.plan_version }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.current) {
          setProgramme(data.current as Programme);
          setApproveError(
            data.error === "Programme is already approved."
              ? data.error
              : "Stale plan version. The latest version is shown below — review and try again.",
          );
          return;
        }
        throw new Error(data.error ?? "Failed to approve programme.");
      }
      const updated = data.programme as Programme;
      setProgramme(updated);
      setApproved(true);
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : "Failed to approve programme.");
    } finally {
      setApproving(false);
      setConfirmOpen(false);
    }
  }

  if (loading) {
    return <CircularProgress />;
  }

  if (error && !programme) {
    return (
      <Stack spacing={2}>
        <Alert severity="error">
          <AlertTitle>Error</AlertTitle>
          {error}
        </Alert>
        {programmeId ? (
          <Button
            variant="contained"
            onClick={() => fetchProgramme(programmeId)}
          >
            Retry
          </Button>
        ) : null}
      </Stack>
    );
  }

  if (!programme) {
    return (
      <Stack spacing={2}>
        <Alert severity="warning">
          <AlertTitle>Not found</AlertTitle>
          Programme not found.
        </Alert>
        <Button variant="outlined" href="/library">
          Back to Library
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2}>
        <Typography variant="h4">Curriculum Workspace</Typography>
        {programme.status !== "approved" ? (
          <Button
            variant="contained"
            color="primary"
            onClick={() => setConfirmOpen(true)}
            disabled={approving}
          >
            {approving ? "Approving…" : "Request Approval"}
          </Button>
        ) : (
          <Button variant="outlined" disabled>
            Approved
          </Button>
        )}
      </Stack>

      {approveError ? (
        <Alert severity="warning">
          <AlertTitle>Approval issue</AlertTitle>
          {approveError}
        </Alert>
      ) : null}

      {approved ? (
        <Alert severity="success">
          <AlertTitle>Approved</AlertTitle>
          This programme has been approved and expensive generation has been triggered.
        </Alert>
      ) : null}

      <CurriculumWorkspace
        programme={programme}
        programmeId={programmeId!}
        onProgrammeUpdated={handleProgrammeUpdated}
      />

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Approve this curriculum?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Approval is a permanent action. Once approved, the system will begin
            expensive generation of lecture content, slides, and assessments from
            this plan. This cannot be undone and the curriculum can no longer be
            edited.
          </DialogContentText>
          <DialogContentText>
            Are you sure you want to approve &ldquo;{programme.name}&rdquo;?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={approving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleApprove}
            disabled={approving}
          >
            {approving ? "Approving…" : "Yes, approve"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
