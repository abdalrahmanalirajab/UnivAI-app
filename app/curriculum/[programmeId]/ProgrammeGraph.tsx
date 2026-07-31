"use client";

import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { ProgrammePlanV1, Semester, Course, Prerequisite, SourceCoverage } from "@/test/fixtures/programme-plan-v1";

type Props = {
  plan: ProgrammePlanV1;
};

export default function ProgrammeGraph({ plan }: Props) {
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
          />
        ))}

      <PrerequisitesTable prerequisites={plan.prerequisites} courses={plan.courses} />

      <SourceCoverageTable coverage={plan.source_coverage} />
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
}: {
  semester: Semester;
  courses: Course[];
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
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
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
