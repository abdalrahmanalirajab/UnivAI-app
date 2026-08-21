"use client";

import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ReportProblemOutlined from "@mui/icons-material/ReportProblemOutlined";
import {
  AI_OUTPUT_REPORT_REASON_LABELS,
  AI_OUTPUT_REPORT_STATUSES,
  AI_OUTPUT_TARGET_TYPES,
  type AiOutputReportReason,
  type AiOutputReportStatus,
  type AiOutputTargetType,
} from "@/lib/ai-output-feedback-types";
import { formatDateTime } from "@/lib/time";

type Report = {
  id: number;
  studentId: string;
  learnerName: string | null;
  learnerEmail: string | null;
  targetType: AiOutputTargetType;
  targetId: string;
  targetVersion: string;
  traceId: string;
  reason: AiOutputReportReason;
  detail: string | null;
  status: AiOutputReportStatus;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
};

type Queue = {
  reports: Report[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
};

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AdminFeedbackReports({
  selectedRegistrationNumber,
}: {
  selectedRegistrationNumber?: string;
}) {
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [status, setStatus] = useState("");
  const [targetType, setTargetType] = useState("");
  const [page, setPage] = useState(1);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedRegistrationNumber && scope === "selected") setScope("all");
  }, [scope, selectedRegistrationNumber]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (status) params.set("status", status);
    if (targetType) params.set("targetType", targetType);
    if (scope === "selected" && selectedRegistrationNumber) {
      params.set("sid", selectedRegistrationNumber);
    }
    try {
      const response = await fetch(`/api/admin/feedback-reports?${params}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not load reports.");
      setQueue(body as Queue);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load reports.");
    } finally {
      setLoading(false);
    }
  }, [page, scope, selectedRegistrationNumber, status, targetType]);

  useEffect(() => { void load(); }, [load]);

  function changeReport(id: number, patch: Partial<Report>) {
    setQueue((current) => current ? {
      ...current,
      reports: current.reports.map((report) => report.id === id ? { ...report, ...patch } : report),
    } : current);
  }

  async function save(
    report: Report,
    patch: Pick<Partial<Report>, "status" | "adminNote"> = {},
  ) {
    const nextReport = { ...report, ...patch };
    if (Object.keys(patch).length > 0) changeReport(report.id, patch);
    setSavingId(report.id);
    setError(null);
    try {
      const response = await fetch("/api/admin/feedback-reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: report.id,
          status: nextReport.status,
          adminNote: nextReport.adminNote,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not save review.");
      changeReport(report.id, body.report as Report);
    } catch (reason) {
      changeReport(report.id, {
        status: report.status,
        adminNote: report.adminNote,
      });
      setError(reason instanceof Error ? reason.message : "Could not save review.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1}>
            <ReportProblemOutlined color="warning" />
            <Stack>
              <Typography variant="h5">AI output reports</Typography>
              <Typography variant="body2" color="text.secondary">
                Paginated learner reports for generated answers, lectures, sections, and curricula.
              </Typography>
            </Stack>
          </Stack>

          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
            <TextField
              select
              label="Learners"
              value={scope}
              onChange={(event) => { setScope(event.target.value as "all" | "selected"); setPage(1); }}
            >
              <MenuItem value="all">All learners</MenuItem>
              <MenuItem value="selected" disabled={!selectedRegistrationNumber}>
                Selected learner
              </MenuItem>
            </TextField>
            <TextField
              select
              label="Status"
              value={status}
              onChange={(event) => { setStatus(event.target.value); setPage(1); }}
            >
              <MenuItem value="">All statuses</MenuItem>
              {AI_OUTPUT_REPORT_STATUSES.map((value) => (
                <MenuItem key={value} value={value}>{titleCase(value)}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Output type"
              value={targetType}
              onChange={(event) => { setTargetType(event.target.value); setPage(1); }}
            >
              <MenuItem value="">All output types</MenuItem>
              {AI_OUTPUT_TARGET_TYPES.map((value) => (
                <MenuItem key={value} value={value}>{titleCase(value)}</MenuItem>
              ))}
            </TextField>
            <Button variant="outlined" onClick={() => void load()} disabled={loading}>
              Refresh
            </Button>
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}
          {loading && !queue ? <CircularProgress aria-label="Loading AI output reports" /> : null}
          {queue && queue.reports.length === 0 ? (
            <Alert severity="info">No reports match these filters.</Alert>
          ) : null}

          {queue && queue.reports.length > 0 ? (
            <TableContainer className="admin-table-scroll">
              <Table size="small" aria-label="AI output report queue">
                <TableHead>
                  <TableRow>
                    <TableCell>Learner</TableCell>
                    <TableCell>Output</TableCell>
                    <TableCell>Report</TableCell>
                    <TableCell>Review</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {queue.reports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell>
                        <Typography variant="body2">{report.learnerName ?? report.studentId}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {report.studentId} · {formatDateTime(report.createdAt)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={titleCase(report.targetType)} />
                        <Typography variant="caption" component="div">
                          {report.targetId} · version {report.targetVersion}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {AI_OUTPUT_REPORT_REASON_LABELS[report.reason]}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {report.detail ?? "No additional detail"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Stack spacing={1}>
                          <TextField
                            select
                            size="small"
                            label="Status"
                            value={report.status}
                            disabled={savingId === report.id}
                            onChange={(event) => void save(report, {
                              status: event.target.value as AiOutputReportStatus,
                            })}
                          >
                            {AI_OUTPUT_REPORT_STATUSES.map((value) => (
                              <MenuItem key={value} value={value}>{titleCase(value)}</MenuItem>
                            ))}
                          </TextField>
                          <TextField
                            size="small"
                            label="Admin note"
                            value={report.adminNote ?? ""}
                            slotProps={{ htmlInput: { maxLength: 2000 } }}
                            onChange={(event) => changeReport(report.id, { adminNote: event.target.value })}
                          />
                          <Button
                            size="small"
                            variant="contained"
                            disabled={savingId === report.id}
                            onClick={() => void save(report)}
                          >
                            {savingId === report.id ? "Savingâ€¦" : "Save note"}
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : null}

          {queue ? (
            <Stack direction="row" spacing={1}>
              <Button
                disabled={loading || queue.pagination.page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <Typography variant="body2" aria-live="polite">
                Page {queue.pagination.page} of {queue.pagination.pages} · {queue.pagination.total} reports
              </Typography>
              <Button
                disabled={loading || queue.pagination.page >= queue.pagination.pages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </Stack>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
