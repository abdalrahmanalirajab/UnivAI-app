"use client";

import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import MultiBookUploader from "./MultiBookUploader";
import SourceLibrary, { type CurriculumReadiness } from "./SourceLibrary";

type Collection = {
  id: number;
  name: string;
  created_at: string;
};

export default function CollectionsPage() {
  const router = useRouter();
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [building, setBuilding] = useState(false);
  const [readiness, setReadiness] = useState<CurriculumReadiness | null>(null);
  // The curriculum this collection already has, so the button can say what it
  // will actually do. null = none built yet; undefined = not looked up yet.
  const [programmeId, setProgrammeId] = useState<number | null | undefined>(undefined);
  // Set when the server refuses to rebuild over edits until we confirm.
  const [rebuildPrompt, setRebuildPrompt] = useState(false);
  const [continueMode, setContinueMode] = useState<"curriculum" | "schedule" | null>(null);

  const active = collections?.[0] ?? null;

  const handleReadinessChange = useCallback((next: CurriculumReadiness) => {
    setReadiness(next);
  }, []);

  const loadCollections = useCallback(async () => {
    try {
      const res = await fetch("/api/collections", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load collections.");
      const data = await res.json();
      setCollections(data.collections);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load collections.");
    }
  }, []);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get("continue");
    setContinueMode(mode === "curriculum" || mode === "schedule" ? mode : null);
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/programmes?collectionId=${active.id}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setProgrammeId(data.programme?.id ?? null);
      } catch {
        // A failed lookup only costs the button its better label.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, reloadKey]);

  async function createCollection() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create collection.");
      }
      setName("");
      await loadCollections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create collection.");
    } finally {
      setCreating(false);
    }
  }

  const buildCurriculum = useCallback(async (rebuildEdited = false) => {
    if (!active) return;
    setBuilding(true);
    setError(null);
    try {
      const res = await fetch("/api/programmes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId: active.id, rebuildEdited }),
      });
      const data = await res.json();
      // The learner has shaped this curriculum and rebuilding would discard
      // that. Ask before spending their edits, not after.
      if (res.status === 409 && data.code === "CURRICULUM_EDITED") {
        setRebuildPrompt(true);
        return;
      }
      if (!res.ok || !data.programme?.id) {
        throw new Error(data.error ?? "Failed to build the curriculum.");
      }
      setProgrammeId(data.programme.id);
      router.push(`/curriculum/${data.programme.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build the curriculum.");
    } finally {
      setBuilding(false);
    }
  }, [active, router]);

  useEffect(() => {
    if (!continueMode || !active || !readiness?.usable || programmeId === undefined || building) {
      return;
    }
    if (continueMode === "schedule") {
      if (!readiness.awaitingApproval) router.replace("/schedule");
      return;
    }
    if (programmeId) {
      router.replace(`/curriculum/${programmeId}`);
    } else {
      void buildCurriculum();
    }
  }, [active, buildCurriculum, building, continueMode, programmeId, readiness, router]);

  if (!collections) {
    return <CircularProgress />;
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Source Library</Typography>

      {error ? (
        <Alert severity="error">
          <AlertTitle>Error</AlertTitle>
          {error}
        </Alert>
      ) : null}

      {collections.length === 0 ? (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="subtitle1">Create your first collection</Typography>
              <Typography variant="body2" color="text.secondary">
                Keep related study materials together.
              </Typography>
              <Stack direction="row" spacing={2}>
                <TextField
                  label="Collection name"
                  size="small"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={creating}
                />
                <Button
                  variant="contained"
                  onClick={createCollection}
                  disabled={creating || !name.trim()}
                >
                  Create
                </Button>
                {creating ? <CircularProgress size={24} /> : null}
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={3}>
          <Typography variant="subtitle1" color="text.secondary">
            Collection: {active?.name}
          </Typography>

          {/* One button, but not one action: with no curriculum yet this
              builds one, and once there is one it opens the workspace — the
              server returns the existing plan rather than rebuilding. Saying
              "Build Curriculum" in both states described only the first. */}
          <Button
            variant="contained"
            onClick={() => buildCurriculum()}
            disabled={building || readiness?.usable !== true}
          >
            {building
              ? "Building Curriculum…"
              : programmeId
                ? "Open Curriculum"
                : "Build Curriculum"}
          </Button>
          {building ? (
            <Alert severity="info" icon={<CircularProgress size={20} />}>
              Analysing your ready books and creating the curriculum. This can take several minutes.
            </Alert>
          ) : readiness === null ? (
            <Alert severity="info" icon={<CircularProgress size={20} />}>
              Checking your books…
            </Alert>
          ) : readiness.processing ? (
            <Alert
              severity={readiness.usable ? "success" : "info"}
              icon={<CircularProgress size={20} />}
            >
              <AlertTitle>
                {readiness.usable ? "Course usable while generation continues" : "Preparing your course"}
              </AlertTitle>
              {readiness.message} This status updates automatically.
              {readiness.usable ? " You can build the curriculum now." : ""}
            </Alert>
          ) : readiness.failed ? (
            <Alert severity={readiness.usable ? "warning" : "error"}>
              <AlertTitle>
                {readiness.usable ? "Completed work is still usable" : "Course preparation failed"}
              </AlertTitle>
              {readiness.message}
            </Alert>
          ) : readiness.awaitingApproval ? (
            <Alert severity="info">
              <AlertTitle>Course plan ready — approve to build it</AlertTitle>
              {readiness.message}
            </Alert>
          ) : readiness.ready ? (
            <Alert severity="success">
              <AlertTitle>Ready to build</AlertTitle>
              {readiness.message}
            </Alert>
          ) : (
            <Alert severity={readiness.usable ? "warning" : "info"}>
              <AlertTitle>{readiness.usable ? "Course partially ready" : "Preparing course"}</AlertTitle>
              {readiness.message}
              {readiness.usable ? " Build now or generate the next step when convenient." : ""}
            </Alert>
          )}

          <SourceLibrary
            key={active!.id}
            collectionId={active!.id}
            reloadKey={reloadKey}
            onReadinessChange={handleReadinessChange}
          />

          <MultiBookUploader
            collectionId={active!.id}
            onDocumentsChange={() => setReloadKey((k) => k + 1)}
          />
        </Stack>
      )}

      <Dialog open={rebuildPrompt} onClose={() => setRebuildPrompt(false)}>
        <DialogTitle>Rebuild this curriculum?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have edited this curriculum — renamed, reordered or merged its
            courses. Rebuilding it from your books replaces those changes, and
            they cannot be recovered.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRebuildPrompt(false)}>Keep my curriculum</Button>
          <Button
            color="error"
            onClick={() => {
              setRebuildPrompt(false);
              buildCurriculum(true);
            }}
          >
            Rebuild and replace
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
