"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import GavelOutlined from "@mui/icons-material/GavelOutlined";
import type {
  PrivacyPreferences,
  PrivacyRequest,
  PrivacyRequestType,
} from "@/lib/privacy";

const REQUEST_LABELS: Record<PrivacyRequestType, string> = {
  access: "Access my personal data",
  deletion: "Delete my account and personal data",
  correction: "Correct personal data",
  portability: "Portable copy of my data",
  restriction: "Restrict processing",
  objection: "Object to processing",
  sale_share_opt_out: "Opt out of sale or sharing (CCPA)",
  limit_sensitive_use: "Limit sensitive-data use (CCPA)",
};

const STATUS_COLORS = {
  received: "info",
  identity_check: "warning",
  in_progress: "warning",
  completed: "success",
  declined: "error",
  cancelled: "default",
} as const;

export default function PrivacyCenter() {
  const [preferences, setPreferences] = useState<PrivacyPreferences | null>(null);
  const [requests, setRequests] = useState<PrivacyRequest[] | null>(null);
  const [requestType, setRequestType] = useState<PrivacyRequestType>("access");
  const [detail, setDetail] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [preferencesResponse, requestsResponse] = await Promise.all([
        fetch("/api/privacy/preferences", { cache: "no-store" }),
        fetch("/api/privacy/requests", { cache: "no-store" }),
      ]);
      const preferenceBody = await preferencesResponse.json().catch(() => null);
      const requestBody = await requestsResponse.json().catch(() => null);
      if (!preferencesResponse.ok) {
        throw new Error(preferenceBody?.error ?? "Could not load privacy preferences.");
      }
      if (!requestsResponse.ok) {
        throw new Error(requestBody?.error ?? "Could not load privacy requests.");
      }
      setPreferences(preferenceBody.preferences);
      setRequests(requestBody.requests ?? []);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load privacy controls.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updatePreferences(change: Partial<PrivacyPreferences>) {
    if (!preferences) return;
    const previous = preferences;
    const next = { ...preferences, ...change };
    setPreferences(next);
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/privacy/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleOrSharingOptOut: next.saleOrSharingOptOut,
          limitSensitiveDataUse: next.limitSensitiveDataUse,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Could not save privacy preferences.");
      setPreferences(body.preferences);
      setNotice("Privacy preferences saved.");
    } catch (reason) {
      setPreferences(previous);
      setError(reason instanceof Error ? reason.message : "Could not save privacy preferences.");
    } finally {
      setSaving(false);
    }
  }

  async function submitRequest() {
    setSubmitting(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/privacy/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestType, detail: detail.trim() || null }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Could not submit this request.");
      setDetail("");
      setNotice(
        body.duplicate
          ? "An open request of this type already exists; no duplicate was created."
          : "Privacy request received. You can track it below.",
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not submit this request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack spacing={2} component="section" aria-labelledby="privacy-center-title">
      <Stack spacing={0.5}>
        <Typography variant="h5" component="h2" id="privacy-center-title">
          Privacy and Legal center
        </Typography>
        <Typography color="text.secondary">
          Review the current documents, download your information, and exercise available
          privacy rights. Requests may require identity verification and lawful exceptions may
          apply.
        </Typography>
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Button component={Link} href="/legal/eula" variant="outlined" startIcon={<GavelOutlined />}>
          Read EULA
        </Button>
        <Button component={Link} href="/legal/privacy" variant="outlined">
          Read Privacy Notice
        </Button>
        <Button
          component="a"
          href="/api/privacy/export"
          download
          variant="contained"
          startIcon={<DownloadOutlined />}
        >
          Download my data (JSON)
        </Button>
      </Stack>

      <Alert severity="info">
        UnivAI does not sell personal information or share it for cross-context behavioral
        advertising in the current product. These controls record your preference for this and
        future processing.
      </Alert>

      {!preferences ? (
        <CircularProgress size={28} aria-label="Loading privacy preferences" />
      ) : (
        <Stack>
          <FormControlLabel
            control={
              <Switch
                checked={preferences.saleOrSharingOptOut}
                disabled={saving}
                onChange={(event) =>
                  void updatePreferences({ saleOrSharingOptOut: event.target.checked })
                }
              />
            }
            label="Opt out of sale or sharing of personal information"
          />
          <FormControlLabel
            control={
              <Switch
                checked={preferences.limitSensitiveDataUse}
                disabled={saving}
                onChange={(event) =>
                  void updatePreferences({ limitSensitiveDataUse: event.target.checked })
                }
              />
            }
            label="Limit use and disclosure of sensitive personal information"
          />
        </Stack>
      )}

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" component="h3">Submit a privacy request</Typography>
            <TextField
              select
              label="Request type"
              value={requestType}
              onChange={(event) => setRequestType(event.target.value as PrivacyRequestType)}
            >
              {Object.entries(REQUEST_LABELS).map(([value, label]) => (
                <MenuItem value={value} key={value}>{label}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Details (optional for most requests)"
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              multiline
              minRows={3}
              slotProps={{ htmlInput: { maxLength: 2000 } }}
              helperText={`${detail.length}/2,000. Correction and objection requests need at least 10 characters.`}
            />
            {requestType === "deletion" ? (
              <Alert severity="warning">
                This submits a deletion request; it does not immediately erase or sign you out of
                the account. An administrator must verify identity and check any legal retention
                duties before completing cross-service erasure.
              </Alert>
            ) : null}
            <Button variant="contained" onClick={submitRequest} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit request"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {notice ? <Alert severity="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}
      {error ? <Alert severity="error" action={<Button onClick={() => void load()}>Retry</Button>}>{error}</Alert> : null}

      <Stack spacing={1} aria-live="polite">
        <Typography variant="h6" component="h3">Your requests</Typography>
        {requests === null ? (
          <CircularProgress size={28} aria-label="Loading privacy requests" />
        ) : requests.length === 0 ? (
          <Typography color="text.secondary">No privacy requests submitted.</Typography>
        ) : (
          requests.map((request) => (
            <Card variant="outlined" key={request.id}>
              <CardContent>
                <Stack spacing={0.75}>
                  <Stack
                    direction="row"
                    spacing={1}
                    className="privacy-request-heading"
                  >
                    <Typography variant="subtitle1">{REQUEST_LABELS[request.requestType]}</Typography>
                    <Chip
                      size="small"
                      color={STATUS_COLORS[request.status]}
                      label={request.status.replaceAll("_", " ")}
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    Submitted {new Date(request.submittedAt).toLocaleString()} · response target{" "}
                    {new Date(request.dueAt).toLocaleDateString()}
                  </Typography>
                  {request.detail ? <Typography variant="body2">{request.detail}</Typography> : null}
                  {request.adminNote ? (
                    <Alert severity={request.status === "declined" ? "warning" : "info"}>
                      {request.adminNote}
                    </Alert>
                  ) : null}
                </Stack>
              </CardContent>
            </Card>
          ))
        )}
      </Stack>
    </Stack>
  );
}
