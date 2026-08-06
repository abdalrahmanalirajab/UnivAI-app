"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Grid from "@mui/material/Grid";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { ProgrammePlanV1, Semester, Course, Prerequisite, SourceCoverage } from "@/test/fixtures/programme-plan-v1";
import type {
  LearningPathV1,
  LearningPathEdgeV1,
  LearningPathEvidenceV1,
} from "@/test/fixtures/learning-path-v1";

/**
 * How the caller supplies the cross-book learning path. When the prop is
 * absent (undefined) no learning-path data source is wired yet and nothing is
 * rendered; every other member renders an explicit state — loading, failed,
 * or ready (which may still be an empty contract) — nothing is silently
 * skipped.
 */
export type LearningPathLoad =
  | { status: "loading" }
  | { status: "failed"; error: string; retry?: () => void }
  | { status: "ready"; data: LearningPathV1 | null };

/**
 * Display-only confidence threshold, matching the fixture contract in
 * test/fixtures/learning-path-v1.ts (lowConfidenceFixture): edges below it
 * render a low-confidence warning. It only drives presentation — approval is
 * never gated on confidence or any other signal.
 */
const LOW_CONFIDENCE_THRESHOLD = 0.7;

type Props = {
  plan: ProgrammePlanV1;
  learningPath?: LearningPathLoad;
  completedBookIds?: number[];
};

export default function ProgrammeGraph({
  plan,
  learningPath,
  completedBookIds = [],
}: Props) {
  return (
    <Stack spacing={3}>
      <WorkloadCard workload={plan.workload} />

      <Typography variant="h6">Semesters</Typography>
      {plan.semesters
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((semester) => (
          <SemesterCard
            key={semester.id}
            semester={semester}
            courses={plan.courses}
            structures={plan.course_structure ?? []}
          />
        ))}

      <PrerequisitesTable prerequisites={plan.prerequisites} courses={plan.courses} />

      <SourceCoverageTable coverage={plan.source_coverage} />

      {learningPath ? (
        <LearningPathSection
          learningPath={learningPath}
          completedBookIds={completedBookIds}
        />
      ) : null}
    </Stack>
  );
}

