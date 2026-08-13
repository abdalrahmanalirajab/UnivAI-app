"use client";

import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { PrivacyRequestStatus } from "@/lib/privacy";

type AdminRequest = {
  id: string;
  request_type: string;
  status: PrivacyRequestStatus;
  detail: string | null;
  submitted_at: string;
  due_at: string;
  identity_verified_at: string | null;
  completed_at: string | null;
  admin_note: string | null;
  name: string;
  email: string;
  registration_number: string;
};

const STATUSES: PrivacyRequestStatus[] = [
  "received", "identity_check", "in_progress", "completed", "declined", "cancelled",
];

export default function AdminPrivacyRequestsPage() {
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [referenceTime, setReferenceTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize) });
      if (statusFilter) params.set("status", statusFilter);
      if (search.trim()) params.set("q", search.trim());
      const response = await fetch(`/api/admin/privacy-requests?${params}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Could not load privacy requests.");
      setRequests(body.requests ?? []);
      setTotal(body.pagination?.total ?? 0);
      setReferenceTime(Date.now());
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load privacy requests.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 300);
    return () => window.clearTimeout(timeout);
  }, [load]);

  useEffect(() => setPage(0), [search, statusFilter]);

  async function updateRequest(request: AdminRequest) {
    const response = await fetch("/api/admin/privacy-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: request.id,
        status: request.status,
        adminNote: request.admin_note ?? "",
        identityVerified: Boolean(request.identity_verified_at),
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setError(body?.error ?? "Could not update the privacy request.");
      return;
    }
    await load();
  }

  function change(id: string, values: Partial<AdminRequest>) {
    setRequests((current) => current.map((item) => item.id === id ? { ...item, ...values } : item));
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h3" component="h1">Privacy request queue</Typography>
      <Typography color="text.secondary">
        Verify identity, coordinate cross-service work, record a clear outcome, and complete
        requests before their target date. This queue supports operations; it is not legal advice.
      </Typography>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
        <TextField label="Search learner" value={search} onChange={(event) => setSearch(event.target.value)} />
        <TextField select label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <MenuItem value="">All statuses</MenuItem>
          {STATUSES.map((status) => <MenuItem key={status} value={status}>{status.replaceAll("_", " ")}</MenuItem>)}
        </TextField>
      </Stack>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <TableContainer>
        <Table aria-label="Privacy request queue">
          <TableHead><TableRow>
            <TableCell>Learner and request</TableCell><TableCell>Timing</TableCell>
            <TableCell>Workflow</TableCell><TableCell>Outcome note</TableCell><TableCell>Action</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell>
                  <Typography variant="subtitle2">{request.name} · {request.registration_number}</Typography>
                  <Typography variant="caption" color="text.secondary">{request.email}</Typography>
                  <Typography>{request.request_type.replaceAll("_", " ")}</Typography>
                  {request.detail ? <Typography variant="body2">{request.detail}</Typography> : null}
                </TableCell>
                <TableCell>
                  <Typography variant="body2">Received {new Date(request.submitted_at).toLocaleDateString()}</Typography>
                  <Chip
                    size="small"
                    color={referenceTime > 0 && new Date(request.due_at).getTime() < referenceTime && !request.completed_at ? "error" : "default"}
                    label={`Target ${new Date(request.due_at).toLocaleDateString()}`}
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    select size="small" label="Status" value={request.status}
                    onChange={(event) => change(request.id, { status: event.target.value as PrivacyRequestStatus })}
                  >
                    {STATUSES.map((status) => <MenuItem key={status} value={status}>{status.replaceAll("_", " ")}</MenuItem>)}
                  </TextField>
                  <FormControlLabel
                    control={<Checkbox checked={Boolean(request.identity_verified_at)} onChange={(event) => change(request.id, { identity_verified_at: event.target.checked ? new Date().toISOString() : null })} />}
                    label="Identity verified"
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    multiline minRows={2} value={request.admin_note ?? ""}
                    onChange={(event) => change(request.id, { admin_note: event.target.value })}
                    slotProps={{ htmlInput: { maxLength: 2000 } }}
                    aria-label={`Outcome note for ${request.name}`}
                  />
                </TableCell>
                <TableCell><Button onClick={() => void updateRequest(request)}>Save</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div" count={total} page={page} rowsPerPage={pageSize}
        onPageChange={(_event, value) => setPage(value)}
        onRowsPerPageChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }}
        rowsPerPageOptions={[10, 25, 50, 100]}
        labelRowsPerPage="Requests per page"
        showFirstButton showLastButton disabled={loading}
      />
    </Stack>
  );
}
