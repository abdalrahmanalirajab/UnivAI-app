"use client";

import { useState } from "react";
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
import type { ProgrammePlanV1, Course } from "@/test/fixtures/programme-plan-v1";
import ProgrammeGraph from "./ProgrammeGraph";

type Props = {
  programme: Programme;
  programmeId: number;
  onProgrammeUpdated: (p: Programme) => void;
};

function renameCourse(plan: ProgrammePlanV1, courseId: string, newTitle: string): ProgrammePlanV1 {
  return {
    ...plan,
    courses: plan.courses.map((c) => (c.id === courseId ? { ...c, title: newTitle } : c)),
  };
}

function reorderCourses(
  plan: ProgrammePlanV1,
  semesterId: string,
  courseIds: string[],
): ProgrammePlanV1 {
  return {
    ...plan,
    semesters: plan.semesters.map((s) =>
      s.id === semesterId ? { ...s, course_ids: courseIds } : s,
    ),
  };
}

function mergeCourses(
  plan: ProgrammePlanV1,
  targetCourseIds: string[],
  intoTitle: string,
): ProgrammePlanV1 {
  const merged = plan.courses.filter((c) => targetCourseIds.includes(c.id));
  if (merged.length === 0) return plan;
  const newId = `merged_${targetCourseIds.join("_")}`;
  const newCourse: Course = {
    id: newId,
    title: intoTitle,
    credits: merged.reduce((s, c) => s + c.credits, 0),
    lecture_hours: merged.reduce((s, c) => s + c.lecture_hours, 0),
    tutorial_hours: merged.reduce((s, c) => s + c.tutorial_hours, 0),
    lab_hours: merged.reduce((s, c) => s + c.lab_hours, 0),
    description: merged.map((c) => c.title).join("; "),
  };
  const keep = plan.courses.filter((c) => !targetCourseIds.includes(c.id));
  const dedup = (ids: string[]): string[] =>
    ids
      .map((id) => (targetCourseIds.includes(id) ? newId : id))
      .filter((id, i, a) => a.indexOf(id) === i);
  return {
    ...plan,
    courses: [...keep, newCourse],
    semesters: plan.semesters.map((s) => ({ ...s, course_ids: dedup(s.course_ids) })),
    prerequisites: plan.prerequisites
      .filter((p) => !targetCourseIds.includes(p.course_id))
      .map((p) => ({ ...p, requires: dedup(p.requires) })),
    source_coverage: plan.source_coverage.map((sc) => ({
      ...sc,
      course_ids: dedup(sc.course_ids),
    })),
  };
}

function splitCourse(
  plan: ProgrammePlanV1,
  courseId: string,
  parts: { title: string; credits: number }[],
): ProgrammePlanV1 {
  const original = plan.courses.find((c) => c.id === courseId);
  if (!original || parts.length === 0) return plan;
  const newCourses: Course[] = parts.map((part, i) => ({
    id: `${courseId}_part_${i}`,
    title: part.title,
    credits: part.credits,
    lecture_hours: Math.round(original.lecture_hours / parts.length),
    tutorial_hours: Math.round(original.tutorial_hours / parts.length),
    lab_hours: Math.round(original.lab_hours / parts.length),
    description: original.description,
  }));
  const newIds = newCourses.map((c) => c.id);
  const replaceId = (id: string) => (id === courseId ? newIds : [id]);
  return {
    ...plan,
    courses: [...plan.courses.filter((c) => c.id !== courseId), ...newCourses],
    semesters: plan.semesters.map((s) => ({
      ...s,
      course_ids: s.course_ids.flatMap(replaceId),
    })),
    prerequisites: [
      ...plan.prerequisites.filter((p) => p.course_id !== courseId),
      ...plan.prerequisites
        .filter((p) => p.requires.includes(courseId))
        .map((p) => ({ ...p, requires: [...p.requires.filter((r) => r !== courseId), ...newIds] })),
    ],
    source_coverage: plan.source_coverage.map((sc) => ({
      ...sc,
      course_ids: sc.course_ids.flatMap(replaceId),
    })),
  };
}

function excludeCourse(plan: ProgrammePlanV1, courseId: string): ProgrammePlanV1 {
  return {
    ...plan,
    courses: plan.courses.filter((c) => c.id !== courseId),
    semesters: plan.semesters.map((s) => ({
      ...s,
      course_ids: s.course_ids.filter((id) => id !== courseId),
    })),
    prerequisites: plan.prerequisites.filter((p) => p.course_id !== courseId),
    source_coverage: plan.source_coverage.map((sc) => ({
      ...sc,
      course_ids: sc.course_ids.filter((id) => id !== courseId),
    })),
  };
}

export default function CurriculumWorkspace({
  programme: initial,
  programmeId,
  onProgrammeUpdated,
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

  function handleStaleResponse(current: Programme) {
    setProgramme(current);
    onProgrammeUpdated(current);
    setStaleWarning(
      "Another change was made to this programme. Your edit was not applied. The latest version is shown below.",
    );
  }

  async function savePlan(newPlan: ProgrammePlanV1) {
    setSaving(true);
    setError(null);
    setStaleWarning(null);
    try {
      const res = await fetch(`/api/programmes/${programmeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: newPlan, planVersion: version }),
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
    const updated = renameCourse(plan, renameCourseId, renameTitle.trim());
    await savePlan(updated);
    setRenameOpen(false);
  }

  // ── Reorder ──

  function openReorder(semesterId: string) {
    const semester = plan.semesters.find((s) => s.id === semesterId);
    if (!semester) return;
    setReorderSemesterId(semesterId);
    setReorderIds([...semester.course_ids]);
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
    if (!reorderSemesterId) return;
    const updated = reorderCourses(plan, reorderSemesterId, reorderIds);
    await savePlan(updated);
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
    const updated = mergeCourses(plan, mergeSelected, mergeTitle.trim());
    await savePlan(updated);
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
    const updated = splitCourse(plan, splitCourseId, valid);
    await savePlan(updated);
    setSplitOpen(false);
  }

  // ── Exclude ──

  async function submitExclude(courseId: string) {
    const updated = excludeCourse(plan, courseId);
    await savePlan(updated);
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

      <ProgrammeGraph plan={plan} />

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
          <Button variant="contained" onClick={submitReorder} disabled={saving}>
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