function WorkloadCard({ workload }: { workload: ProgrammePlanV1["workload"] }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle1" gutterBottom>
          Workload
        </Typography>
        <Grid container spacing={2}>
          <Grid>
            <Chip
              size="small"
              variant="outlined"
              label={`${workload.total_credits} credits`}
            />
          </Grid>
          <Grid>
            <Chip
              size="small"
              variant="outlined"
              label={`${workload.total_lecture_hours} lecture hours`}
            />
          </Grid>
          <Grid>
            <Chip
              size="small"
              variant="outlined"
              label={`${workload.total_tutorial_hours} tutorial hours`}
            />
          </Grid>
          <Grid>
            <Chip
              size="small"
              variant="outlined"
              label={`${workload.total_lab_hours} lab hours`}
            />
          </Grid>
          <Grid>
            <Chip
              size="small"
              variant="outlined"
              label={`${workload.weeks_per_semester} weeks/semester`}
            />
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

function SemesterCard({
  semester,
  courses,
  structures,
}: {
  semester: Semester;
  courses: Course[];
  structures: NonNullable<ProgrammePlanV1["course_structure"]>;
}) {
  const semesterCourses = semester.course_ids
    .map((id) => courses.find((c) => c.id === id))
    .filter((c): c is Course => c !== undefined);

  return (
    <Card variant="outlined" key={semester.id}>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="subtitle1">
            {semester.name}
          </Typography>
          {semesterCourses.map((course) => (
            <Stack key={course.id} spacing={1}>
              <Typography variant="body1">
                {course.title}
              </Typography>
              <Grid container spacing={1}>
                <Grid>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${course.credits} cr`}
                  />
                </Grid>
                <Grid>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${course.lecture_hours}h lec`}
                  />
                </Grid>
                <Grid>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${course.tutorial_hours}h tut`}
                  />
                </Grid>
                <Grid>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${course.lab_hours}h lab`}
                />
              </Grid>
            </Grid>
              {course.description ? (
                <Typography variant="body2" color="text.secondary">
                  {course.description}
                </Typography>
              ) : null}
              <CourseCadence
                structure={structures
                  .find((candidate) => candidate.course_id === course.id)
                  ?.semesters.find((candidate) => candidate.semester === semester.order)}
              />
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

function CourseCadence({
  structure,
}: {
  structure: NonNullable<ProgrammePlanV1["course_structure"]>[number]["semesters"][number] | undefined;
}) {
  if (!structure) return null;
  const counted = (count: number, singular: string, plural = `${singular}s`) =>
    `${count} ${count === 1 ? singular : plural}`;
  return (
    <Typography variant="body2" color="text.secondary">
      {counted(structure.week_count, "week")} ·{" "}
      {counted(structure.theoretical_lectures, "theory lecture")} ·{" "}
      {counted(structure.practical_sections, "practical section")} ·{" "}
      {counted(structure.quizzes, "quiz", "quizzes")} ·{" "}
      {counted(structure.midterms, "midterm")} · {counted(structure.finals, "final")}
    </Typography>
  );
}

function PrerequisitesTable({
  prerequisites,
  courses,
}: {
  prerequisites: Prerequisite[];
  courses: Course[];
}) {
  if (prerequisites.length === 0) return null;

  const courseTitle = (id: string) =>
    courses.find((c) => c.id === id)?.title ?? id;

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle1" gutterBottom>
          Prerequisites
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Course</TableCell>
              <TableCell>Requires</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {prerequisites.map((p) => (
              <TableRow key={p.course_id}>
                <TableCell>{courseTitle(p.course_id)}</TableCell>
                <TableCell>
                  {p.requires.map(courseTitle).join(", ") || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SourceCoverageTable({
  coverage,
}: {
  coverage: SourceCoverage[];
}) {
  if (coverage.length === 0) return null;

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle1" gutterBottom>
          Source Coverage
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Source</TableCell>
              <TableCell>Pages</TableCell>
              <TableCell>Courses</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {coverage.map((sc) => (
              <TableRow key={sc.document_id}>
                <TableCell>{sc.filename}</TableCell>
                <TableCell>{sc.pages}</TableCell>
                <TableCell>{sc.course_ids.join(", ")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/**
 * Renders the cross-book serial learning path contract: ordered books,
 * prerequisite edges with confidence, rationale and clickable evidence,
 * alternatives and overrides. All copy ("Finish X before Y", chapter
 * restart) is driven exclusively by the validated LearningPathV1 object and
 * the passed-in completion state — the app never infers an edge or an
 * ordering itself.
 */
function LearningPathSection({
  learningPath,
  completedBookIds,
}: {
  learningPath: LearningPathLoad;
  completedBookIds: number[];
}) {
  const [openEvidence, setOpenEvidence] = useState<LearningPathEvidenceV1 | null>(null);
  const completed = new Set(completedBookIds);

  if (learningPath.status === "loading") {
    return (
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" spacing={2}>
            <CircularProgress size={20} />
            <Typography variant="body2">Loading learning path…</Typography>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  if (learningPath.status === "failed") {
    return (
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Alert severity="error">
              <AlertTitle>Learning path unavailable</AlertTitle>
              {learningPath.error}
            </Alert>
            {learningPath.retry ? (
              <Button
                variant="outlined"
                size="small"
                onClick={learningPath.retry}
              >
                Retry
              </Button>
            ) : null}
          </Stack>
        </CardContent>
      </Card>
    );
  }

  if (learningPath.data === null) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Alert severity="info">
            <AlertTitle>No learning path</AlertTitle>
            No learning path contract has been provided for this programme yet.
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (learningPath.data.edges.length === 0) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Alert severity="info">
            <AlertTitle>No prerequisite edges</AlertTitle>
            This learning path contains no prerequisite edges.
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const path = learningPath.data;

  return (
    <>
      <BooksCard path={path} completed={completed} />
      {path.edges.map((edge) => (
        <EdgeCard
          key={`${edge.prerequisite_book_id}:${edge.dependent_book_id}`}
          edge={edge}
          path={path}
          completed={completed}
          onOpenEvidence={setOpenEvidence}
        />
      ))}
      <EvidenceDialog
        evidence={openEvidence}
        onClose={() => setOpenEvidence(null)}
      />
    </>
  );
}

function BooksCard({
  path,
  completed,
}: {
  path: LearningPathV1;
  completed: Set<number>;
}) {
  const bookTitle = (id: number) =>
    path.books.find((book) => book.id === id)?.title ?? `Book ${id}`;

  // A book's chapters restart at 1 when it is the dependent book of a real
  // edge (in the validated contract) whose prerequisite book is completed
  // (passed-in learner state). Both facts come only from the contract and
  // that state — never inferred from titles or any heuristic.
  const restartsAtChapterOne = (bookId: number) =>
    path.edges.some(
      (edge) =>
        edge.dependent_book_id === bookId &&
        completed.has(edge.prerequisite_book_id),
    );

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1}>
            <Typography variant="subtitle1">Cross-Book Prerequisites</Typography>
            <Chip
              size="small"
              variant="outlined"
              label={`v${path.plan_version}`}
            />
          </Stack>
          <List dense disablePadding>
            {path.books.map((book) => (
              <ListItem key={book.id} disableGutters disablePadding>
                <Stack direction="row" spacing={1}>
                  <Typography variant="body2">{bookTitle(book.id)}</Typography>
                  {completed.has(book.id) ? (
                    <Chip size="small" color="success" label="Completed" />
                  ) : null}
                  {restartsAtChapterOne(book.id) ? (
                    <Chip
                      size="small"
                      color="info"
                      variant="outlined"
                      label="Restarts at chapter 1"
                    />
                  ) : null}
                </Stack>
              </ListItem>
            ))}
          </List>
        </Stack>
      </CardContent>
    </Card>
  );
}

function EdgeCard({
  edge,
  path,
  completed,
  onOpenEvidence,
}: {
  edge: LearningPathEdgeV1;
  path: LearningPathV1;
  completed: Set<number>;
  onOpenEvidence: (evidence: LearningPathEvidenceV1) => void;
}) {
  const bookTitle = (id: number) =>
    path.books.find((book) => book.id === id)?.title ?? `Book ${id}`;

  const lowConfidence = edge.confidence < LOW_CONFIDENCE_THRESHOLD;
  const prerequisiteCompleted = completed.has(edge.prerequisite_book_id);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1}>
            <Typography variant="body2">
              Finish {bookTitle(edge.prerequisite_book_id)} before {bookTitle(edge.dependent_book_id)}
            </Typography>
            <Chip
              size="small"
              variant="outlined"
              color={lowConfidence ? "warning" : "default"}
              label={`${edge.confidence} confidence`}
            />
          </Stack>
          {prerequisiteCompleted ? (
            <Typography variant="caption" color="text.secondary">
              {bookTitle(edge.prerequisite_book_id)} is complete — {bookTitle(edge.dependent_book_id)} chapters restart at 1.
            </Typography>
          ) : null}
          {lowConfidence ? (
            <Alert severity="warning">
              <AlertTitle>Low confidence</AlertTitle>
              This edge was proposed below the display threshold. Review the rationale before relying on it.
            </Alert>
          ) : null}
          <Typography variant="body2" color="text.secondary">
            {edge.rationale}
          </Typography>
          <EvidenceBubble evidence={edge.evidence} onOpen={onOpenEvidence} />
          {edge.alternatives.length > 0 ? (
            <Stack spacing={0.5}>
              <Typography variant="caption" color="text.secondary">
                Alternatives
              </Typography>
              {edge.alternatives.map((alternative, index) => (
                <Stack
                  key={`${edge.prerequisite_book_id}:${alternative.prerequisite_book_id}:${index}`}
                  direction="row"
                  spacing={1}
                >
                  <Typography variant="body2">
                    {bookTitle(alternative.prerequisite_book_id)}
                  </Typography>
                  <Chip
                    size="small"
                    variant="outlined"
                    color={alternative.resolved ? "success" : "warning"}
                    label={alternative.resolved ? "Resolved" : "Not resolved"}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {alternative.rationale}
                  </Typography>
                  <EvidenceBubble
                    evidence={alternative.evidence}
                    onOpen={onOpenEvidence}
                  />
                </Stack>
              ))}
            </Stack>
          ) : null}
          {edge.override ? (
            <Stack direction="row" spacing={1}>
              <Chip
                size="small"
                variant="outlined"
                color={edge.override.resolved ? "info" : "warning"}
                label={
                  edge.override.resolved
                    ? "Override recorded"
                    : "Override pending"
                }
              />
              {edge.override.reason ? (
                <Typography variant="body2">{edge.override.reason}</Typography>
              ) : null}
            </Stack>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

/**
 * Clickable citation element, mirroring CitationBubble: a real evidence
 * object renders as a clickable Chip that opens the EvidenceDialog; a
 * missing one renders the explicit non-clickable "Source unavailable" state
 * instead of a fabricated reference.
 */
function EvidenceBubble({
  evidence,
  onOpen,
}: {
  evidence: LearningPathEvidenceV1 | null;
  onOpen: (evidence: LearningPathEvidenceV1) => void;
}) {
  if (!evidence) {
    return <Chip size="small" variant="outlined" label="Source unavailable" />;
  }

  return (
    <Tooltip title={evidence.book_title}>
      <Chip
        size="small"
        variant="outlined"
        label={`Evidence — ${evidence.pages}`}
        clickable
        onClick={() => onOpen(evidence)}
        aria-label={`Open evidence from ${evidence.book_title}`}
      />
    </Tooltip>
  );
}

function EvidenceDialog({
  evidence,
  onClose,
}: {
  evidence: LearningPathEvidenceV1 | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={evidence !== null} onClose={onClose}>
      <DialogTitle>Evidence</DialogTitle>
      <DialogContent>
        {evidence ? (
          <Stack spacing={1}>
            <Typography variant="body1">{evidence.book_title}</Typography>
            <Typography variant="body2" color="text.secondary">
              Pages: {evidence.pages}
            </Typography>
            {evidence.excerpt ? (
              <Typography variant="body2" color="text.secondary">
                {evidence.excerpt}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No excerpt available for this citation.
              </Typography>
            )}
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * One reason approval must not proceed. `kind` identifies which check fired;
 * `reason` is the specific, human-readable message shown in the UI (never a
 * generic "cannot approve").
 */
export type ApprovalBlock = {
  kind:
    | "cycle"
    | "low-confidence"
    | "missing-evidence"
    | "stale-version"
    | "unresolved-alternative"
    | "unresolved-override";
  reason: string;
};

/**
 * Cycle detection on the prerequisite graph: DFS with per-node
 * visited/in-progress/done states (white-grey-black). When a back edge hits a
 * node still "in-progress" on the current DFS stack, the stack slice from
 * that node to the top is a real cycle, returned as its node ids in path
 * order. This is the standard directed-graph cycle algorithm, not a heuristic
 * like comparing duplicate ids.
 */
function findCycleIds(path: LearningPathV1): number[] | null {
  const adjacency = new Map<number, number[]>();
  for (const edge of path.edges) {
    const neighbors = adjacency.get(edge.prerequisite_book_id) ?? [];
    neighbors.push(edge.dependent_book_id);
    adjacency.set(edge.prerequisite_book_id, neighbors);
  }

  const nodes = new Set<number>();
  for (const book of path.books) nodes.add(book.id);
  for (const edge of path.edges) {
    nodes.add(edge.prerequisite_book_id);
    nodes.add(edge.dependent_book_id);
  }

  const state = new Map<number, "unvisited" | "in-progress" | "done">();
  for (const node of nodes) state.set(node, "unvisited");

  const stack: number[] = [];

  const visit = (node: number): number[] | null => {
    state.set(node, "in-progress");
    stack.push(node);
    for (const neighbor of adjacency.get(node) ?? []) {
      const neighborState = state.get(neighbor) ?? "unvisited";
      if (neighborState === "in-progress") {
        const cycleStart = stack.indexOf(neighbor);
        return stack.slice(cycleStart).concat(neighbor);
      }
      if (neighborState === "unvisited") {
        const cycle = visit(neighbor);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    state.set(node, "done");
    return null;
  };

  for (const node of nodes) {
    if ((state.get(node) ?? "unvisited") === "unvisited") {
      const cycle = visit(node);
      if (cycle) return cycle;
    }
  }
  return null;
}

/**
 * Evaluates a validated LearningPathV1 for the approval-blocking rules:
 * cycles, low confidence, missing evidence, stale version, and unresolved
 * alternatives/overrides. Returns every reason that applies, in a
 * deterministic order — an empty array means none of the rules fire.
 *
 * `latestPlanVersion` is the exact version the app currently holds/fetched;
 * when it is null (unknown) the stale check is skipped rather than guessed.
 * This function only evaluates — it never approves; approval remains an
 * explicit human action.
 */
export function getApprovalBlocks(
  learningPath: LearningPathV1 | null,
  latestPlanVersion: number | null,
): ApprovalBlock[] {
  const blocks: ApprovalBlock[] = [];
  if (!learningPath) return blocks;

  if (
    latestPlanVersion !== null &&
    learningPath.plan_version !== latestPlanVersion
  ) {
    blocks.push({
      kind: "stale-version",
      reason: `Learning path version ${learningPath.plan_version} does not match the current version ${latestPlanVersion}.`,
    });
  }

  const bookTitle = (id: number) =>
    learningPath.books.find((book) => book.id === id)?.title ?? `Book ${id}`;

  const cycle = findCycleIds(learningPath);
  if (cycle) {
    blocks.push({
      kind: "cycle",
      reason: `Prerequisite cycle detected: ${cycle.map(bookTitle).join(" → ")}.`,
    });
  }

  for (const edge of learningPath.edges) {
    const label = `${bookTitle(edge.prerequisite_book_id)} → ${bookTitle(edge.dependent_book_id)}`;
    if (edge.confidence < LOW_CONFIDENCE_THRESHOLD) {
      blocks.push({
        kind: "low-confidence",
        reason: `Edge ${label} has confidence ${edge.confidence}, below the ${LOW_CONFIDENCE_THRESHOLD} threshold.`,
      });
    }
    if (!edge.evidence) {
      blocks.push({
        kind: "missing-evidence",
        reason: `Edge ${label} has no resolvable evidence.`,
      });
    }
    const unresolvedAlternatives = edge.alternatives.filter(
      (alternative) => !alternative.resolved,
    );
    if (unresolvedAlternatives.length > 0) {
      blocks.push({
        kind: "unresolved-alternative",
        reason: `Edge ${label} has ${unresolvedAlternatives.length} unresolved alternative${unresolvedAlternatives.length > 1 ? "s" : ""}.`,
      });
    }
    if (edge.override && !edge.override.resolved) {
      blocks.push({
        kind: "unresolved-override",
        reason: `Edge ${label} has an unresolved override.`,
      });
    }
  }

  return blocks;
}
