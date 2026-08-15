"use client";

import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { Programme } from "@/lib/programmes";
import { scheduleTimeLabel, WEEKDAY_NAMES, type Weekday } from "@/lib/schedule-contract";

type Props = {
  programme: Programme;
  programmeId: number;
  onProgrammeUpdated: (programme: Programme) => void;
};

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Cairo";
  } catch {
    return "Africa/Cairo";
  }
}

export default function WeeklyScheduleEditor({ programme, programmeId, onProgrammeUpdated }: Props) {
  const initial = programme.schedule;
  const [timezone, setTimezone] = useState(initial?.timezone ?? browserTimezone());
  const [lectureWeekday, setLectureWeekday] = useState(initial?.lectureWeekday ?? 0);
  const [lectureLocalTime, setLectureLocalTime] = useState(initial?.lectureLocalTime ?? "10:00");
  const [sectionWeekday, setSectionWeekday] = useState(initial?.sectionWeekday ?? 2);
  const [sectionLocalTime, setSectionLocalTime] = useState(initial?.sectionLocalTime ?? "12:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(
    () => WEEKDAY_NAMES.map((day, index) => ({
      day,
      lecture: index === lectureWeekday ? scheduleTimeLabel(lectureLocalTime) : null,
      section: index === sectionWeekday ? scheduleTimeLabel(sectionLocalTime) : null,
    })),
    [lectureLocalTime, lectureWeekday, sectionLocalTime, sectionWeekday],
  );

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/programmes/${programmeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "schedule",
          expectedVersion: programme.plan_version,
          timezone,
          lectureWeekday,
          lectureLocalTime,
          sectionWeekday,
          sectionLocalTime,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save the weekly schedule.");
      onProgrammeUpdated(data.programme as Programme);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the weekly schedule.");
    } finally {
      setSaving(false);
    }
  }

  const locked = programme.status === "approved" || Boolean(initial?.lockedAt);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} className="spread-row">
            <Stack spacing={0.5}>
              <Typography variant="h6">Your fixed weekly schedule</Typography>
              <Typography variant="body2" color="text.secondary">
                Pick one weekly lecture slot and one weekly section slot. They become permanent when you approve the course.
              </Typography>
            </Stack>
            <Chip
              color={locked ? "success" : initial ? "primary" : "warning"}
              label={locked ? "Locked" : initial ? "Saved — locks on approval" : "Required before approval"}
              variant="outlined"
            />
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}

          {!locked ? (
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                helperText="IANA timezone, for example Africa/Cairo"
                fullWidth
              />
              <TextField
                select
                label="Lecture day"
                value={lectureWeekday}
                onChange={(event) => setLectureWeekday(Number(event.target.value) as Weekday)}
                fullWidth
              >
                {WEEKDAY_NAMES.map((day, index) => <MenuItem key={day} value={index}>{day}</MenuItem>)}
              </TextField>
              <TextField
                label="Lecture time"
                type="time"
                value={lectureLocalTime}
                onChange={(event) => setLectureLocalTime(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
              <TextField
                select
                label="Section day"
                value={sectionWeekday}
                onChange={(event) => setSectionWeekday(Number(event.target.value) as Weekday)}
                fullWidth
              >
                {WEEKDAY_NAMES.map((day, index) => <MenuItem key={day} value={index}>{day}</MenuItem>)}
              </TextField>
              <TextField
                label="Section time"
                type="time"
                value={sectionLocalTime}
                onChange={(event) => setSectionLocalTime(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
            </Stack>
          ) : null}

          <Table size="small" aria-label="Weekly lecture and section schedule">
            <TableHead>
              <TableRow><TableCell>Day</TableCell><TableCell>Lecture</TableCell><TableCell>Section</TableCell></TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.day} selected={Boolean(row.lecture || row.section)}>
                  <TableCell component="th" scope="row">{row.day}</TableCell>
                  <TableCell>{row.lecture ?? "—"}</TableCell>
                  <TableCell>{row.section ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Typography variant="caption" color="text.secondary">
            Times use {timezone}. The first lecture is scheduled after approval with at least 24 hours of notice.
          </Typography>
          {!locked ? (
            <Button variant="contained" onClick={save} disabled={saving || !timezone.trim()}>
              {saving ? "Saving…" : initial ? "Update weekly schedule" : "Save weekly schedule"}
            </Button>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
