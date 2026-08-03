"use client";

import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import MergeIcon from "@mui/icons-material/Merge";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import type { Programme } from "@/lib/programmes";
import type { Course } from "@/test/fixtures/programme-plan-v1";
import ProgrammeGraph, {
  getApprovalBlocks,
  type ApprovalBlock,
  type LearningPathLoad,
} from "./ProgrammeGraph";

type Props = {
  programme: Programme;
  programmeId: number;
  onProgrammeUpdated: (p: Programme) => void;
  learningPath?: LearningPathLoad;
  completedBookIds?: number[];
  onApprovalBlocksChange?: (blocks: ApprovalBlock[]) => void;
};

type PlanEdit =
  | { operation: "rename"; courseId: string; newTitle: string }
  | { operation: "reorder"; semesterId: string; courseIds: string[]; reason: string }
  | { operation: "merge"; targetCourseIds: string[]; intoTitle: string }
  | {
      operation: "split";
      courseId: string;
      parts: { title: string; credits: number }[];
    }
  | { operation: "exclude"; courseId: string };

export default function CurriculumWorkspace({
  programme: initial,
  programmeId,
  onProgrammeUpdated,
  learningPath,
  completedBookIds,
  onApprovalBlocksChange,
}: Props) {
  const [programme, setProgramme] = useState<Programme>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleWarning, setStaleWarning] = useState<string | null>(null);

  // Rename dialog
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameCourseId, setRenameCourseId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");

  // Reorder dialog
  const [reorderOpen, setReorderOpen] = useState(false);
  const [reorderSemesterId, setReorderSemesterId] = useState<string | null>(null);
  const [reorderIds, setReorderIds] = useState<string[]>([]);
  const [reorderReason, setReorderReason] = useState("");

  // Merge dialog
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSelected, setMergeSelected] = useState<string[]>([]);
  const [mergeTitle, setMergeTitle] = useState("");

  // Split dialog
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitCourseId, setSplitCourseId] = useState<string | null>(null);
  const [splitParts, setSplitParts] = useState<{ title: string; credits: number }[]>([
    { title: "", credits: 0 },
    { title: "", credits: 0 },
  ]);

  const plan = programme.plan;
  const version = programme.plan_version;
  const resolvedLearningPath = useMemo<LearningPathLoad>(
    () => learningPath ?? { status: "ready", data: plan.learning_path ?? null },
    [learningPath, plan.learning_path],
  );

  // Approval-blocking rules, evaluated against the validated learning-path
  // contract and the exact version the app currently holds. Blocks are only
  // reported when the data is ready; they are surfaced to the parent (which
  // owns the approve control) and rendered here with each specific reason.
  const approvalBlocks = useMemo(() => {
    if (resolvedLearningPath.status !== "ready") return [] as ApprovalBlock[];
    if (
      resolvedLearningPath.data === null &&
      Object.prototype.hasOwnProperty.call(plan, "learning_path")
    ) {
      return [
        { kind: "missing-evidence", reason: "The versioned learning path is not available." },
      ] satisfies ApprovalBlock[];
    }
    return getApprovalBlocks(resolvedLearningPath.data, programme.plan_version);
  }, [resolvedLearningPath, programme.plan_version, plan]);

  useEffect(() => {
    onApprovalBlocksChange?.(approvalBlocks);
  }, [approvalBlocks, onApprovalBlocksChange]);

  function handleStaleResponse(current: Programme) {
    setProgramme(current);
    onProgrammeUpdated(current);
    setStaleWarning(
      "Another change was made to this programme. Your edit was not applied. The latest version is shown below.",
    );
  }

  async function savePlan(edit: PlanEdit) {
    setSaving(true);
    setError(null);
    setStaleWarning(null);
    try {
      const res = await fetch(`/api/programmes/${programmeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...edit, expectedVersion: version }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.current) {
          handleStaleResponse(data.current as Programme);
          return;
        }
        throw new Error(data.error ?? "Failed to save plan.");
      }
      const updated = data.programme as Programme;
      setProgramme(updated);
      onProgrammeUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save plan.");
    } finally {
      setSaving(false);
    }
  }

  // ── Rename ──

  function openRename(courseId: string) {
    const course = plan.courses.find((c) => c.id === courseId);
    if (!course) return;
    setRenameCourseId(courseId);
    setRenameTitle(course.title);
    setRenameOpen(true);
  }

  async function submitRename() {
    if (!renameCourseId || !renameTitle.trim()) return;
    await savePlan({
      operation: "rename",
      courseId: renameCourseId,
      newTitle: renameTitle.trim(),
    });
    setRenameOpen(false);
  }

  // ── Reorder ──

  function openReorder(semesterId: string) {
    const semester = plan.semesters.find((s) => s.id === semesterId);
    if (!semester) return;
    setReorderSemesterId(semesterId);
    setReorderIds([...semester.course_ids]);
    setReorderReason("");
    setReorderOpen(true);
  }

  function moveReorderItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= reorderIds.length) return;
    const next = [...reorderIds];
    [next[index], next[target]] = [next[target], next[index]];
    setReorderIds(next);
  }

  async function submitReorder() {
    if (!reorderSemesterId || !reorderReason.trim()) return;
    await savePlan({
      operation: "reorder",
      semesterId: reorderSemesterId,
      courseIds: reorderIds,
      reason: reorderReason.trim(),
    });
    setReorderOpen(false);
  }

  // ── Merge ──

  function openMerge() {
    setMergeSelected([]);
    setMergeTitle("");
    setMergeOpen(true);
  }

  function toggleMerge(courseId: string) {
    setMergeSelected((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId],
    );
  }

  async function submitMerge() {
    if (mergeSelected.length < 2 || !mergeTitle.trim()) return;
    await savePlan({
      operation: "merge",
      targetCourseIds: mergeSelected,
      intoTitle: mergeTitle.trim(),
    });
    setMergeOpen(false);
  }

  // ── Split ──

  function openSplit(courseId: string) {
    const course = plan.courses.find((c) => c.id === courseId);
    if (!course) return;
    setSplitCourseId(courseId);
    setSplitParts([
      { title: course.title, credits: Math.floor(course.credits / 2) },
      { title: "", credits: course.credits - Math.floor(course.credits / 2) },
    ]);
    setSplitOpen(true);
  }

  function updateSplitPart(index: number, field: "title" | "credits", value: string | number) {
    setSplitParts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    );
  }

  function addSplitPart() {
    setSplitParts((prev) => [...prev, { title: "", credits: 0 }]);
  }

  function removeSplitPart(index: number) {
    setSplitParts((prev) => prev.filter((_, i) => i !== index));
  }

  async function submitSplit() {
    if (!splitCourseId) return;
    const valid = splitParts.filter((p) => p.title.trim() && p.credits > 0);
    if (valid.length < 2) return;
    await savePlan({
      operation: "split",
      courseId: splitCourseId,
      parts: valid,
    });
    setSplitOpen(false);
  }

  // ── Exclude ──

  async function submitExclude(courseId: string) {
    await savePlan({ operation: "exclude", courseId });
  }

  // ── Derived data ──

  const courseTitle = (id: string) =>
    plan.courses.find((c) => c.id === id)?.title ?? id;

  const orderedSemesters = plan.semesters
    .slice()
    .sort((a, b) => a.order - b.order);

  const totalCourses = plan.courses.length;
  const totalPrerequisites = plan.prerequisites.length;

  // ── Render ──

  return (
    <Stack spacing={3}>
      {error ? (
        <Alert severity="error">
          <AlertTitle>Error</AlertTitle>
          {error}
        </Alert>
      ) : null}

      {staleWarning ? (
        <Alert severity="warning">
          <AlertTitle>Stale version</AlertTitle>
          {staleWarning}
        </Alert>
      ) : null}

      {programme.status !== "approved" && approvalBlocks.length > 0 ? (
        <Alert severity="error">
          <AlertTitle>Approval blocked</AlertTitle>
          <List dense disablePadding>
            {approvalBlocks.map((block, index) => (
              <ListItem key={index} disableGutters disablePadding>
                <ListItemText primary={block.reason} />
              </ListItem>
            ))}
          </List>
        </Alert>
      ) : null}

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={2}>
              <Typography variant="subtitle1">
                {programme.name}
              </Typography>
              <Stack direction="row" spacing={1}>
                <Chip
                  size="small"
                  color={programme.status === "approved" ? "success" : "default"}
                  label={programme.status}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={`v${version}`}
                />
                {totalCourses > 0 ? (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${totalCourses} courses`}
                  />
                ) : null}
                {totalPrerequisites > 0 ? (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${totalPrerequisites} prerequisites`}
                  />
                ) : null}
              </Stack>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <ProgrammeGraph
        plan={plan}
        learningPath={resolvedLearningPath}
        completedBookIds={completedBookIds}
      />

      {programme.status !== "approved" ? (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="subtitle1">Edit Curriculum</Typography>

              <Grid container spacing={1}>
                <Grid>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<MergeIcon />}
                    onClick={openMerge}
                    disabled={saving || plan.courses.length < 2}
                  >
                    Merge courses
                  </Button>
                </Grid>
              </Grid>

              {orderedSemesters.map((semester) => {
                const semesterCourses = semester.course_ids
                  .map((id) => plan.courses.find((c) => c.id === id))
                  .filter((c): c is Course => c !== undefined);

                return (
                  <Card key={semester.id} variant="outlined">
                    <CardContent>
                      <Stack spacing={1}>
                        <Stack direction="row" spacing={2}>
                          <Typography variant="body2">
                            {semester.name}
                          </Typography>
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => openReorder(semester.id)}
                            disabled={saving}
                          >
                            Reorder
                          </Button>
                        </Stack>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Course</TableCell>
                              <TableCell>Credits</TableCell>
                              <TableCell>Hours</TableCell>
                              <TableCell align="right">Actions</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {semesterCourses.map((course) => (
                              <TableRow key={course.id}>
                                <TableCell>
                                  <Typography variant="body2">
                                    {course.title}
                                  </Typography>
                                </TableCell>
                                <TableCell>{course.credits}</TableCell>
                                <TableCell>
                                  {course.lecture_hours + course.tutorial_hours + course.lab_hours}
                                </TableCell>
                                <TableCell align="right">
                                  <Stack direction="row" spacing={0.5}>
                                    <IconButton
                                      size="small"
                                      onClick={() => openRename(course.id)}
                                      disabled={saving}
                                      aria-label={`Rename ${course.title}`}
                                    >
                                      <EditIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton
                                      size="small"
                                      onClick={() => openSplit(course.id)}
                                      disabled={saving || course.credits < 2}
                                      aria-label={`Split ${course.title}`}
                                    >
                                      <CallSplitIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={() => submitExclude(course.id)}
                                      disabled={saving || semesterCourses.length <= 1}
                                      aria-label={`Remove ${course.title}`}
                                    >
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </Stack>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      {saving ? (
        <Alert severity="info">Saving changes…</Alert>
      ) : null}

      {/* ── Rename Dialog ── */}
      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)}>
        <DialogTitle>Rename Course</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="New title"
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            margin="dense"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={submitRename}
            disabled={!renameTitle.trim() || saving}
          >
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Reorder Dialog ── */}
      <Dialog open={reorderOpen} onClose={() => setReorderOpen(false)}>
        <DialogTitle>Reorder Courses</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            required
            label="Reason for this order"
            value={reorderReason}
            onChange={(event) => setReorderReason(event.target.value)}
            margin="dense"
          />
          <List dense>
            {reorderIds.map((courseId, index) => (
              <ListItem key={courseId}>
                <Stack direction="row" spacing={1}>
                  <Stack direction="column">
                    <IconButton
                      size="small"
                      onClick={() => moveReorderItem(index, -1)}
                      disabled={index === 0}
                      aria-label="Move up"
                    >
                      <ArrowUpwardIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => moveReorderItem(index, 1)}
                      disabled={index === reorderIds.length - 1}
                      aria-label="Move down"
                    >
                      <ArrowDownwardIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                  <ListItemText primary={courseTitle(courseId)} />
                </Stack>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReorderOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={submitReorder} disabled={saving || !reorderReason.trim()}>
            Save Order
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Merge Dialog ── */}
      <Dialog open={mergeOpen} onClose={() => setMergeOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Merge Courses</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Select two or more courses to merge into one.
            </Typography>
            <List dense>
              {plan.courses.map((course) => (
                <ListItem key={course.id}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={mergeSelected.includes(course.id)}
                        onChange={() => toggleMerge(course.id)}
                      />
                    }
                    label={`${course.title} (${course.credits} cr, ${course.lecture_hours + course.tutorial_hours + course.lab_hours} h)`}
                  />
                </ListItem>
              ))}
            </List>
            <TextField
              fullWidth
              label="New course title"
              value={mergeTitle}
              onChange={(e) => setMergeTitle(e.target.value)}
              margin="dense"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMergeOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={submitMerge}
            disabled={mergeSelected.length < 2 || !mergeTitle.trim() || saving}
          >
            Merge
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Split Dialog ── */}
      <Dialog open={splitOpen} onClose={() => setSplitOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Split Course</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Divide this course into multiple parts. Each part must have a title and credits.
            </Typography>
            {splitParts.map((part, index) => (
              <Stack key={index} direction="row" spacing={1}>
                <TextField
                  label={`Part ${index + 1} title`}
                  value={part.title}
                  onChange={(e) => updateSplitPart(index, "title", e.target.value)}
                  size="small"
                />
                <TextField
                  label="Credits"
                  type="number"
                  value={part.credits}
                  onChange={(e) =>
                    updateSplitPart(index, "credits", Math.max(0, Number(e.target.value)))
                  }
                  size="small"
                  slotProps={{ htmlInput: { min: 0 } }}
                />
                {splitParts.length > 2 ? (
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => removeSplitPart(index)}
                    aria-label="Remove part"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                ) : null}
              </Stack>
            ))}
            <Button variant="text" size="small" onClick={addSplitPart}>
              + Add part
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSplitOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={submitSplit}
            disabled={
              saving ||
              splitParts.filter((p) => p.title.trim() && p.credits > 0).length < 2
            }
          >
            Split
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
