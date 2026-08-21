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
import OutputFeedback from "@/app/components/OutputFeedback";
import { curriculumFeedbackTarget } from "@/lib/ai-output-feedback-types";
import CurriculumWorkspace from "./CurriculumWorkspace";
import type { ApprovalBlock } from "./ProgrammeGraph";

type Props = {
  params: Promise<{ programmeId: string }>;
};

type GenerationEstimate = {
  books: number;
  pages: number;
  cacheStatus: "all" | "some" | "none";
};

const HOUR_BUCKETS = [2, 4, 6, 8, 12, 18, 24, 36, 48, 72];

function preparationEstimate(estimate: GenerationEstimate): string {
  const pages = Math.max(1, estimate.pages);
  const rawHours = estimate.cacheStatus === "all"
    ? Math.min(24, 2 + pages / 60)
    : estimate.cacheStatus === "some"
      ? Math.min(48, 5 + pages / 30)
      : Math.min(72, 8 + pages / 15);
  const hours = HOUR_BUCKETS.find((bucket) => bucket >= rawHours) ?? 72;
  return hours < 24 ? `${hours} hours` : `${Math.ceil(hours / 24)} days`;
}

export default function CurriculumPage({ params }: Props) {
  const [programme, setProgramme] = useState<Programme | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [programmeId, setProgrammeId] = useState<number | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [approvalBlocks, setApprovalBlocks] = useState<ApprovalBlock[]>([]);
  const [generationNotice, setGenerationNotice] = useState<GenerationEstimate | null>(null);

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
    if (approvalBlocks.length > 0 || !programme.schedule) return;
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
      if (data.coursesStarted > 0 && data.generationEstimate) {
        setGenerationNotice(data.generationEstimate as GenerationEstimate);
      } else {
        window.location.assign("/library?continue=schedule");
      }
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
            disabled={approving || approvalBlocks.length > 0 || !programme.schedule}
          >
            {approving ? "Approving…" : "Approve"}
          </Button>
        ) : (
          <Button variant="outlined" disabled>
            Approved
          </Button>
        )}
      </Stack>

      {programme.status !== "approved" && approvalBlocks.length > 0 ? (
        <Alert severity="error">
          <AlertTitle>Approval blocked</AlertTitle>
          The learning path has unresolved issues. Review the specific reasons
          listed below before requesting approval.
        </Alert>
      ) : null}

      {programme.status !== "approved" && !programme.schedule ? (
        <Alert severity="warning">
          <AlertTitle>Weekly schedule required</AlertTitle>
          Choose and save the permanent lecture and section day/time before approval.
        </Alert>
      ) : null}

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
        key={`${programme.id}:${programme.plan_version}:${programme.status}`}
        programme={programme}
        programmeId={programmeId!}
        onProgrammeUpdated={handleProgrammeUpdated}
        onApprovalBlocksChange={setApprovalBlocks}
      />

      <OutputFeedback
        key={`feedback:${programme.id}:${programme.plan_version}`}
        target={curriculumFeedbackTarget(programme.id, programme.plan_version)}
      />

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Approve this curriculum?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Approval is final. Your course will be prepared from this plan, and the
            curriculum can no longer be edited.
          </DialogContentText>
          <DialogContentText>
            Are you sure you want to approve &ldquo;{programme.name}&rdquo;?
          </DialogContentText>
          {programme.schedule ? (
            <DialogContentText>
              Lecture: {programme.schedule.lectureLocalTime} every week; section: {programme.schedule.sectionLocalTime} every week ({programme.schedule.timezone}). These slots cannot be changed after approval.
            </DialogContentText>
          ) : null}
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

      <Dialog
        open={generationNotice !== null}
        onClose={() => window.location.assign("/library?continue=schedule")}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {generationNotice?.cacheStatus === "all"
            ? "Good news — your course is cached"
            : generationNotice?.cacheStatus === "some"
              ? "Some course content is cached"
              : "Your course is now being built"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1}>
            <DialogContentText>
              {generationNotice?.cacheStatus === "all"
                ? "We found fully prepared copies of your books."
                : generationNotice?.cacheStatus === "some"
                  ? "We found prepared copies for some books and will build the rest."
                  : "These books are new, so we are building the course for the first time."}
              {generationNotice
                ? ` Based on ${generationNotice.pages > 0 ? `${generationNotice.pages} pages` : "the book size"}, it should take about ${preparationEstimate(generationNotice)}.`
                : ""}
            </DialogContentText>
            <DialogContentText>
              We’ll email you when everything is ready. You can relax 🙂
            </DialogContentText>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => window.location.assign("/library?continue=schedule")}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
