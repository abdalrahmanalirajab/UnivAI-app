"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
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
import MailOutlineRounded from "@mui/icons-material/MailOutlineRounded";

import { formatDateTime } from "@/lib/time";

const STATUSES = ["queued", "retrying", "processing", "submitted", "failed", "skipped"] as const;
const CATEGORIES = ["course", "lecture", "assessment", "transcript", "security", "billing", "admin"] as const;

type DeliveryStatus = (typeof STATUSES)[number];
type DeliveryCategory = (typeof CATEGORIES)[number];
type Filters = { status: string; category: string; event: string };
type Delivery = {
  id: string;
  source: "outbox" | "direct";
  status: DeliveryStatus;
  category: DeliveryCategory;
  eventType: string;
  subject: string;
  attempts: number;
  error: string | null;
  learner: { registrationNumber: string; name: string; email: string };
  createdAt: string | null;
  updatedAt: string | null;
  nextAttemptAt: string | null;
  processingStartedAt: string | null;
  sentAt: string | null;
  providerStatus: string;
  providerEventAt: string | null;
  deliveredAt: string | null;
};
type MonitorResponse = {
  summary: Record<DeliveryStatus, number>;
  notifications: Delivery[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
};

const EMPTY_FILTERS: Filters = { status: "", category: "", event: "" };

function statusColor(status: DeliveryStatus): "default" | "success" | "error" | "warning" | "info" {
  if (status === "submitted") return "info";
  if (status === "failed") return "error";
  if (status === "retrying") return "warning";
  if (status === "queued" || status === "processing") return "info";
  return "default";
}

function titleCase(value: string): string {
  return value.replace(/(^|[._-])([a-z])/g, (_match, boundary, letter) => `${boundary ? " " : ""}${letter.toUpperCase()}`);
}

export default function AdminNotificationMonitor({
  selectedRegistrationNumber,
}: {
  selectedRegistrationNumber?: string;
}) {
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<MonitorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!selectedRegistrationNumber && scope === "selected") setScope("all");
  }, [scope, selectedRegistrationNumber]);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (scope === "selected" && selectedRegistrationNumber) {
      params.set("sid", selectedRegistrationNumber);
    }
    if (filters.status) params.set("status", filters.status);
    if (filters.category) params.set("category", filters.category);
    if (filters.event) params.set("event", filters.event);

    try {
      const response = await fetch(`/api/admin/notifications?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Could not load email delivery.");
      setData(body as MonitorResponse);
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : "Could not load email delivery.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [filters, page, scope, selectedRegistrationNumber]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const apply = () => {
    setPage(1);
    setFilters({ ...draft, event: draft.event.trim().toLowerCase() });
  };

  return (
    <Card>
      <CardContent>
        <Stack spacing={2.5}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} className="align-center">
            <Avatar variant="rounded" className="admin-section-icon">
              <MailOutlineRounded />
            </Avatar>
            <Stack className="grow">
              <Typography variant="h5">Email delivery</Typography>
              <Typography variant="body2" color="text.secondary">
                Delivery metadata only. Message bodies, links, tokens, and provider responses are never shown.
              </Typography>
            </Stack>
            <Button disabled={loading} onClick={() => void load()}>
              Refresh
            </Button>
          </Stack>

          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
            <TextField
              select
              size="small"
              label="Learners"
              value={scope}
              onChange={(event) => {
                setScope(event.target.value as "all" | "selected");
                setPage(1);
              }}
            >
              <MenuItem value="all">All learners</MenuItem>
              {selectedRegistrationNumber ? (
                <MenuItem value="selected">Selected learner ({selectedRegistrationNumber})</MenuItem>
              ) : null}
            </TextField>
            <TextField
              select
              size="small"
              label="Status"
              value={draft.status}
              onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
            >
              <MenuItem value="">All statuses</MenuItem>
              {STATUSES.map((status) => <MenuItem key={status} value={status}>{titleCase(status)}</MenuItem>)}
            </TextField>
            <TextField
              select
              size="small"
              label="Category"
              value={draft.category}
              onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
            >
              <MenuItem value="">All categories</MenuItem>
              {CATEGORIES.map((category) => <MenuItem key={category} value={category}>{titleCase(category)}</MenuItem>)}
            </TextField>
            <TextField
              size="small"
              label="Exact event"
              placeholder="lecture.ready"
              slotProps={{ htmlInput: { "data-no-ui-translate": "true", dir: "ltr" } }}
              value={draft.event}
              onChange={(event) => setDraft((current) => ({ ...current, event: event.target.value }))}
            />
            <Button variant="contained" onClick={apply}>Apply</Button>
            <Button
              onClick={() => {
                setDraft(EMPTY_FILTERS);
                setFilters({ ...EMPTY_FILTERS });
                setPage(1);
              }}
            >
              Clear
            </Button>
          </Stack>

          {data ? (
            <Stack direction="row" spacing={1} className="wrap-row">
              {STATUSES.map((status) => (
                <Chip
                  key={status}
                  size="small"
                  color={statusColor(status)}
                  variant={filters.status === status ? "filled" : "outlined"}
                  label={`${titleCase(status)} ${data.summary[status] ?? 0}`}
                />
              ))}
            </Stack>
          ) : null}

          {error ? <Alert severity="error">{error}</Alert> : null}
          {loading && !data ? <CircularProgress size={28} aria-label="Loading email delivery" /> : null}

          {data ? (
            <>
              <TableContainer className="admin-table-scroll">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Recipient</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Notification</TableCell>
                      <TableCell>Subject</TableCell>
                      <TableCell>Attempts</TableCell>
                      <TableCell>Timing</TableCell>
                      <TableCell>Provider</TableCell>
                      <TableCell>Error</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.notifications.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8}>No delivery records match these filters.</TableCell>
                      </TableRow>
                    ) : data.notifications.map((delivery) => (
                      <TableRow key={`${delivery.source}-${delivery.id}`}>
                        <TableCell>
                          <Typography variant="body2">{delivery.learner.name}</Typography>
                          <Typography component="div" variant="caption" color="text.secondary">
                            {delivery.learner.registrationNumber}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {delivery.learner.email}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" color={statusColor(delivery.status)} label={titleCase(delivery.status)} />
                          <Typography component="div" variant="caption" color="text.secondary">
                            {delivery.source === "direct" ? "Immediate" : "Outbox"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{titleCase(delivery.category)}</Typography>
                          <Typography variant="caption" color="text.secondary">{delivery.eventType}</Typography>
                        </TableCell>
                        <TableCell>{delivery.subject}</TableCell>
                        <TableCell>{delivery.attempts}</TableCell>
                        <TableCell>
                          <Typography component="div" variant="caption">Created: {formatDateTime(delivery.createdAt)}</Typography>
                          {delivery.sentAt ? <Typography component="div" variant="caption">Submitted: {formatDateTime(delivery.sentAt)}</Typography> : null}
                          {delivery.nextAttemptAt ? <Typography component="div" variant="caption">Next: {formatDateTime(delivery.nextAttemptAt)}</Typography> : null}
                          {delivery.processingStartedAt ? <Typography component="div" variant="caption">Started: {formatDateTime(delivery.processingStartedAt)}</Typography> : null}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            color={delivery.providerStatus === "delivered" ? "success" : delivery.providerStatus === "failed" || delivery.providerStatus === "bounced" ? "error" : "default"}
                            label={titleCase(delivery.providerStatus)}
                            variant="outlined"
                          />
                          {delivery.deliveredAt ? (
                            <Typography component="div" variant="caption">Delivered: {formatDateTime(delivery.deliveredAt)}</Typography>
                          ) : delivery.providerEventAt ? (
                            <Typography component="div" variant="caption">Updated: {formatDateTime(delivery.providerEventAt)}</Typography>
                          ) : null}
                        </TableCell>
                        <TableCell>{delivery.error ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Stack direction="row" spacing={1.5} className="align-center justify-end">
                <Typography variant="body2" color="text.secondary">
                  {data.pagination.total} records · Page {data.pagination.page} of {data.pagination.pages}
                </Typography>
                <Button disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                  Previous
                </Button>
                <Button
                  disabled={loading || page >= data.pagination.pages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
              </Stack>
            </>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
