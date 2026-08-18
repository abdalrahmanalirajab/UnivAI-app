"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
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
  PrivacyRequestStatus,
  PrivacyRequestType,
} from "@/lib/privacy";

const REQUEST_LABELS: Record<PrivacyRequestType, string> = {
  access: "Ask for a full search of my personal data",
  deletion: "Delete my account and personal data",
  correction: "Correct personal data",
  portability: "Ask for a portable copy of my data",
  restriction: "Restrict how my data is used",
  objection: "Object to a specific use of my data",
  sale_share_opt_out: "Opt out of sale or sharing",
  limit_sensitive_use: "Limit sensitive-data use",
};

const FORM_REQUEST_TYPES: PrivacyRequestType[] = [
  "access",
  "deletion",
  "correction",
  "portability",
  "restriction",
  "objection",
];

const REQUEST_HELP: Record<PrivacyRequestType, string> = {
  access:
    "Use the download above for an immediate account copy. Submit this only if you need a broader search across other UnivAI services.",
  deletion:
    "An administrator will verify your identity and check legal retention duties before deleting data across UnivAI services.",
  correction:
    "Tell us which information is wrong and what it should say. Basic name and phone details can be changed directly on your Profile.",
  portability:
    "Ask for data in a reusable format or for information held outside the self-service download.",
  restriction:
    "Tell us which use of your data you want paused or limited and why.",
  objection:
    "Tell us which specific use of your data you object to and why.",
  sale_share_opt_out:
    "Use the privacy choice above. It records your preference immediately, so a separate request is not needed.",
  limit_sensitive_use:
    "Use the privacy choice above. It records your preference immediately, so a separate request is not needed.",
};

const STATUS_LABELS: Record<PrivacyRequestStatus, string> = {
  received: "Received",
  identity_check: "Identity check",
  in_progress: "In progress",
  completed: "Completed",
  declined: "Could not complete",
  cancelled: "Cancelled",
};

const STATUS_COLORS = {
  received: "info",
  identity_check: "warning",
  in_progress: "warning",
  completed: "success",
  declined: "error",
  cancelled: "default",
} as const;

function isOpenRequest(status: PrivacyRequestStatus): boolean {
  return status === "received" || status === "identity_check" || status === "in_progress";
}

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
    setNotice(null);
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
      setNotice("Privacy choice saved.");
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
          ? "You already have an open request of this type."
          : "Request received. You can follow its status below.",
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not submit this request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack spacing={2.5} component="section" aria-labelledby="privacy-center-title">
      <Stack spacing={0.5}>
        <Typography variant="h4" component="h2" id="privacy-center-title">
          Privacy &amp; data
        </Typography>
        <Typography color="text.secondary">
          Download your information, choose how it may be used, or ask the privacy team for help.
        </Typography>
      </Stack>

      {notice ? <Alert severity="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}
      {error ? <Alert severity="error" action={<Button onClick={() => void load()}>Retry</Button>}>{error}</Alert> : null}

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Stack spacing={0.5}>
              <Typography variant="h6" component="h3">Your data and legal documents</Typography>
              <Typography variant="body2" color="text.secondary">
                Download a current copy of the account data UnivAI can provide automatically. The file is JSON and may include your profile, learning activity, grades, and account history.
              </Typography>
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button
                component="a"
                href="/api/privacy/export"
                download
                variant="contained"
                startIcon={<DownloadOutlined />}
              >
                Download my data
              </Button>
              <Button component={Link} href="/legal/privacy" variant="outlined">
                Read Privacy Notice
              </Button>
              <Button component={Link} href="/legal/eula" variant="outlined" startIcon={<GavelOutlined />}>
                Read EULA
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Stack spacing={0.5}>
              <Typography variant="h6" component="h3">Privacy choices</Typography>
              <Typography variant="body2" color="text.secondary">
                These choices save immediately. You do not need to submit a separate request.
              </Typography>
            </Stack>
            <Alert severity="info">
              UnivAI currently does not sell personal information or share it for cross-site advertising.
            </Alert>
            {!preferences ? (
              <CircularProgress size={28} aria-label="Loading privacy preferences" />
            ) : (
              <Stack spacing={1}>
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
                  label={
                    <Stack spacing={0.25}>
                      <Typography>Do not sell or share my personal information</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Records this choice now in case UnivAI’s processing changes later.
                      </Typography>
                    </Stack>
                  }
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
                  label={
                    <Stack spacing={0.25}>
                      <Typography>Use sensitive information only when needed</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Limits optional use or disclosure of sensitive details where this right applies.
                      </Typography>
                    </Stack>
                  }
                />
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Stack spacing={0.5}>
              <Typography variant="h6" component="h3">Ask the privacy team</Typography>
              <Typography variant="body2" color="text.secondary">
                Submit a request only when the self-service controls above do not solve what you need. An administrator will review it and post the outcome below.
              </Typography>
            </Stack>
            <TextField
              select
              label="What do you need?"
              value={requestType}
              onChange={(event) => setRequestType(event.target.value as PrivacyRequestType)}
            >
              {FORM_REQUEST_TYPES.map((type) => (
                <MenuItem value={type} key={type}>{REQUEST_LABELS[type]}</MenuItem>
              ))}
            </TextField>
            <Alert severity={requestType === "deletion" ? "warning" : "info"}>
              {REQUEST_HELP[requestType]}
            </Alert>
            <TextField
              label="Details"
              placeholder="Tell us exactly what you need."
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              multiline
              minRows={3}
              slotProps={{ htmlInput: { maxLength: 2000 } }}
              helperText={`${detail.length}/2,000 · Correction and objection requests need at least 10 characters.`}
            />
            <Button variant="contained" onClick={submitRequest} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit request"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Stack spacing={1.5} aria-live="polite">
        <Stack spacing={0.25}>
          <Typography variant="h5" component="h3">Request history</Typography>
          <Typography variant="body2" color="text.secondary">
            Completed requests show the administrator’s outcome here.
          </Typography>
        </Stack>
        {requests === null ? (
          <CircularProgress size={28} aria-label="Loading privacy requests" />
        ) : requests.length === 0 ? (
          <Card variant="outlined">
            <CardContent>
              <Typography color="text.secondary">You have not submitted a privacy request.</Typography>
            </CardContent>
          </Card>
        ) : (
          requests.map((request) => (
            <Card variant="outlined" key={request.id}>
              <CardContent>
                <Stack spacing={1.25}>
                  <Stack direction="row" spacing={1} className="privacy-request-heading">
                    <Typography variant="subtitle1">{REQUEST_LABELS[request.requestType]}</Typography>
                    <Chip
                      size="small"
                      color={STATUS_COLORS[request.status]}
                      label={STATUS_LABELS[request.status]}
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    Submitted {new Date(request.submittedAt).toLocaleString()}
                    {isOpenRequest(request.status)
                      ? ` · Response target ${new Date(request.dueAt).toLocaleDateString()}`
                      : request.completedAt
                        ? ` · Closed ${new Date(request.completedAt).toLocaleDateString()}`
                        : ""}
                  </Typography>
                  {request.detail ? <Typography variant="body2">{request.detail}</Typography> : null}
                  {request.adminNote ? (
                    <Alert severity={request.status === "declined" ? "warning" : request.status === "completed" ? "success" : "info"}>
                      <AlertTitle>{isOpenRequest(request.status) ? "Update from UnivAI" : "Outcome from UnivAI"}</AlertTitle>
                      {request.adminNote}
                    </Alert>
                  ) : null}
                  {request.status === "completed" && (request.requestType === "access" || request.requestType === "portability") ? (
                    <Button
                      component="a"
                      href="/api/privacy/export"
                      download
                      variant="outlined"
                      startIcon={<DownloadOutlined />}
                    >
                      Download current account data
                    </Button>
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
